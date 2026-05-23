import { Request, Response } from 'express';
import { sendSuccess, sendError, sendPaginated } from '../../utils/response';
import * as walletService from '../../services/wallet/wallet.service';
import * as paystackService from '../../services/payment/paystack.service';
import { query } from '../../config/database';
import logger from '../../utils/logger';

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
  } catch (error: any) {
    logger.error('Get balance error:', error);
    sendError(res, error.message || 'Failed to get balance', 500);
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
  } catch (error: any) {
    logger.error('Get transactions error:', error);
    sendError(res, error.message || 'Failed to get transactions', 500);
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

    // Initialize Paystack payment
    const paymentData = await paystackService.initializePayment(
      email,
      amount,
      req.user.user_id,
      {
        purpose: 'wallet_funding',
      }
    );

    // Store payment transaction
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
  } catch (error: any) {
    logger.error('Fund wallet error:', error);
    sendError(res, error.message || 'Failed to initialize payment', 500);
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

    // Verify with Paystack
    const verification = await paystackService.verifyPayment(reference);

    if (!verification.status) {
      return sendError(res, 'Payment verification failed', 400);
    }

    // Check if already processed
    const existingTx = await query(
      `SELECT * FROM payment_transactions
       WHERE gateway_reference = $1 AND status = $2`,
      [reference, 'success']
    );

    if (existingTx.length > 0) {
      return sendSuccess(res, {
        message: 'Payment already processed',
        amount: verification.amount,
      });
    }

    // Update payment transaction
    await query(
      `UPDATE payment_transactions
       SET status = $1, gateway_response = $2, updated_at = NOW()
       WHERE gateway_reference = $3`,
      ['success', JSON.stringify(verification.gatewayResponse), reference]
    );

    // Credit wallet
    await walletService.createDepositTransaction(
      req.user.user_id,
      verification.amount,
      reference,
      {
        gateway: 'paystack',
        payment_method: verification.gatewayResponse.channel,
      }
    );

    sendSuccess(res, {
      message: 'Payment successful',
      amount: verification.amount,
      currency: verification.currency,
    });
  } catch (error: any) {
    logger.error('Verify payment error:', error);
    sendError(res, error.message || 'Payment verification failed', 500);
  }
};

/**
 * Withdraw funds
 * POST /api/v1/wallet/withdraw
 */
export const withdraw = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const { amount, bank_code, account_number, account_name } = req.body;

    // Check available balance
    const availableBalance = await walletService.getAvailableBalance(req.user.user_id);

    if (availableBalance < amount) {
      return sendError(
        res,
        `Insufficient balance. Available: ₦${availableBalance.toFixed(2)}`,
        400
      );
    }

    // Create withdrawal transaction
    const transaction = await walletService.createWithdrawalTransaction(
      req.user.user_id,
      amount,
      {
        bank_code,
        account_number,
        account_name,
      }
    );

    // Note: In production, you would initiate actual bank transfer here
    // For now, we'll mark it as pending and process manually
    logger.info(`Withdrawal requested: ${req.user.user_id} - ₦${amount}`);

    sendSuccess(res, {
      message: 'Withdrawal request submitted',
      transaction_id: transaction.id,
      amount,
      status: 'pending',
    }, 'Withdrawal will be processed within 24 hours');
  } catch (error: any) {
    logger.error('Withdraw error:', error);
    sendError(res, error.message || 'Withdrawal failed', 500);
  }
};

/**
 * List Nigerian banks
 * GET /api/v1/wallet/banks
 */
export const listBanks = async (req: Request, res: Response) => {
  try {
    const banks = await paystackService.listBanks();
    sendSuccess(res, banks);
  } catch (error: any) {
    logger.error('List banks error:', error);
    sendError(res, error.message || 'Failed to get banks', 500);
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
  } catch (error: any) {
    logger.error('Resolve account error:', error);
    sendError(res, error.message || 'Failed to resolve account', 400);
  }
};
