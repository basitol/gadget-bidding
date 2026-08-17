import axios from 'axios';
import jwt from 'jsonwebtoken';
import config from '../../config';
import logger from '../../utils/logger';

const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';

export interface SocialIdentity {
  provider: 'google' | 'apple';
  providerUserId: string;
  email?: string;
  fullName?: string;
  avatarUrl?: string;
}

/**
 * Verify a Google ID token and return the verified identity.
 * The token must be issued for one of the configured client IDs.
 */
export const verifyGoogleIdToken = async (
  idToken: string
): Promise<SocialIdentity> => {
  const response = await axios.get(GOOGLE_TOKENINFO_URL, {
    params: { id_token: idToken },
    timeout: 10000,
  });

  const data = response.data as {
    aud?: string;
    sub?: string;
    email?: string;
    email_verified?: string;
    name?: string;
    picture?: string;
  };

  if (!data.sub) {
    throw new Error('Invalid Google ID token');
  }

  if (
    config.google.clientIds.length > 0 &&
    !config.google.clientIds.includes(data.aud || '')
  ) {
    throw new Error('Google token issued for an unknown client');
  }

  return {
    provider: 'google',
    providerUserId: data.sub,
    email: data.email && data.email_verified === 'true' ? data.email : undefined,
    fullName: data.name,
    avatarUrl: data.picture,
  };
};

interface ApplePublicKey {
  kty: string;
  kid: string;
  alg: string;
  n: string;
  e: string;
}

/**
 * Verify an Apple identity token (from Sign in with Apple).
 * Fetches Apple's public keys, validates the RS256 signature, then checks
 * issuer, audience and expiry.
 */
export const verifyAppleIdToken = async (
  idToken: string
): Promise<SocialIdentity> => {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
    throw new Error('Invalid Apple identity token');
  }

  const keysResponse = await axios.get(APPLE_KEYS_URL, { timeout: 10000 });
  const keys = (keysResponse.data as { keys: ApplePublicKey[] }).keys || [];
  const key = keys.find(k => k.kid === decoded.header.kid);

  if (!key) {
    throw new Error('Apple signing key not found');
  }

  const publicKey = `-----BEGIN PUBLIC KEY-----\n${jwtToPem(key.n, key.e)}\n-----END PUBLIC KEY-----`;

  let payload: any;
  try {
    payload = jwt.verify(idToken, publicKey, {
      algorithms: ['RS256'],
    }) as Record<string, any>;
  } catch (error) {
    throw new Error('Apple identity token signature invalid');
  }

  if (payload.iss !== APPLE_ISSUER) {
    throw new Error('Apple token issued by an unknown issuer');
  }

  if (
    config.apple.clientIds.length > 0 &&
    !config.apple.clientIds.includes(payload.aud)
  ) {
    throw new Error('Apple token issued for an unknown client');
  }

  return {
    provider: 'apple',
    providerUserId: payload.sub as string,
    email: payload.email as string | undefined,
  };
};

/** Convert an RSA JWK modulus/exponent pair to a PEM public key. */
function jwtToPem(n: string, e: string): string {
  const base64ToBytes = (base64: string): Uint8Array => {
    const b64 = base64.replace(/-/g, '+').replace(/_/g, '/');
    const binary = Buffer.from(b64, 'base64');
    return new Uint8Array(binary);
  };

  const modulus = base64ToBytes(n);
  const exponent = base64ToBytes(e);

  // ASN.1 DER encoding of an RSA public key (RSAPublicKey)
  const modulusLength = modulus.byteLength;
  const exponentLength = exponent.byteLength;

  const modulusHeader = buildLength(0x00); // leading 0x00 for positive integer
  const modulusData = [0x02, ...modulusHeader, ...modulus];
  const exponentData = [0x02, ...buildLength(exponentLength), ...exponent];
  const sequenceContent = [...modulusData, ...exponentData];
  const sequence = [0x30, ...buildLength(sequenceContent.length), ...sequenceContent];

  return Buffer.from(sequence).toString('base64');
}

function buildLength(length: number): number[] {
  if (length < 0x80) {
    return [length];
  }
  if (length < 0x100) {
    return [0x81, length];
  }
  return [0x82, (length >> 8) & 0xff, length & 0xff];
}
