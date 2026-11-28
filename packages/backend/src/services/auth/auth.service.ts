import { randomUUID, timingSafeEqual } from 'crypto';
import prisma from '../../config/prisma';
import { Prisma } from '../../generated/prisma';
import { hashPassword, comparePassword } from '../../utils/password';
import { generateAccessToken, generateRefreshToken } from '../../utils/jwt';
import { generateOTP, getOTPExpiry, isOTPExpired } from '../../utils/otp';
import { sendOTPSMS } from '../notification/sms.service';
import { sendOTPEmail, sendPasswordResetEmail } from '../notification/email.service';
import config from '../../config';
import {
  User,
  UserRegistration,
  UserLogin,
  SocialLoginRequest,
  SocialProvider,
  AuthTokens,
  OTPVerification,
  roleForAccountType,
  assertAccountTypeAccess,
  normalizeUserRole,
  TwoFactorMethod,
} from '@gadget-bidding/shared';
import * as socialAuth from './socialAuth.service';
import { readTotpStore, verifyTotp, writeTotpStore } from './totp';
import { forgetTrustedDevices, hashDeviceId, isTrustedDevice, trustDevice } from './trustedDevices';
import logger from '../../utils/logger';

export const USER_SELECT: {
  id: true;
  phoneNumber: true;
  email: true;
  username: true;
  twoFactorEnabled: true;
  twoFactorMethod: true;
  fullName: true;
  avatarUrl: true;
  role: true;
  isVerified: true;
  isActive: true;
  businessName: true;
  cacNumber: true;
  sellerKybStatus: true;
  sellerKybRejectionReason: true;
  createdAt: true;
  updatedAt: true;
} = {
  id: true,
  phoneNumber: true,
  email: true,
  username: true,
  twoFactorEnabled: true,
  twoFactorMethod: true,
  fullName: true,
  avatarUrl: true,
  role: true,
  isVerified: true,
  isActive: true,
  businessName: true,
  cacNumber: true,
  sellerKybStatus: true,
  sellerKybRejectionReason: true,
  createdAt: true,
  updatedAt: true,
};

export const toPublicUser = (user: Record<string, any>): User =>
  ({
    id: user.id,
    phone_number: user.phoneNumber,
    email: user.email || undefined,
    username: user.username || undefined,
    two_factor_enabled: user.twoFactorEnabled ?? false,
    // Older accounts with 2-step on have no method saved: that's the emailed code.
    two_factor_method: user.twoFactorEnabled ? ((user.twoFactorMethod as TwoFactorMethod | null) ?? 'email') : null,
    full_name: user.fullName,
    avatar_url: user.avatarUrl || undefined,
    role: normalizeUserRole(user.role),
    is_verified: user.isVerified || false,
    is_active: user.isActive || true,
    business_name: user.businessName || undefined,
    cac_number: user.cacNumber || undefined,
    seller_kyb_status: user.sellerKybStatus || 'not_started',
    seller_kyb_rejection_reason: user.sellerKybRejectionReason || undefined,
    created_at: user.createdAt?.toISOString() || new Date().toISOString(),
    updated_at: user.updatedAt?.toISOString() || new Date().toISOString(),
  } as unknown as User);

/**
 * Generate an access + refresh token pair for a user and persist the refresh
 * token so the session survives app restarts.
 */
export async function issueTokensForUser(
  user: Record<string, any>,
  db: Pick<typeof prisma, 'refreshToken'> = prisma
) {
  const tokenPayload = {
    user_id: user.id,
    phone_number: user.phoneNumber,
    role: normalizeUserRole(user.role),
    full_name: user.fullName,
  };

  const access_token = generateAccessToken(tokenPayload);
  const refresh_token = generateRefreshToken(tokenPayload);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await db.refreshToken.create({
    data: {
      userId: user.id,
      token: refresh_token,
      expiresAt,
    },
  });

  return { access_token, refresh_token };
}

/**
 * Register a new user
 */
export const registerUser = async (
  data: UserRegistration
): Promise<{ user: User; verification_id: string }> => {
  return prisma.$transaction(async tx => {
    if (data.accepted_terms !== true) {
      throw new Error(
        'You must accept the Terms of Service and Privacy Policy to create an account'
      );
    }

    // Check if user already exists
    const existingUser = await tx.user.findFirst({
      where: {
        OR: [
          { phoneNumber: data.phone_number },
          ...(data.email ? [{ email: data.email }] : []),
        ],
      },
    });

    if (existingUser) {
      throw new Error('User with this phone number or email already exists');
    }

    // Hash password
    const passwordHash = await hashPassword(data.password);

    // Create user with wallet
    const user = await tx.user.create({
      data: {
        phoneNumber: data.phone_number,
        email: data.email || null,
        fullName: data.full_name,
        passwordHash,
        role: roleForAccountType(data.account_type),
        acceptedTermsAt: new Date(),
        wallet: {
          create: {
            balance: 0,
            currency: 'NGN',
          },
        },
      },
      select: USER_SELECT,
    });

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = getOTPExpiry(config.otpExpiryMinutes);

    // Store verification code
    const verification = await tx.userVerification.create({
      data: {
        userId: user.id,
        verificationType: 'phone',
        verificationCode: otp,
        expiresAt,
      },
    });

    // Send OTP via email when available, otherwise SMS (don't block on this)
    if (user.email) {
      sendOTPEmail(user.email, otp).catch(err => {
        logger.error('Failed to send OTP email:', err);
      });
    } else {
      sendOTPSMS(user.phoneNumber, otp).catch(err => {
        logger.error('Failed to send OTP SMS:', err);
      });
    }

    if (config.nodeEnv === 'development') {
      logger.info(`[DEV] OTP for ${data.phone_number}: ${otp}`);
    }

    logger.info(`User registered: ${user.id} (${user.phoneNumber})`);

    // Transform to match expected User type
    const transformedUser = {
      id: user.id,
      phone_number: user.phoneNumber,
      email: user.email || undefined,
      full_name: user.fullName,
      avatar_url: user.avatarUrl || undefined,
      role: normalizeUserRole(user.role),
      is_verified: user.isVerified || false,
      is_active: user.isActive || true,
      created_at: user.createdAt?.toISOString() || new Date().toISOString(),
      updated_at: user.updatedAt?.toISOString() || new Date().toISOString(),
    } as unknown as User;

    return { user: transformedUser, verification_id: verification.id };
  });
};

