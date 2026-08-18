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
  body('accepted_terms')
    .isBoolean({ loose: true })
    .withMessage('You must accept the Terms of Service and Privacy Policy')
    .custom(value => value === true)
    .withMessage('You must accept the Terms of Service and Privacy Policy'),
];

/**
 * Validate login request
 */
export const validateLogin: ValidationChain[] = [
  body('identifier')
    .trim()
    .notEmpty()
    .withMessage('Email or phone number is required')
    .custom((value: string) => {
      if (value.includes('@')) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          throw new Error('Invalid email address');
        }
        return true;
      }
      if (!/^\+?[0-9]{10,15}$/.test(value)) {
        throw new Error('Invalid phone number format');
      }
      return true;
    }),
  body('password').notEmpty().withMessage('Password is required'),
  body('account_type')
    .optional()
    .isIn(['buyer', 'seller'])
    .withMessage('Account type must be buyer or seller'),
];

/**
 * Validate social login request
 */
export const validateSocialLogin: ValidationChain[] = [
  body('provider')
    .trim()
    .isIn(['google', 'apple'])
    .withMessage('Provider must be google or apple'),
  body('id_token').trim().notEmpty().withMessage('Identity token is required'),
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
 * Validate resend OTP request — accepts a phone number or an email,
 * same as login, so a user isn't stuck if they only remember one.
 */
export const validateResendOTP: ValidationChain[] = [
  body('identifier')
    .trim()
    .notEmpty()
    .withMessage('Phone number or email is required'),
];
