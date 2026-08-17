import { body, query, ValidationChain } from 'express-validator';

/**
 * Validate fund wallet request
 */
export const validateFundWallet: ValidationChain[] = [
  body('amount')
    .isFloat({ min: 100 })
    .withMessage('Amount must be at least ₦100'),
  body('email')
    .isEmail()
    .withMessage('Valid email is required'),
  body('gateway')
    .optional()
    .isIn(['paystack', 'monnify'])
    .withMessage('Gateway must be paystack or monnify'),
];

/**
 * Validate withdraw request
 */
export const validateWithdraw: ValidationChain[] = [
  body('amount')
    .isFloat({ min: 500 })
    .withMessage('Minimum withdrawal amount is ₦500'),
  body('bank_code')
    .trim()
    .notEmpty()
    .withMessage('Bank code is required'),
  body('account_number')
    .trim()
    .isLength({ min: 10, max: 10 })
    .isNumeric()
    .withMessage('Account number must be 10 digits'),
  body('account_name')
    .trim()
    .notEmpty()
    .withMessage('Account name is required'),
];

/**
 * Validate verify payment request
 */
export const validateVerifyPayment: ValidationChain[] = [
  query('reference')
    .trim()
    .notEmpty()
    .withMessage('Payment reference is required'),
];

/**
 * Validate resolve account request
 */
export const validateResolveAccount: ValidationChain[] = [
  query('account_number')
    .trim()
    .isLength({ min: 10, max: 10 })
    .isNumeric()
    .withMessage('Account number must be 10 digits'),
  query('bank_code')
    .trim()
    .notEmpty()
    .withMessage('Bank code is required'),
];

/**
 * Validate transaction filters
 */
export const validateTransactionFilters: ValidationChain[] = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
];
