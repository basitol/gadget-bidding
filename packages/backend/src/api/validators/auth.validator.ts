import { body, ValidationChain } from 'express-validator';

/**
 * Validate registration request
 */
export const validateRegistration: ValidationChain[] = [
  body('phone_number')
    .trim()
    .matches(/^\+?[0-9]{10,15}$/)
    .withMessage('Invalid phone number format'),
  body('full_name')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Full name must be between 2 and 255 characters'),
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Invalid email address'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
  body('account_type')
    .optional()
    .isIn(['buyer', 'seller'])
    .withMessage('Account type must be buyer or seller'),
];

/**
 * Validate login request
 */
export const validateLogin: ValidationChain[] = [
  body('phone_number')
    .trim()
    .matches(/^\+?[0-9]{10,15}$/)
    .withMessage('Invalid phone number format'),
  body('password').notEmpty().withMessage('Password is required'),
  body('account_type')
    .optional()
    .isIn(['buyer', 'seller'])
    .withMessage('Account type must be buyer or seller'),
];

/**
 * Validate OTP verification
 */
export const validateOTPVerification: ValidationChain[] = [
  body('verification_id')
    .trim()
    .isUUID()
    .withMessage('Invalid verification ID'),
  body('otp')
    .trim()
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('OTP must be a 6-digit number'),
];

/**
 * Validate refresh token request
 */
export const validateRefreshToken: ValidationChain[] = [
  body('refresh_token').trim().notEmpty().withMessage('Refresh token is required'),
];

/**
 * Validate resend OTP request
 */
export const validateResendOTP: ValidationChain[] = [
  body('phone_number')
    .trim()
    .matches(/^\+?[0-9]{10,15}$/)
    .withMessage('Invalid phone number format'),
];