/**
 * Verify OTP
 */
export const verifyOTP = async (data: OTPVerification): Promise<AuthTokens> => {
  return prisma.$transaction(async tx => {
    // Get verification record with user
    const verification = await tx.userVerification.findFirst({
      where: {
        id: data.verification_id,
        isVerified: false,
      },
      include: {
        user: true,
      },
    });

    if (!verification || !verification.user) {
      throw new Error('Invalid or already used verification code');
    }

    // Check if OTP matches
    if (verification.verificationCode !== data.otp) {
      throw new Error('Invalid OTP code');
    }

    // Check if OTP is expired
    if (
      verification.expiresAt &&
      isOTPExpired(new Date(verification.expiresAt))
    ) {
      throw new Error('OTP has expired. Please request a new one');
    }

    // Mark verification as complete and user as verified
    await tx.userVerification.update({
      where: { id: data.verification_id },
      data: { isVerified: true },
    });

    const updatedUser = await tx.user.update({
      where: { id: verification.user.id },
      data: { isVerified: true },
      select: USER_SELECT,
    });

    // Generate tokens
    const tokenPayload = {
      user_id: updatedUser.id,
      phone_number: updatedUser.phoneNumber,
      role: normalizeUserRole(updatedUser.role),
      full_name: updatedUser.fullName,
    };

    const access_token = generateAccessToken(tokenPayload);
    const refresh_token = generateRefreshToken(tokenPayload);

    // Store refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await tx.refreshToken.create({
      data: {
        userId: updatedUser.id,
        token: refresh_token,
        expiresAt,
      },
    });

    logger.info(
      `User verified: ${updatedUser.id} (${updatedUser.phoneNumber})`
    );

    // Transform to match expected User type
    const transformedUser = {
      id: updatedUser.id,
      phone_number: updatedUser.phoneNumber,
      email: updatedUser.email || undefined,
      full_name: updatedUser.fullName,
      avatar_url: updatedUser.avatarUrl || undefined,
      role: normalizeUserRole(updatedUser.role),
      is_verified: updatedUser.isVerified || false,
      is_active: updatedUser.isActive || true,
      created_at:
        updatedUser.createdAt?.toISOString() || new Date().toISOString(),
      updated_at:
        updatedUser.updatedAt?.toISOString() || new Date().toISOString(),
    } as unknown as User;

    return { access_token, refresh_token, user: transformedUser };
  });
};

/**
 * Login user with an email address or phone number
 */
export const loginUser = async (
  data: UserLogin & { device_id?: string; device_label?: string }
): Promise<AuthTokens> => {
  const identifier = data.identifier.trim();

  // Find user by email (case-insensitive) or phone number
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { phoneNumber: identifier },
        ...(identifier.includes('@')
          ? [{ email: { equals: identifier, mode: 'insensitive' as const } }]
          : []),
      ],
    },
  });

  if (!user) {
    throw new Error('Invalid email/phone number or password');
  }

  // Verify password (before saying anything about the account, so a wrong password learns nothing)
  const isPasswordValid = await comparePassword(
    data.password,
    user.passwordHash
  );

  if (!isPasswordValid) {
    throw new Error('Invalid email/phone number or password');
  }

  // Switched off. Team members see who paused them, when and why.
  if (!user.isActive) {
    if (user.role === 'admin') throw new AccountPausedError(await pauseDetailsFor(user));
    // Suspended by our team: say until when, and how to appeal.
    const suspension = await prisma.accountRestriction.findFirst({
      where: { userId: user.id, kind: 'suspend', status: 'active' },
      select: { until: true },
    });
    if (suspension) {
      const until = suspension.until
        ? ` until ${suspension.until.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Africa/Lagos' })}`
        : '';
      throw new Error(`Your account is suspended${until}. Check your email for why, or reply to it to appeal.`);
    }
    throw new Error('Account has been deactivated. Please contact support');
  }

  // A seller who closed their store can't log in (they're still paid what's due). Our team reopens it.
  if (user.storeClosedAt) {
    throw new Error('This store is closed. Contact us to reopen it.');
  }

  // Check if user is verified
  if (!user.isVerified) {
    throw new Error('Please verify your account first');
  }

  assertAccountTypeAccess(data.account_type, user.role);
  await assertStaffOnTeam(user);

  // 2-step sign-in: password was right; now ask for a code, unless this phone already passed.
  const method = liveTwoFactorMethod(user);
  if (method) {
    const deviceHash = data.device_id ? hashDeviceId(data.device_id) : undefined;
    if (!deviceHash || !(await isTrustedDevice(user.id, deviceHash))) {
      return (await startTwoFactorChallenge(user, method, deviceHash, data.device_label)) as unknown as AuthTokens;
    }
  }

  const { access_token, refresh_token } = await issueTokensForUser(user);

  logger.info(`User logged in: ${user.id} (${user.phoneNumber})`);

  return { access_token, refresh_token, user: toPublicUser(user) };
};

