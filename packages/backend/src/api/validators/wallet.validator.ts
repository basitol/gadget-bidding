import { body, query, Meta, ValidationChain } from 'express-validator';

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

/** Sellers are always paid to their saved payout account, so they send only an amount. */
const sendsBankDetails = (_value: unknown, { req }: Meta) => req.user?.role !== 'seller';

/**
 * Validate withdraw request
 */
export const validateWithdraw: ValidationChain[] = [
  body('amount')
    .isFloat({ min: 500 })
    .withMessage('Minimum withdrawal amount is ₦500'),
  body('bank_code')
    .if(sendsBankDetails)
    .trim()
    .notEmpty()
    .withMessage('Bank code is required'),
  body('account_number')
    .if(sendsBankDetails)
    .trim()
    .isLength({ min: 10, max: 10 })
    .isNumeric()
    .withMessage('Account number must be 10 digits'),
  body('account_name')
    .if(sendsBankDetails)
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
