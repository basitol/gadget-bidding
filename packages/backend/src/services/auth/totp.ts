import crypto from 'crypto';
import config from '../../config';
import logger from '../../utils/logger';

/**
 * Authenticator-app codes (RFC 6238 TOTP: SHA-1, 6 digits, 30 s steps) and
 * encryption of the stored secret. Node `crypto` only.
 */

export const TOTP_ISSUER = 'Gadgets Bidding';
const STEP_SECONDS = 30;
const DIGITS = 6;
/** Accept the code from one step either side, for phones whose clock drifts. */
const WINDOW = 1;

/* ---------------- base32 (RFC 4648, no padding) ---------------- */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const base32Encode = (buf: Buffer): string => {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
};

export const base32Decode = (input: string): Buffer => {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32 secret');
    value = ((value << 5) | idx) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
};

/* ---------------- TOTP ---------------- */

/** A fresh 20-byte (160-bit) secret, base32. */
export const generateTotpSecret = (): string => base32Encode(crypto.randomBytes(20));

export const currentStep = (nowMs: number = Date.now()) => Math.floor(nowMs / 1000 / STEP_SECONDS);

const hotp = (key: Buffer, counter: number): string => {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(msg).digest();
  const o = h[h.length - 1] & 0x0f;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
};

/** The code for a given step (tests and scripts use this too). */
export const totpCode = (secretB32: string, step: number = currentStep()): string =>
  hotp(base32Decode(secretB32), step);

/**
 * Check a code against the secret. Returns the matched step, or null.
 * `afterStep`: the last step already used; that code and older ones are refused (no replay).
 */
export const verifyTotp = (
  secretB32: string,
  code: string,
  opts: { afterStep?: number | null; nowMs?: number } = {}
): number | null => {
  if (!/^\d{6}$/.test(code)) return null;
  const key = base32Decode(secretB32);
  const now = currentStep(opts.nowMs);
  const given = Buffer.from(code);
  for (let delta = -WINDOW; delta <= WINDOW; delta++) {
    const step = now + delta;
    if (opts.afterStep != null && step <= opts.afterStep) continue;
    if (crypto.timingSafeEqual(Buffer.from(hotp(key, step)), given)) return step;
  }
  return null;
};

export const buildOtpAuthUri = (secretB32: string, account: string): string => {
  const label = `${encodeURIComponent(TOTP_ISSUER)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret: secretB32,
    issuer: TOTP_ISSUER,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  // URLSearchParams writes spaces as "+"; authenticator apps expect %20.
  return `otpauth://totp/${label}?${params.toString().replace(/\+/g, '%20')}`;
};

/* ---------------- Encryption at rest (AES-256-GCM) ---------------- */

const SALT = 'gadgets-bidding/two-factor';
let warnedFallback = false;

const deriveKey = (ikm: string, info: string) => Buffer.from(crypto.hkdfSync('sha256', ikm, SALT, info, 32));

/** First key encrypts; every key is tried to decrypt (so adding TWO_FACTOR_KEY later keeps old set-ups working). */
const keys = (): Buffer[] => {
  const list: Buffer[] = [];
  const own = process.env.TWO_FACTOR_KEY?.trim();
  if (own) list.push(deriveKey(own, 'totp-secret'));
  else if (config.isDeployed && !warnedFallback) {
    warnedFallback = true;
    logger.warn('TWO_FACTOR_KEY is not set; authenticator secrets are encrypted with a key derived from JWT_SECRET.');
  }
  list.push(deriveKey(config.jwt.secret, 'totp-secret-fallback'));
  return list;
};

const b64u = (b: Buffer) => b.toString('base64url');

export const encryptSecret = (plain: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keys()[0], iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1.${b64u(iv)}.${b64u(cipher.getAuthTag())}.${b64u(ct)}`;
};

export const decryptSecret = (stored: string): string | null => {
  const [v, iv, tag, ct] = stored.split('.');
  if (v !== 'v1' || !iv || !tag || !ct) return null;
  for (const key of keys()) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
      // wrong key; try the next one
    }
  }
  return null;
};

/* ---------------- What users.totp_secret holds ---------------- */

/**
 * users.totp_secret is one encrypted JSON blob:
 *   s  — the live secret (used at sign-in once the method is 'totp')
 *   ls — the last step a code was accepted for (stops a code being used twice)
 *   p  — a secret being set up, kept until the first code confirms it
 *   pt — when that set-up started (ms)
 * Setting up a new app never touches the live secret until it's confirmed.
 */
export interface TotpStore {
  s?: string;
  ls?: number;
  p?: string;
  pt?: number;
}

/** Set-ups older than this have to start again. */
export const PENDING_TOTP_MINUTES = 30;

export const readTotpStore = (stored: string | null | undefined): TotpStore => {
  if (!stored) return {};
  const plain = decryptSecret(stored);
  if (!plain) return {};
  try {
    const parsed = JSON.parse(plain);
    return parsed && typeof parsed === 'object' ? (parsed as TotpStore) : {};
  } catch {
    return {};
  }
};

export const writeTotpStore = (store: TotpStore): string | null => {
  const clean: TotpStore = {};
  if (store.s) clean.s = store.s;
  if (store.s && store.ls != null) clean.ls = store.ls;
  if (store.p) {
    clean.p = store.p;
    clean.pt = store.pt ?? Date.now();
  }
  return Object.keys(clean).length ? encryptSecret(JSON.stringify(clean)) : null;
};
