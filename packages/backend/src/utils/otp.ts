import crypto from 'crypto';

/**
 * Generate 6-digit OTP
 */
export const generateOTP = (): string => {
  return crypto.randomInt(100000, 999999).toString();
};

/**
 * Get OTP expiry time
 */
export const getOTPExpiry = (minutes: number = 10): Date => {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + minutes);
  return expiry;
};

/**
 * Verify if OTP is expired
 */
export const isOTPExpired = (expiryTime: Date): boolean => {
  return new Date() > expiryTime;
};