/** A paused team account: when, and the reason the admin who paused it gave. */
export type PauseDetails = { email: string | null; paused_at: string | null; reason: string | null };

export class AccountPausedError extends Error {
  readonly code = 'ADMIN_PAUSED';
  constructor(public details: PauseDetails) {
    super('Your admin access is paused.');
  }
}

/** From the audit log entry that switched the account off (PATCH /admin/users/:id with a reason). */
export const pauseDetailsFor = async (user: { id: string; email: string | null }): Promise<PauseDetails> => {
  const entry = await prisma.auditLog.findFirst({
    where: { action: 'user_update', resourceType: 'user', resourceId: user.id, changes: { path: ['is_active'], equals: false } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, changes: true },
  });
  const changes = (entry?.changes ?? {}) as { reason?: unknown };
  return {
    email: user.email,
    paused_at: entry?.createdAt?.toISOString() ?? null,
    reason: typeof changes.reason === 'string' ? changes.reason : null,
  };
};

/** Store staff sign in only while they're on a team and the store is open. */
const assertStaffOnTeam = async (user: { id: string; role: string }) => {
  if (user.role !== 'staff') return;
  const team = await prisma.storeStaff.findUnique({
    where: { userId: user.id },
    select: { seller: { select: { storeClosedAt: true } } },
  });
  if (!team) throw new Error("You're no longer on a store team. Ask the store owner to add you again.");
  if (team.seller.storeClosedAt) throw new Error('This store is closed, so staff sign-in is off.');
};

/* ---------------- 2-step sign-in ---------------- */

/*
 * Methods: 'email' (emailed code), 'totp' (authenticator app), 'sms' (texted code).
 * A sign-in challenge is a user_verifications row (the DB only allows type
 * phone | email | kyc, so every challenge uses 'email'); its target says how to check it:
 *   "login"                                  — emailed code, rows from before methods existed
 *   "login|<method>|<device hash>|<label>"   — device hash/label are empty when the app sent none
 */
const TWO_FACTOR = 'email';
const LOGIN_TARGET = 'login';
const LOGIN_ROWS = { OR: [{ target: LOGIN_TARGET }, { target: { startsWith: `${LOGIN_TARGET}|` } }] };
const SIGN_IN_EXPIRED = 'This sign-in has expired. Log in again.';
const CODE_MISMATCH = "That code didn't match. Try again.";

const loginTarget = (method: TwoFactorMethod, deviceHash?: string, label?: string) =>
  [LOGIN_TARGET, method, deviceHash ?? '', (label ?? '').replace(/\|/g, ' ').trim().slice(0, 60)].join('|');

const parseLoginTarget = (target: string): { method: TwoFactorMethod; deviceHash?: string; label?: string } => {
  if (target === LOGIN_TARGET) return { method: 'email' };
  const [, method, deviceHash, ...label] = target.split('|');
  return { method: method as TwoFactorMethod, deviceHash: deviceHash || undefined, label: label.join('|') || undefined };
};

