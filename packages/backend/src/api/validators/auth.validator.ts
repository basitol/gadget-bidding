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

/* ---------- Email-first buyer sign-up ---------- */

export const validateSignupStart: ValidationChain[] = [
  body('email').trim().isEmail().withMessage('Enter a valid email address'),
];

export const validateSignupVerify: ValidationChain[] = [
  body('verification_id').isUUID().withMessage('Invalid sign-up session'),
  body('otp')
    .trim()
    .matches(/^[0-9]{6}$/)
    .withMessage('Enter the 6-digit code'),
];

export const validateSignupResend: ValidationChain[] = [
  body('verification_id').isUUID().withMessage('Invalid sign-up session'),
];

export const validateSignupComplete: ValidationChain[] = [
  body('verification_id').isUUID().withMessage('Invalid sign-up session'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Use at least 8 characters')
    .matches(/[A-Za-z]/)
    .withMessage('Include at least one letter')
    .matches(/[0-9]/)
    .withMessage('Include at least one number'),
  body('first_name').trim().isLength({ min: 1, max: 100 }).withMessage('Enter your first name'),
  body('last_name').trim().isLength({ min: 1, max: 100 }).withMessage('Enter your last name'),
  body('username')
    .trim()
    .toLowerCase()
    .matches(/^[a-z0-9_]{3,20}$/)
    .withMessage('Usernames are 3–20 letters, numbers or _'),
  body('interests').optional().isObject().withMessage('Invalid interests'),
  body('interests.categories').optional().isArray({ max: 12 }),
  body('interests.budget').optional({ nullable: true }).isString().isLength({ max: 20 }),
  body('accepted_terms')
    .custom(value => value === true)
    .withMessage('You must accept the Terms of Service and Privacy Policy'),
];

/* ---------- Password reset ---------- */

export const validatePasswordForgot: ValidationChain[] = [
  body('email').trim().isEmail().withMessage('Enter a valid email address'),
];

export const validatePasswordVerify: ValidationChain[] = [
  body('verification_id').isUUID().withMessage('This reset has expired. Start again.'),
  body('otp')
    .trim()
    .matches(/^[0-9]{6}$/)
    .withMessage('Enter the 6-digit code'),
];

export const validatePasswordResend: ValidationChain[] = [
  body('verification_id').isUUID().withMessage('This reset has expired. Start again.'),
];

export const validatePasswordReset: ValidationChain[] = [
  body('verification_id').isUUID().withMessage('This reset has expired. Start again.'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Use at least 8 characters')
    .matches(/[A-Za-z]/)
    .withMessage('Include at least one letter')
    .matches(/[0-9]/)
    .withMessage('Include at least one number'),
];
