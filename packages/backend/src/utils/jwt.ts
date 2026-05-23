import jwt, { SignOptions } from 'jsonwebtoken';
import config from '../config';

export interface JwtPayload {
  user_id: string;
  phone_number: string;
  role: string;
  full_name?: string;
}

/**
 * Generate access token (short-lived)
 * Uses JWT time strings like '24h', '7d', etc.
 */
export const generateAccessToken = (payload: JwtPayload): string => {
  const options: SignOptions = {
    expiresIn: config.jwt.accessExpiry as any, // e.g., '24h' - JWT accepts string time formats
  };
  return jwt.sign(payload, config.jwt.secret, options);
};

/**
 * Generate refresh token (long-lived)
 * Uses JWT time strings like '30d', etc.
 */
export const generateRefreshToken = (payload: JwtPayload): string => {
  const options: SignOptions = {
    expiresIn: config.jwt.refreshExpiry as any, // e.g., '30d' - JWT accepts string time formats
  };
  return jwt.sign(payload, config.jwt.refreshSecret, options);
};

/**
 * Verify access token
 */
export const verifyAccessToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, config.jwt.secret) as JwtPayload;
  } catch (error) {
    throw new Error('Invalid or expired access token');
  }
};

/**
 * Verify refresh token
 */
export const verifyRefreshToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, config.jwt.refreshSecret) as JwtPayload;
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
};

/**
 * Decode token without verification (for debugging)
 */
export const decodeToken = (token: string): any => {
  return jwt.decode(token);
};