const sameCode = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const maskEmail = (email: string) => {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(1, name.length - 2))}@${domain}`;
};

/** "+2348031234521" / "08031234521" / "2348031234521" → "+2348031234521" (Nigerian numbers without a code get +234). */
export const toE164Phone = (phone: string) => {
  const p = phone.replace(/[^\d+]/g, '');
  if (p.startsWith('+')) return p;
  if (p.startsWith('234')) return `+${p}`;
  return `+234${p.startsWith('0') ? p.slice(1) : p}`;
};

/** "0803 ••• 4521" */
export const maskPhone = (phone: string) => {
  const e164 = toE164Phone(phone);
  const local = e164.startsWith('+234') ? `0${e164.slice(4)}` : e164;
  return local.length < 8 ? '•••' : `${local.slice(0, 4)} ••• ${local.slice(-4)}`;
};

type TwoFactorUser = {
  id: string;
  email: string | null;
  twoFactorEnabled: boolean;
  twoFactorMethod: string | null;
  totpSecret: string | null;
  twoFactorPhone: string | null;
};

/** What sign-in asks for, or null when 2-step is off. */
const liveTwoFactorMethod = (user: TwoFactorUser): TwoFactorMethod | null => {
  if (!user.twoFactorEnabled) return null;
  const method = (user.twoFactorMethod ?? 'email') as TwoFactorMethod;
  if (method === 'totp' && readTotpStore(user.totpSecret).s) return 'totp';
  if (method === 'sms' && user.twoFactorPhone) return 'sms';
  // Older email set-ups never asked when the account had no email.
  if (method === 'email') return user.email ? 'email' : null;
  // An app or text set-up we can't use: fall back to the email code rather than let anyone in.
  if (user.email) return 'email';
  throw new Error("We couldn't check your 2-step sign-in. Contact support and we'll sort it out.");
};

const startTwoFactorChallenge = async (
  user: TwoFactorUser,
  method: TwoFactorMethod,
  deviceHash?: string,
  deviceLabel?: string
) => {
  // Only the newest challenge counts.
  await prisma.userVerification.deleteMany({
    where: { userId: user.id, verificationType: TWO_FACTOR, isVerified: false, ...LOGIN_ROWS },
  });
  // The authenticator app makes its own codes; nothing to send.
  const otp = method === 'totp' ? null : generateOTP();
  const v = await prisma.userVerification.create({
    data: {
      userId: user.id,
      verificationType: TWO_FACTOR,
      verificationCode: otp,
      target: loginTarget(method, deviceHash, deviceLabel),
      expiresAt: getOTPExpiry(config.otpExpiryMinutes),
    },
  });
  const challenge = { two_factor_required: true as const, method, verification_id: v.id };

  if (method === 'email') {
    sendOTPEmail(user.email!, otp!).catch(err => logger.error('Failed to send sign-in code:', err));
    if (config.nodeEnv === 'development') logger.info(`[DEV] Sign-in code for ${user.email}: ${otp}`);
    return { ...challenge, email_hint: maskEmail(user.email!) };
  }
  if (method === 'sms') {
    sendOTPSMS(user.twoFactorPhone!, otp!).catch(err => logger.error('Failed to text sign-in code:', err));
    if (config.nodeEnv === 'development') logger.info(`[DEV] Sign-in code for user ${user.id}: ${otp}`);
    return { ...challenge, phone_hint: maskPhone(user.twoFactorPhone!) };
  }
  return challenge;
};

export const completeTwoFactorLogin = async (data: {
  verification_id: string;
  otp: string;
  account_type?: 'buyer' | 'seller';
  device_id?: string;
  device_label?: string;
}): Promise<AuthTokens> => {
  const v = await prisma.userVerification.findFirst({
    where: { id: data.verification_id, verificationType: TWO_FACTOR, ...LOGIN_ROWS },
    include: { user: true },
  });
  if (!v || !v.user || !v.target || v.isVerified) throw new Error(SIGN_IN_EXPIRED);
  if (!v.expiresAt || isOTPExpired(v.expiresAt)) throw new Error('That code has expired. Log in again.');
  const user = v.user;
  const challenge = parseLoginTarget(v.target);

  // The method changed since the code was asked for (e.g. 2-step was reset on another phone).
  let method: TwoFactorMethod | null = null;
  try {
    method = liveTwoFactorMethod(user);
  } catch {
    method = null;
  }
  if (challenge.method !== method) throw new Error(SIGN_IN_EXPIRED);

  if (method === 'totp') {
    const store = readTotpStore(user.totpSecret);
    const step = verifyTotp(store.s!, data.otp, { afterStep: store.ls });
    if (step === null) {
      if (verifyTotp(store.s!, data.otp) !== null) {
        throw new Error('That code was just used. Wait for a new one in your app and try again.');
      }
      throw new Error(CODE_MISMATCH);
    }
    // Remember the step so the same code can't be used twice; the where clause loses a race cleanly.
    const saved = await prisma.user.updateMany({
      where: { id: user.id, totpSecret: user.totpSecret },
      data: { totpSecret: writeTotpStore({ ...store, ls: step }) },
    });
    if (!saved.count) throw new Error('That code was just used. Wait for a new one in your app and try again.');
  } else if (!v.verificationCode || !sameCode(v.verificationCode, data.otp)) {
    throw new Error(CODE_MISMATCH);
  }
  assertAccountTypeAccess(data.account_type, user.role);

  const spent = await prisma.userVerification.deleteMany({ where: { id: v.id } });
  if (!spent.count) throw new Error(SIGN_IN_EXPIRED);

  // Trust the phone that asked for the code, so it isn't asked again.
  const sameDevice = !data.device_id || hashDeviceId(data.device_id) === challenge.deviceHash;
  if (challenge.deviceHash && sameDevice) {
    await trustDevice(user.id, challenge.deviceHash, data.device_label?.trim().slice(0, 100) || challenge.label);
  }

  const { access_token, refresh_token } = await issueTokensForUser(user);
  logger.info(`User logged in with 2-step (${method}): ${user.id}`);
  return { access_token, refresh_token, user: toPublicUser(user) };
};

/** PUT /auth/2fa: the emailed code on or off (buyer Security screen). Off clears every method. */
export const setTwoFactor = async (userId: string, enabled: boolean, password: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('Account not found');
  if (!(await comparePassword(password, user.passwordHash))) throw new Error('That password is wrong');
  if (enabled && !user.email) throw new Error('Add an email to your account first');

  const was = user.twoFactorEnabled ? user.twoFactorMethod ?? 'email' : null;
  const next: TwoFactorMethod | null = enabled ? 'email' : null;
  // Turning off, or moving from the app / text method to email, drops the old secret and phone,
  // and phones trusted under the old method have to pass again.
  const reset = !enabled || was !== next;
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: enabled,
        twoFactorMethod: next,
        ...(reset ? { totpSecret: null, twoFactorPhone: null } : {}),
      },
    }),
    ...(reset ? [forgetTrustedDevices(userId)] : []),
  ]);
  return { two_factor_enabled: enabled, two_factor_method: next };
};

/**
 * Refresh access token.
 *
 * Keep the refresh token stable for mobile sessions. The app can refresh from
 * API calls and socket reconnects at the same time; rotating on every refresh
 * creates a race where one request revokes the token while the other is still
 * using it, which forces the mobile client to clear auth.
 */
export const refreshAccessToken = async (
  refreshToken: string
): Promise<{ access_token: string; refresh_token: string }> => {
  // Verify refresh token exists and is not revoked
  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: true },
  });

  if (!tokenRecord || tokenRecord.isRevoked || !tokenRecord.user) {
    throw new Error('Invalid or revoked refresh token');
  }

  // Check if token is expired
  if (new Date() > new Date(tokenRecord.expiresAt)) {
    throw new Error('Refresh token has expired. Please login again');
  }

  const user = tokenRecord.user;

  // Generate new access token
  const access_token = generateAccessToken({
    user_id: user.id,
    phone_number: user.phoneNumber,
    role: normalizeUserRole(user.role),
    full_name: user.fullName,
  });

  return { access_token, refresh_token: refreshToken };
};

/**
 * Logout user (revoke refresh token)
 */
export const logoutUser = async (refreshToken: string): Promise<void> => {
  await prisma.refreshToken.updateMany({
    where: { token: refreshToken },
    data: { isRevoked: true },
  });

  logger.info('User logged out');
};

/**
 * Resend OTP
 */
export const resendOTP = async (
  identifier: string
): Promise<{ verification_id: string; phone_number: string; email?: string }> => {
  return prisma.$transaction(async tx => {
    // Accept a phone number or an email, same as login — a user who signed
    // up with both shouldn't be stuck if they only remember one.
    const user = await tx.user.findFirst({
      where: {
        OR: [
          { phoneNumber: identifier },
          { email: { equals: identifier, mode: 'insensitive' } },
        ],
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.isVerified) {
      throw new Error('This account is already verified');
    }

    // Generate new OTP
    const otp = generateOTP();
    const expiresAt = getOTPExpiry(config.otpExpiryMinutes);

    // Store new verification code
    const verification = await tx.userVerification.create({
      data: {
        userId: user.id,
        verificationType: 'phone',
        verificationCode: otp,
        expiresAt,
      },
    });

    // Send OTP via email when available, otherwise SMS (don't block on this)
    if (user.email) {
      sendOTPEmail(user.email, otp).catch(err => {
        logger.error('Failed to send OTP email:', err);
      });
    } else {
      sendOTPSMS(user.phoneNumber, otp).catch(err => {
        logger.error('Failed to send OTP SMS:', err);
      });
    }

    if (config.nodeEnv === 'development') {
      logger.info(`[DEV] OTP for ${identifier}: ${otp}`);
    }

    logger.info(`OTP resent to: ${identifier}`);

    return {
      verification_id: verification.id,
      phone_number: user.phoneNumber,
      email: user.email || undefined,
    };
  });
};

/** Reserve a phone-number space that can never collide with real (+234) numbers. */
const SYNTHETIC_PHONE_PREFIX = '+9';

export const makeSyntheticPhone = async (): Promise<string> => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const digits = Array.from({ length: 12 }, () =>
      Math.floor(Math.random() * 10)
    ).join('');
    const candidate = `${SYNTHETIC_PHONE_PREFIX}${digits}`; // +9 + 12 digits = 14 chars
    const existing = await prisma.user.findUnique({
      where: { phoneNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new Error('Unable to allocate a phone number for this account');
};

/**
 * Sign in (or sign up) with a Google/Apple identity token.
 *
 * - Existing social account -> login as that user
 * - No social account but email matches an existing user -> link the provider
 *   and login (keeps wallet, bids, and orders on the same account)
 * - Otherwise create a new verified user with a synthetic phone number
 */
export const socialLogin = async (
  data: SocialLoginRequest
): Promise<AuthTokens> => {
  const identity =
    data.provider === 'apple'
      ? await socialAuth.verifyAppleIdToken(data.id_token)
      : await socialAuth.verifyGoogleIdToken(data.id_token);

  const provider: SocialProvider = data.provider;
  const providerUserId = identity.providerUserId;

  try {
    return await runSocialLoginTransaction(data, provider, providerUserId, identity);
  } catch (error: any) {
    // Two concurrent sign-ins for the same identity (e.g. a client sending
    // the request twice) can both pass the "no existing link" check and
    // then race to create the same social_accounts row. Rather than fail
    // the loser, treat it as a successful login for the account the winner
    // just created/linked.
    if (error?.code === 'P2002') {
      const existing = await prisma.socialAccount.findUnique({
        where: { provider_providerUserId: { provider, providerUserId } },
        include: { user: true },
      });
      if (existing?.user) {
        assertAccountTypeAccess(data.account_type, existing.user.role);
        const { access_token, refresh_token } = await issueTokensForUser(
          existing.user
        );
        return {
          access_token,
          refresh_token,
          user: toPublicUser(existing.user),
        };
      }
    }
    throw error;
  }
};

async function runSocialLoginTransaction(
  data: SocialLoginRequest,
  provider: SocialProvider,
  providerUserId: string,
  identity: socialAuth.SocialIdentity
): Promise<AuthTokens> {
  return prisma.$transaction(async tx => {
    const existing = await tx.socialAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider,
          providerUserId,
        },
      },
      include: { user: true },
    });

    type UserRecord = Record<string, any>;
    let user: UserRecord | null = existing?.user ?? null;

    if (!user && identity.email) {
      const emailMatch = await tx.user.findFirst({
        where: { email: { equals: identity.email, mode: 'insensitive' } },
      });
      if (emailMatch) {
        user = emailMatch;
        await tx.socialAccount.create({
          data: { userId: emailMatch.id, provider, providerUserId, email: identity.email },
        });
      }
    }

    if (!user) {
      if (data.accepted_terms !== true) {
        throw new Error(
          'You must accept the Terms of Service and Privacy Policy to create an account'
        );
      }

      const phoneNumber = await makeSyntheticPhone();
      const randomPassword = await hashPassword(
        `${providerUserId}${Date.now()}${Math.random()}`
      );
      user = await tx.user.create({
        data: {
          phoneNumber,
          email: identity.email || null,
          fullName:
            identity.fullName?.trim() ||
            (identity.email
              ? identity.email.split('@')[0].replace(/[._-]+/g, ' ').trim()
              : 'Gadgets Bidding User'),
          passwordHash: randomPassword,
          avatarUrl: identity.avatarUrl || null,
          role: roleForAccountType(data.account_type),
          isVerified: true,
          acceptedTermsAt: new Date(),
          wallet: { create: { balance: 0, currency: 'NGN' } },
          socialAccounts: {
            create: {
              provider,
              providerUserId,
              email: identity.email || null,
            },
          },
        },
        select: USER_SELECT,
      });
    }

    assertAccountTypeAccess(data.account_type, user.role);

    const { access_token, refresh_token } = await issueTokensForUser(user, tx);

    logger.info(`User signed in with ${provider}: ${user.id}`);

    return { access_token, refresh_token, user: toPublicUser(user) };
  });
}

/* ------------------------------------------------------------------ */
/* Email-first buyer sign-up                                           */
/* 1. startEmailSignup   → emails a 6-digit code, returns verification_id */
/* 2. verifyEmailSignup  → checks the code                              */
/* 3. completeEmailSignup → creates the account and signs the user in   */
/* ------------------------------------------------------------------ */

// Pre-account checks: type 'email' with no user attached (the DB only allows phone | email | kyc).
const SIGNUP_EMAIL = 'email';
/** After the code is confirmed, the user has this long to finish the remaining steps. */
const SIGNUP_COMPLETE_WINDOW_MINUTES = 60;
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const emailTaken = async (email: string) =>
  !!(await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  }));

export const startEmailSignup = async (
  rawEmail: string
): Promise<{ verification_id: string; email: string; expires_in: number }> => {
  const email = normalizeEmail(rawEmail);
  if (await emailTaken(email)) {
    throw new Error('An account with this email already exists. Log in instead.');
  }
  return issueSignupCode(email);
};

/**
 * Email a 6-digit code to confirm an address before an account is made for it. The caller decides
 * who may use the address (sign-up: nobody has it; store staff: they were invited with it).
 * Confirm with verifyEmailSignup / resendEmailSignup.
 */
export const issueSignupCode = async (
  email: string
): Promise<{ verification_id: string; email: string; expires_in: number }> => {
  const otp = generateOTP();
  const verification = await prisma.userVerification.create({
    data: {
      verificationType: SIGNUP_EMAIL,
      verificationCode: otp,
      target: email,
      expiresAt: getOTPExpiry(config.otpExpiryMinutes),
    },
  });

  sendOTPEmail(email, otp).catch(err => logger.error('Failed to send sign-up email code:', err));
  if (config.nodeEnv === 'development') {
    logger.info(`[DEV] Sign-up code for ${email}: ${otp}`);
  }

  return {
    verification_id: verification.id,
    email,
    expires_in: config.otpExpiryMinutes * 60,
  };
};

const findSignupVerification = async (verification_id: string) => {
  const v = await prisma.userVerification.findFirst({
    where: { id: verification_id, verificationType: SIGNUP_EMAIL, userId: null },
  });
  if (!v || !v.target) throw new Error('This sign-up has expired. Start again.');
  return v;
};

export const verifyEmailSignup = async (data: {
  verification_id: string;
  otp: string;
}): Promise<{ verification_id: string; email: string }> => {
  const v = await findSignupVerification(data.verification_id);
  if (v.isVerified) return { verification_id: v.id, email: v.target! };
  if (!v.expiresAt || isOTPExpired(v.expiresAt)) {
    throw new Error('That code has expired. Send a new one.');
  }
  if (v.verificationCode !== data.otp) {
    throw new Error("That code isn't right. Check it and try again.");
  }

  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + SIGNUP_COMPLETE_WINDOW_MINUTES);
  await prisma.userVerification.update({
    where: { id: v.id },
    data: { isVerified: true, expiresAt },
  });
  return { verification_id: v.id, email: v.target! };
};

export const resendEmailSignup = async (verification_id: string) => {
  const v = await findSignupVerification(verification_id);
  if (v.isVerified) throw new Error('This email is already confirmed.');
  const otp = generateOTP();
  await prisma.userVerification.update({
    where: { id: v.id },
    data: { verificationCode: otp, expiresAt: getOTPExpiry(config.otpExpiryMinutes) },
  });
  sendOTPEmail(v.target!, otp).catch(err => logger.error('Failed to resend sign-up email code:', err));
  if (config.nodeEnv === 'development') {
    logger.info(`[DEV] Sign-up code for ${v.target}: ${otp}`);
  }
  return { verification_id: v.id, expires_in: config.otpExpiryMinutes * 60 };
};

export const isUsernameAvailable = async (raw: string): Promise<boolean> => {
  const username = raw.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) return false;
  const existing = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  return !existing;
};

export const completeEmailSignup = async (data: {
  verification_id: string;
  password: string;
  first_name: string;
  last_name: string;
  username: string;
  interests?: { categories?: string[]; budget?: string };
  accepted_terms: boolean;
}): Promise<AuthTokens> => {
  if (data.accepted_terms !== true) {
    throw new Error('You must accept the Terms of Service and Privacy Policy to create an account');
  }
  const username = data.username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error('Usernames are 3–20 letters, numbers or _');
  }

  return prisma.$transaction(async tx => {
    const v = await tx.userVerification.findFirst({
      where: { id: data.verification_id, verificationType: SIGNUP_EMAIL, userId: null },
    });
    if (!v || !v.target || !v.isVerified) {
      throw new Error('Confirm your email before creating your account.');
    }
    if (!v.expiresAt || isOTPExpired(v.expiresAt)) {
      throw new Error('This sign-up has expired. Start again.');
    }
    const email = v.target;

    const clash = await tx.user.findFirst({
      where: {
        OR: [{ email: { equals: email, mode: 'insensitive' } }, { username }],
      },
      select: { email: true, username: true },
    });
    if (clash?.username === username) throw new Error('That username is taken. Try another.');
    if (clash) throw new Error('An account with this email already exists. Log in instead.');

    const interests = data.interests
      ? {
          categories: (data.interests.categories ?? []).slice(0, 12).map(String),
          budget: data.interests.budget ? String(data.interests.budget) : null,
        }
      : undefined;

    const user = await tx.user.create({
      data: {
        // Phone is collected later (checkout / KYB); reserve a non-routable placeholder.
        phoneNumber: await makeSyntheticPhone(),
        email,
        username,
        fullName: `${data.first_name.trim()} ${data.last_name.trim()}`.trim(),
        passwordHash: await hashPassword(data.password),
        role: roleForAccountType('buyer'),
        isVerified: true,
        acceptedTermsAt: new Date(),
        interests,
        wallet: { create: { balance: 0, currency: 'NGN' } },
      },
      select: USER_SELECT,
    });

    // The check is spent; it can't be reused for another account.
    await tx.userVerification.delete({ where: { id: v.id } });

    const { access_token, refresh_token } = await issueTokensForUser(user, tx);
    logger.info(`User signed up with email: ${user.id}`);
    return { access_token, refresh_token, user: toPublicUser(user) } as AuthTokens;
  });
};

/** The signed-in user's public profile, fresh from the database. */
export const getPublicUser = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT });
  return user ? toPublicUser(user) : null;
};

/* ------------------------------------------------------------------ */
/* Password reset                                                      */
/* 1. startPasswordReset    → emails a 6-digit code                     */
/* 2. verifyPasswordReset   → checks the code                           */
/* 3. completePasswordReset → sets the new password, signs out sessions */
/* The response never says whether the email has an account.           */
/* ------------------------------------------------------------------ */

// Type 'email' (the DB only allows phone | email | kyc), tied to the user, target marks the purpose.
const RESET_TARGET = 'password_reset';
/** After the code is confirmed, the user has this long to choose a new password. */
const RESET_COMPLETE_WINDOW_MINUTES = 15;

const findResetVerification = async (verification_id: string) => {
  const v = await prisma.userVerification.findFirst({
    where: { id: verification_id, verificationType: SIGNUP_EMAIL, target: RESET_TARGET },
    include: { user: { select: { id: true, email: true } } },
  });
  return v?.user ? v : null;
};

export const startPasswordReset = async (
  rawEmail: string
): Promise<{ verification_id: string; expires_in: number }> => {
  const email = normalizeEmail(rawEmail);
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, email: true },
  });
  const expires_in = config.otpExpiryMinutes * 60;
  // Unknown email: answer exactly as if it worked, so nobody can probe for accounts.
  if (!user?.email) return { verification_id: randomUUID(), expires_in };

  const otp = generateOTP();
  await prisma.userVerification.deleteMany({
    where: { userId: user.id, verificationType: SIGNUP_EMAIL, target: RESET_TARGET },
  });
  const v = await prisma.userVerification.create({
    data: {
      userId: user.id,
      verificationType: SIGNUP_EMAIL,
      verificationCode: otp,
      target: RESET_TARGET,
      expiresAt: getOTPExpiry(config.otpExpiryMinutes),
    },
  });
  sendPasswordResetEmail(user.email, otp).catch(err => logger.error('Failed to send reset code:', err));
  if (config.nodeEnv === 'development') logger.info(`[DEV] Password reset code for ${user.email}: ${otp}`);
  return { verification_id: v.id, expires_in };
};

export const verifyPasswordReset = async (data: {
  verification_id: string;
  otp: string;
}): Promise<{ verification_id: string }> => {
  const v = await findResetVerification(data.verification_id);
  if (!v) throw new Error("That code isn't right. Check it and try again.");
  if (v.isVerified) return { verification_id: v.id };
  if (!v.expiresAt || isOTPExpired(v.expiresAt)) throw new Error('That code has expired. Send a new one.');
  if (v.verificationCode !== data.otp) throw new Error("That code isn't right. Check it and try again.");

  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + RESET_COMPLETE_WINDOW_MINUTES);
  await prisma.userVerification.update({ where: { id: v.id }, data: { isVerified: true, expiresAt } });
  return { verification_id: v.id };
};

export const resendPasswordReset = async (verification_id: string) => {
  const expires_in = config.otpExpiryMinutes * 60;
  const v = await findResetVerification(verification_id);
  // Unknown session (or unknown email at step 1): same answer, nothing sent.
  if (!v || v.isVerified || !v.user?.email) return { verification_id, expires_in };
  const otp = generateOTP();
  await prisma.userVerification.update({
    where: { id: v.id },
    data: { verificationCode: otp, expiresAt: getOTPExpiry(config.otpExpiryMinutes) },
  });
  sendPasswordResetEmail(v.user.email, otp).catch(err => logger.error('Failed to resend reset code:', err));
  if (config.nodeEnv === 'development') logger.info(`[DEV] Password reset code for ${v.user.email}: ${otp}`);
  return { verification_id: v.id, expires_in };
};

export const completePasswordReset = async (data: {
  verification_id: string;
  password: string;
}): Promise<{ email: string }> => {
  const v = await findResetVerification(data.verification_id);
  if (!v || !v.isVerified) throw new Error('Confirm the code we emailed you first.');
  if (!v.expiresAt || isOTPExpired(v.expiresAt)) throw new Error('This reset has expired. Start again.');

  const passwordHash = await hashPassword(data.password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: v.user!.id }, data: { passwordHash, updatedAt: new Date() } }),
    // A new password signs every other device out.
    prisma.refreshToken.updateMany({ where: { userId: v.user!.id, isRevoked: false }, data: { isRevoked: true } }),
    prisma.userVerification.delete({ where: { id: v.id } }),
  ]);
  logger.info(`Password reset for user ${v.user!.id}`);
  return { email: v.user!.email! };
};

/* ------------------------------------------------------------------ */
/* Delete my account                                                   */
/* Refused while money or an order is still moving; otherwise personal */
/* data is wiped and the row kept (orders and payouts point at it).    */
/* ------------------------------------------------------------------ */

export const deleteAccount = async (userId: string): Promise<{ deleted: true }> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, deletedAt: true, wallet: { select: { balance: true } } },
  });
  if (!user || user.deletedAt) throw new Error('Account not found');

  const [unpaid, inFlight, sellerInFlight, openDisputes, liveBids, liveListings] = await Promise.all([
    prisma.order.count({
      where: { buyerId: userId, paymentStatus: 'pending', NOT: { fulfillmentStatus: 'cancelled' } },
    }),
    prisma.order.count({
      where: {
        buyerId: userId,
        paymentStatus: 'paid',
        OR: [
          { fulfillmentStatus: { notIn: ['delivered', 'cancelled'] } },
          { fulfillmentStatus: 'delivered', buyerConfirmedAt: null },
        ],
      },
    }),
    prisma.order.count({
      where: {
        sellerId: userId,
        paymentStatus: 'paid',
        OR: [{ fulfillmentStatus: { notIn: ['delivered', 'cancelled'] } }, { payoutStatus: { in: ['ready', 'held'] } }],
      },
    }),
    prisma.dispute.count({
      where: {
        status: { in: ['open', 'investigating'] },
        OR: [{ raisedBy: userId }, { order: { OR: [{ buyerId: userId }, { sellerId: userId }] } }],
      },
    }),
    // Any bid on a live auction still has ₦1,000 held in the wallet; it must be released first.
    prisma.bid.count({ where: { bidderId: userId, auction: { status: { in: ['active', 'scheduled'] } } } }),
    prisma.auction.count({ where: { sellerId: userId, status: { in: ['active', 'scheduled'] } } }),
  ]);

  if (unpaid) throw new Error('You have an order waiting for payment. Pay for it or let it lapse first.');
  if (inFlight || sellerInFlight) throw new Error("You have an order that isn't finished yet. You can delete your account once it's done.");
  if (openDisputes) throw new Error("You have a problem report that's still open. We'll need to close it first.");
  if (liveBids) throw new Error("You've bid on an auction that's still live. You can delete your account after it ends.");
  if (liveListings) throw new Error('You have a listing that is live or coming up. End it first.');
  const balance = Number(user.wallet?.balance ?? 0);
  if (balance > 0) {
    throw new Error(`Withdraw the ₦${Math.round(balance).toLocaleString('en-NG')} in your wallet first.`);
  }

  const phone = await makeSyntheticPhone();
  // A seller's verification documents are private: they go with the account.
  const application = await prisma.sellerApplication.findUnique({ where: { userId }, select: { documents: true } });
  const documentFiles = Object.values((application?.documents ?? {}) as Record<string, { file?: string }>)
    .map(d => d?.file)
    .filter((f): f is string => !!f);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        fullName: 'Deleted user',
        businessName: null,
        cacNumber: null,
        payoutBankCode: null,
        payoutBankName: null,
        payoutAccountNumber: null,
        payoutAccountName: null,
        payoutAccountAddedAt: null,
        email: null,
        username: null,
        phoneNumber: phone,
        passwordHash: await hashPassword(randomUUID()),
        avatarUrl: null,
        notificationPrefs: Prisma.DbNull,
        interests: Prisma.DbNull,
        twoFactorEnabled: false,
        twoFactorMethod: null,
        totpSecret: null,
        twoFactorPhone: null,
        personalisedPicks: true,
        usageStats: true,
        isActive: false,
        deletedAt: new Date(),
        updatedAt: new Date(),
      },
    }),
    prisma.refreshToken.updateMany({ where: { userId }, data: { isRevoked: true } }),
    prisma.pushToken.deleteMany({ where: { userId } }),
    prisma.savedCard.deleteMany({ where: { userId } }),
    prisma.savedSearch.deleteMany({ where: { userId } }),
    prisma.watch.deleteMany({ where: { userId } }),
    prisma.autoBid.deleteMany({ where: { userId } }),
    prisma.userAddress.deleteMany({ where: { userId } }),
    prisma.socialAccount.deleteMany({ where: { userId } }),
    forgetTrustedDevices(userId),
    // A pending "Download my data" request holds the old email; nothing is left to send.
    prisma.dataRequest.deleteMany({ where: { userId } }),
    prisma.sellerApplication.deleteMany({ where: { userId } }),
  ]);
  if (documentFiles.length) {
    const { deletePrivateFile } = await import('../seller/privateFiles.service');
    await Promise.all(documentFiles.map(f => deletePrivateFile(f)));
  }
  logger.info(`Account deleted (anonymised): ${userId}`);
  return { deleted: true };
};
