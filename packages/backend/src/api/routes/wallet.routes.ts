import { Router } from 'express';
import * as walletController from '../controllers/wallet.controller';
import * as walletValidator from '../validators/wallet.validator';
import { handleValidationErrors } from '../middlewares/validation.middleware';
import { authenticate } from '../middlewares/auth.middleware';
import { paymentRateLimiter } from '../middlewares/security.middleware';

const router: Router = Router();

/**
 * @route   GET /api/v1/wallet
 * @desc    Get wallet balance (alias)
 * @access  Private
 */
router.get('/', authenticate, walletController.getBalance);

/**
 * @route   GET /api/v1/wallet/balance
 * @desc    Get wallet balance
 * @access  Private
 */
router.get('/balance', authenticate, walletController.getBalance);

/**
 * @route   GET /api/v1/wallet/transactions
 * @desc    Get wallet transactions
 * @access  Private
 */
router.get(
  '/transactions',
  authenticate,
  walletValidator.validateTransactionFilters,
  handleValidationErrors,
  walletController.getTransactions
);

/**
 * @route   POST /api/v1/wallet/fund
 * @desc    Initialize wallet funding
 * @access  Private
 */
router.post(
  '/fund',
  paymentRateLimiter,
  authenticate,
  walletValidator.validateFundWallet,
  handleValidationErrors,
  walletController.fundWallet
);

/**
 * @route   GET /api/v1/wallet/verify-payment
 * @desc    Verify payment
 * @access  Private
 */
router.get(
  '/verify-payment',
  paymentRateLimiter,
  authenticate,
  walletValidator.validateVerifyPayment,
  handleValidationErrors,
  walletController.verifyPayment
);

/**
 * @route   POST /api/v1/wallet/withdraw
 * @desc    Withdraw funds
 * @access  Private
 */
router.post(
  '/withdraw',
  paymentRateLimiter,
  authenticate,
  walletValidator.validateWithdraw,
  handleValidationErrors,
  walletController.withdraw
);

/**
 * @route   GET /api/v1/wallet/banks
 * @desc    List Nigerian banks
 * @access  Public
 */
router.get('/banks', walletController.listBanks);

/**
 * @route   GET /api/v1/wallet/resolve-account
 * @desc    Resolve account number
 * @access  Private
 */
router.get(
  '/resolve-account',
  authenticate,
  walletValidator.validateResolveAccount,
  handleValidationErrors,
  walletController.resolveAccount
);

export default router;
