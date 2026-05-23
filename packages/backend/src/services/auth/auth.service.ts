import prisma from '../../config/prisma';
import { hashPassword, comparePassword } from '../../utils/password';
import { generateAccessToken, generateRefreshToken } from '../../utils/jwt';
import { generateOTP, getOTPExpiry, isOTPExpired } from '../../utils/otp';
import { sendOTPSMS } from '../notification/sms.service';
import config from '../../config';
import {
  User,
  UserRegistration,
  UserLogin,
  AuthTokens,
  OTPVerification,
} from '@gadget-bidding/shared';
import logger from '../../utils/logger';

/**
 * Register a new user
 */
export const registerUser = async (
  data: UserRegistration
): Promise<{ user: User; verification_id: string }> => {
  return prisma.$transaction(async tx => {
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
        role: 'user',
        wallet: {
          create: {
            balance: 1000, // Starting balance for testing
            currency: 'NGN',
          },
        },
      },
      select: {
        id: true,
        phoneNumber: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        role: true,
        isVerified: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
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

    // Send OTP via SMS (don't block on this)
    sendOTPSMS(data.phone_number, otp).catch(err => {
      logger.error('Failed to send OTP SMS:', err);
    });

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
      role: user.role || 'user',
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
      select: {
        id: true,
        phoneNumber: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        role: true,
        isVerified: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Generate tokens
    const tokenPayload = {
      user_id: updatedUser.id,
      phone_number: updatedUser.phoneNumber,
      role: updatedUser.role || 'user',
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
      role: updatedUser.role || 'user',
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
 * Login user
 */
export const loginUser = async (data: UserLogin): Promise<AuthTokens> => {
  // Find user
  const user = await prisma.user.findUnique({
    where: { phoneNumber: data.phone_number },
  });

  if (!user) {
    throw new Error('Invalid phone number or password');
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
    throw new Error('Invalid phone number or password');
  }

  // Check if user is verified
  if (!user.isVerified) {
    throw new Error('Please verify your phone number first');
  }

  // Generate tokens
  const tokenPayload = {
    user_id: user.id,
    phone_number: user.phoneNumber,
    role: user.role || 'user',
    full_name: user.fullName,
  };

  const access_token = generateAccessToken(tokenPayload);
  const refresh_token = generateRefreshToken(tokenPayload);

  // Store refresh token
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: refresh_token,
      expiresAt,
    },
  });

  logger.info(`User logged in: ${user.id} (${user.phoneNumber})`);

  // Transform to match expected User type
  const transformedUser = {
    id: user.id,
    phone_number: user.phoneNumber,
    email: user.email || undefined,
    full_name: user.fullName,
    avatar_url: user.avatarUrl || undefined,
    role: user.role || 'user',
    is_verified: user.isVerified || false,
    is_active: user.isActive || true,
    created_at: user.createdAt?.toISOString() || new Date().toISOString(),
    updated_at: user.updatedAt?.toISOString() || new Date().toISOString(),
  } as unknown as User;

  return { access_token, refresh_token, user: transformedUser };
};

/**
 * Refresh access token (and optionally rotate refresh token)
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
    role: user.role || 'user',
    full_name: user.fullName,
  });

  // Rotate refresh token for security (revoke old, create new)
  await prisma.refreshToken.update({
    where: { token: refreshToken },
    data: { isRevoked: true },
  });

  const newRefreshToken = generateRefreshToken({
    user_id: user.id,
    phone_number: user.phoneNumber,
    role: user.role || 'user',
    full_name: user.fullName,
  });

  const refreshExpiry = new Date();
  const refreshDays = config.jwt.refreshExpiry.includes('d')
    ? parseInt(config.jwt.refreshExpiry, 10)
    : 30;
  refreshExpiry.setDate(refreshExpiry.getDate() + refreshDays);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: newRefreshToken,
      expiresAt: refreshExpiry,
    },
  });

  return { access_token, refresh_token: newRefreshToken };
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
  phoneNumber: string
): Promise<{ verification_id: string }> => {
  return prisma.$transaction(async tx => {
    // Get user
    const user = await tx.user.findUnique({
      where: { phoneNumber },
    });

    if (!user) {
      throw new Error('User not found');
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

    // Send OTP via SMS
    await sendOTPSMS(phoneNumber, otp);

    logger.info(`OTP resent to: ${phoneNumber}`);

    return { verification_id: verification.id };
  });
};
