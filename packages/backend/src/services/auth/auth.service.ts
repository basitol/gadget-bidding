import prisma from '../../config/prisma';
import { hashPassword, comparePassword } from '../../utils/password';
import { generateAccessToken, generateRefreshToken } from '../../utils/jwt';
import { generateOTP, getOTPExpiry, isOTPExpired } from '../../utils/otp';
import { sendOTPSMS } from '../notification/sms.service';
import { sendOTPEmail } from '../notification/email.service';
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
} from '@gadget-bidding/shared';
import * as socialAuth from './socialAuth.service';
import logger from '../../utils/logger';

const USER_SELECT: {
  id: true;
  phoneNumber: true;
  email: true;
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

const toPublicUser = (user: Record<string, any>): User =>
  ({
    id: user.id,
    phone_number: user.phoneNumber,
    email: user.email || undefined,
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
async function issueTokensForUser(user: Record<string, any>) {
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

  await prisma.refreshToken.create({
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
export const loginUser = async (data: UserLogin): Promise<AuthTokens> => {
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

  // Check if user is active
  if (!user.isActive) {
    throw new Error('Account has been deactivated. Please contact support');
  }

  // Verify password
  const isPasswordValid = await comparePassword(
    data.password,
    user.passwordHash
  );

  if (!isPasswordValid) {
    throw new Error('Invalid email/phone number or password');
  }

  // Check if user is verified
  if (!user.isVerified) {
    throw new Error('Please verify your account first');
  }

  assertAccountTypeAccess(data.account_type, user.role);

  const { access_token, refresh_token } = await issueTokensForUser(user);

  logger.info(`User logged in: ${user.id} (${user.phoneNumber})`);

  return { access_token, refresh_token, user: toPublicUser(user) };
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

const makeSyntheticPhone = async (): Promise<string> => {
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
              : 'GadgetBid User'),
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

    const { access_token, refresh_token } = await issueTokensForUser(user);

    logger.info(`User signed in with ${provider}: ${user.id}`);

    return { access_token, refresh_token, user: toPublicUser(user) };
  });
}
