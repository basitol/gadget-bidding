import { Request, Response } from 'express';
import { sendSuccess, sendError, sendPaginated } from '../../utils/response';
import * as walletService from '../../services/wallet/wallet.service';
import * as paystackService from '../../services/payment/paystack.service';
import { query } from '../../config/database';
import logger from '../../utils/logger';
import { safeErrorMessage, USER_ERRORS } from '../../utils/errors';

/**
 * Get wallet balance
 * GET /api/v1/wallet/balance
 */
export const getBalance = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const balance = await walletService.getWalletBalance(req.user.user_id);
    const availableBalance = await walletService.getAvailableBalance(req.user.user_id);
    const wallet = await walletService.getUserWallet(req.user.user_id);

    sendSuccess(res, {
      balance,
      available_balance: availableBalance,
      currency: wallet?.currency || 'NGN',
      is_locked: wallet?.is_locked || false,
    });
  } catch (error: unknown) {
    logger.error('Get balance error:', error);
    sendError(res, safeErrorMessage(error, 'Failed to get balance'), 500);
  }
};

/**
 * Get wallet transactions
 * GET /api/v1/wallet/transactions
 */
export const getTransactions = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const { transactions, total } = await walletService.getWalletTransactions(
      req.user.user_id,
      page,
      limit
    );

    sendPaginated(res, transactions, page, limit, total);
  } catch (error: unknown) {
    logger.error('Get transactions error:', error);
    sendError(res, safeErrorMessage(error, 'Failed to get transactions'), 500);
  }
};

/**
 * Initialize wallet funding
 * POST /api/v1/wallet/fund
 */
export const fundWallet = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const { amount, email } = req.body;

    const paymentData = await paystackService.initializePayment(
      email,
      amount,
      req.user.user_id,
      {
        purpose: 'wallet_funding',
      }
    );

    await query(
      `INSERT INTO payment_transactions
       (user_id, payment_gateway, gateway_reference, amount, currency, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user.user_id,
        'paystack',
        paymentData.reference,
        amount,
        'NGN',
        'pending',
        JSON.stringify({ purpose: 'wallet_funding' }),
      ]
    );

    sendSuccess(res, {
      authorization_url: paymentData.authorization_url,
      reference: paymentData.reference,
    }, 'Payment initialized successfully');
  } catch (error: unknown) {
    logger.error('Fund wallet error:', error);
    sendError(res, safeErrorMessage(error, 'Failed to initialize payment'), 500);
  }
};

/**
 * Verify payment
 * GET /api/v1/wallet/verify-payment
 */
export const verifyPayment = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const { reference } = req.query as { reference: string };
    if (!reference?.trim()) {
      return sendError(res, 'Payment reference is required', 400);
    }

    const verification = await paystackService.verifyPayment(reference);

    if (!verification.status) {
      return sendError(res, USER_ERRORS.PAYMENT_FAILED, 400);
    }

    const result = await walletService.processWalletFundingFromPaystack({
      userId: req.user.user_id,
      reference,
      amount: verification.amount,
      gatewayResponse: verification.gatewayResponse,
      source: 'verify',
    });

    sendSuccess(res, {
      message: result.alreadyProcessed
        ? USER_ERRORS.PAYMENT_ALREADY_PROCESSED
        : 'Payment successful',
      amount: result.amount,
      currency: result.currency,
    });
  } catch (error: unknown) {
    logger.error('Verify payment error:', error);
    const message =
      error instanceof Error ? error.message : USER_ERRORS.PAYMENT_FAILED;
    if (message === 'Payment reference not found') {
      return sendError(res, USER_ERRORS.PAYMENT_NOT_FOUND, 404);
    }
    if (message === 'Payment reference does not belong to this account') {
      return sendError(res, USER_ERRORS.PAYMENT_NOT_YOURS, 403);
    }
    if (message === 'Payment amount mismatch') {
      return sendError(res, USER_ERRORS.PAYMENT_AMOUNT_MISMATCH, 400);
    }
    sendError(res, safeErrorMessage(error, USER_ERRORS.PAYMENT_FAILED), 500);
  }
};

/**
 * Withdraw funds — disabled until Paystack transfers are wired.
 * POST /api/v1/wallet/withdraw
 */
export const withdraw = async (_req: Request, res: Response) => {
  return sendError(res, USER_ERRORS.WITHDRAWALS_DISABLED, 503);
};

/**
 * List Nigerian banks
 * GET /api/v1/wallet/banks
 */
export const listBanks = async (_req: Request, res: Response) => {
  try {
    const banks = await paystackService.listBanks();
    sendSuccess(res, banks);
  } catch (error: unknown) {
    logger.error('List banks error:', error);
    sendError(res, safeErrorMessage(error, 'Failed to get banks'), 500);
  }
};

/**
 * Resolve account number
 * GET /api/v1/wallet/resolve-account
 */
export const resolveAccount = async (req: Request, res: Response) => {
  try {
    const { account_number, bank_code } = req.query as {
      account_number: string;
      bank_code: string;
    };

    const accountDetails = await paystackService.resolveAccountNumber(
      account_number,
      bank_code
    );

    sendSuccess(res, accountDetails);
  } catch (error: unknown) {
    logger.error('Resolve account error:', error);
    sendError(res, safeErrorMessage(error, 'Failed to resolve account'), 400);
  }
};
