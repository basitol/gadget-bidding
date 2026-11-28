import { randomUUID } from 'crypto';
import axios from 'axios';
import prisma from '../../config/prisma';
import config from '../../config';
import { Wallet, WalletTransaction } from '@gadget-bidding/shared';
import { applyBalanceDelta } from '../../utils/wallet-balance';
import * as paystackService from '../payment/paystack.service';
import logger from '../../utils/logger';

// Helper to convert Prisma Decimal to number
const toNumber = (value: any): number => {
  if (!value) return 0;
  return parseFloat(value.toString());
};

// Helper to transform Prisma wallet to shared Wallet type
const transformWallet = (wallet: any): Wallet => ({
  id: wallet.id,
  user_id: wallet.userId,
  balance: toNumber(wallet.balance),
  currency: wallet.currency || 'NGN',
  is_locked: wallet.isLocked || false,
  created_at: wallet.createdAt?.toISOString(),
  updated_at: wallet.updatedAt?.toISOString(),
});

// Helper to transform Prisma transaction to shared WalletTransaction type
const transformTransaction = (tx: any): WalletTransaction => ({
  id: tx.id,
  wallet_id: tx.walletId,
  transaction_type: tx.transactionType,
  type: tx.transactionType,
  amount: toNumber(tx.amount),
  balance_before: toNumber(tx.balanceBefore),
  balance_after: toNumber(tx.balanceAfter),
  reference: tx.reference,
  description: tx.description,
  metadata: tx.metadata,
  status: tx.status || 'pending',
  created_at: tx.createdAt?.toISOString(),
});

/**
 * Get user's wallet
 */
export const getUserWallet = async (userId: string): Promise<Wallet | null> => {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
  });

  return wallet ? transformWallet(wallet) : null;
};

/**
 * Get wallet balance
 */
export const getWalletBalance = async (userId: string): Promise<number> => {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: { balance: true },
  });

  return wallet ? toNumber(wallet.balance) : 0;
};

/**
 * Get available balance (balance minus held amounts)
 */
export const getAvailableBalance = async (userId: string): Promise<number> => {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    include: {
      bidHolds: {
        where: { status: 'held' },
        select: { amount: true },
      },
    },
  });

  if (!wallet) return 0;

  const balance = toNumber(wallet.balance);
  const heldAmount = wallet.bidHolds.reduce(
    (sum, hold) => sum + toNumber(hold.amount),
    0
  );

  return balance - heldAmount;
};

/**
 * Get wallet transactions with pagination
 */
export const getWalletTransactions = async (
  userId: string,
  page: number = 1,
  limit: number = 20
): Promise<{ transactions: WalletTransaction[]; total: number }> => {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!wallet) {
    return { transactions: [], total: 0 };
  }

  const [transactions, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.walletTransaction.count({
      where: { walletId: wallet.id },
    }),
  ]);

  return {
    transactions: transactions.map(transformTransaction),
    total,
  };
};

/**
 * Create a deposit transaction
 */
export const createDepositTransaction = async (
  userId: string,
  amount: number,
  reference: string,
  metadata?: Record<string, any>
): Promise<WalletTransaction> => {
  return prisma.$transaction(async tx => {
    // Get wallet
    const wallet = await tx.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Apply the credit atomically so concurrent deposits cannot lose updates
    const { balanceBefore, balanceAfter } = await applyBalanceDelta(
      tx,
      wallet.id,
      amount
    );

    // Create transaction record
    const transaction = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        transactionType: 'deposit',
        amount,
        balanceBefore,
        balanceAfter,
        reference,
        description: 'Wallet funded',
        metadata: metadata || {},
        status: 'completed',
      },
    });

    logger.info(`Deposit completed: ${userId} - ₦${amount}`);

    return transformTransaction(transaction);
  });
};

export type WalletFundingResult = {
  alreadyProcessed: boolean;
  amount: number;
  currency: string;
};

/**
 * Atomically verify and credit a wallet funding payment.
 * Used by client verify endpoint and gateway webhooks (Paystack, Monnify).
 */
export const processWalletFunding = async (params: {
  userId: string;
  reference: string;
  amount: number;
  gatewayResponse: Record<string, unknown>;
  source: 'verify' | 'webhook';
  gateway: 'paystack' | 'monnify';
}): Promise<WalletFundingResult> => {
  const { userId, reference, amount, gatewayResponse, source, gateway } = params;

  return prisma.$transaction(async tx => {
    const pending = await tx.paymentTransaction.findFirst({
      where: { gatewayReference: reference },
    });

    if (!pending) {
      throw new Error('Payment reference not found');
    }

    if (!pending.userId || pending.userId !== userId) {
      throw new Error('Payment reference does not belong to this account');
    }

    const metadata = (pending.metadata as Record<string, unknown>) || {};
    if (metadata.purpose && metadata.purpose !== 'wallet_funding') {
      throw new Error('Invalid payment purpose');
    }

    const expectedAmount = toNumber(pending.amount);
    if (Math.abs(expectedAmount - amount) > 0.01) {
      throw new Error('Payment amount mismatch');
    }

    if (pending.status === 'success') {
      return {
        alreadyProcessed: true,
        amount: expectedAmount,
        currency: pending.currency || 'NGN',
      };
    }

    const existingWalletTx = await tx.walletTransaction.findUnique({
      where: { reference },
    });

    if (existingWalletTx) {
      await tx.paymentTransaction.update({
        where: { id: pending.id },
        data: {
          status: 'success',
          gatewayResponse: gatewayResponse as object,
          updatedAt: new Date(),
        },
      });
      return {
        alreadyProcessed: true,
        amount: expectedAmount,
        currency: pending.currency || 'NGN',
      };
    }

    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const { balanceBefore, balanceAfter } = await applyBalanceDelta(
      tx,
      wallet.id,
      amount
    );

    const walletTx = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        transactionType: 'deposit',
        amount,
        balanceBefore,
        balanceAfter,
        reference,
        description: 'Wallet funded',
        metadata: {
          gateway,
          payment_method:
            gateway === 'paystack'
              ? (gatewayResponse as { channel?: string }).channel
              : (gatewayResponse as { paymentMethod?: string }).paymentMethod,
          source,
        },
        status: 'completed',
      },
    });

    await tx.paymentTransaction.update({
      where: { id: pending.id },
      data: {
        status: 'success',
        gatewayResponse: gatewayResponse as object,
        walletTransactionId: walletTx.id,
        updatedAt: new Date(),
      },
    });

    logger.info(`Wallet funded (${source}): ${userId} - ₦${amount}`);

    return {
      alreadyProcessed: false,
      amount,
      currency: pending.currency || 'NGN',
    };
  });
};

/**
 * Create a withdrawal transaction (debits the wallet; status 'pending' until the bank confirms).
 */
export const createWithdrawalTransaction = async (
  userId: string,
  amount: number,
  bankDetails: Record<string, any>,
  metadata?: Record<string, any>,
  options: { reference?: string; description?: string } = {}
): Promise<WalletTransaction> => {
  return prisma.$transaction(async tx => {
    // One withdrawal at a time per wallet, so two can't both pass the available-balance check.
    await tx.$queryRaw`SELECT id FROM wallets WHERE user_id = ${userId}::uuid FOR UPDATE`;

    // Get wallet with held amounts
    const wallet = await tx.wallet.findUnique({
      where: { userId },
      include: {
        bidHolds: {
          where: { status: 'held' },
          select: { amount: true },
        },
      },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    if (wallet.isLocked) {
      throw new Error('Wallet is locked. Please contact support');
    }

    const readBalance = toNumber(wallet.balance);
    const heldAmount = wallet.bidHolds.reduce(
      (sum, hold) => sum + toNumber(hold.amount),
      0
    );
    const availableBalance = readBalance - heldAmount;

    if (availableBalance < amount) {
      throw new Error(
        `Insufficient available balance. Available: ₦${availableBalance.toFixed(2)}`
      );
    }

    const { balanceBefore, balanceAfter } = await applyBalanceDelta(
      tx,
      wallet.id,
      -amount,
      `Insufficient available balance. Available: ₦${availableBalance.toFixed(2)}`
    );

    // Create transaction record
    const transaction = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        transactionType: 'withdrawal',
        amount,
        balanceBefore,
        balanceAfter,
        reference: options.reference || `WD-${Date.now()}`,
        description: options.description || 'Withdrawal to bank',
        metadata: { ...metadata, bankDetails },
        status: 'pending',
      },
    });

    logger.info(`Withdrawal initiated: ${userId} - ₦${amount}`);

    return transformTransaction(transaction);
  });
};

/* ---------------- Seller payouts: wallet → saved payout account (Paystack transfer) ---------------- */

/**
 * Live switch (env SELLER_PAYOUTS_LIVE=true; off unless set). When on, the 6 pm payouts
 * (services/seller/payouts.service.ts) start one Paystack transfer per seller and the transfer
 * webhooks settle them; when off, they wait for our team to send them by hand and mark them in
 * admin. Old wallet withdrawals by sellers also need it with live keys (test keys always run).
 * The transfer webhooks (webhook.controller.ts) settle both: payouts by PO- reference,
 * withdrawals through settleWithdrawal.
 */
const SELLER_PAYOUTS_LIVE = process.env.SELLER_PAYOUTS_LIVE === 'true';

/** Payouts go out by themselves (Paystack transfers), rather than by hand. */
export const sellerPayoutsLive = (): boolean => SELLER_PAYOUTS_LIVE;

export const sellerPayoutsOpen = (): boolean =>
  config.paystack.secretKey.startsWith('sk_test_') || SELLER_PAYOUTS_LIVE;

export class PayoutSendError extends Error {}

export type PayoutDestination = {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
};

/** Paystack's own view of a transfer, by our reference. null = Paystack never got it. */
export const lookUpTransfer = async (reference: string): Promise<string | null> => {
  try {
    const res = await axios.get(`https://api.paystack.co/transfer/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${config.paystack.secretKey}` },
      timeout: 15000,
    });
    return (res.data?.data?.status as string) || 'unknown';
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status === 404 || status === 400) return null;
    return 'unknown'; // Can't tell: leave it pending rather than refund money that may have gone out.
  }
};

/**
 * Debit the seller's wallet and send a Paystack transfer to their saved payout account.
 * If Paystack refuses it, the money goes straight back into the wallet and this throws
 * PayoutSendError. Otherwise the withdrawal stays 'pending' until settleWithdrawal runs.
 */
export const withdrawToPayoutAccount = async (
  userId: string,
  amount: number,
  to: PayoutDestination
): Promise<WalletTransaction & { transfer_code?: string }> => {
  const reference = `po_${randomUUID().replace(/-/g, '')}`;
  const last4 = to.accountNumber.slice(-4);
  const withdrawal = await createWithdrawalTransaction(
    userId,
    amount,
    {
      bank_code: to.bankCode,
      bank_name: to.bankName,
      account_number: to.accountNumber,
      account_name: to.accountName,
    },
    { purpose: 'seller_payout', gateway: 'paystack' },
    { reference, description: `Payout to ${to.bankName} ••••${last4}` }
  );

  let sent: { recipient_code: string; transfer_code: string };
  try {
    const { recipient_code } = await paystackService.createTransferRecipient(
      to.accountName,
      to.accountNumber,
      to.bankCode
    );
    const transfer = await paystackService.initiateTransfer(
      recipient_code,
      amount,
      reference,
      'Gadgets Bidding payout'
    );
    sent = { recipient_code, transfer_code: transfer.transfer_code };
  } catch (error) {
    logger.error(`Payout transfer not started for ${userId} (${reference}): ${(error as Error).message}`);
    const paystackStatus = await lookUpTransfer(reference);
    if (paystackStatus === null || paystackStatus === 'failed' || paystackStatus === 'reversed') {
      await settleWithdrawal(reference, 'failed', { reason: (error as Error).message });
      throw new PayoutSendError(
        "We couldn't send your payout right now. Your money is back in your wallet. Try again later."
      );
    }
    // Paystack has it (or we can't tell): keep it pending for the webhook to settle.
    logger.warn(`Payout ${reference} left pending: Paystack status ${paystackStatus}`);
    return withdrawal;
  }

  await prisma.walletTransaction
    .update({
      where: { id: withdrawal.id },
      data: { metadata: { ...(withdrawal.metadata || {}), ...sent } },
    })
    .catch(e => logger.error(`Could not record transfer code for ${reference}:`, e));

  logger.info(`Payout sent: ${userId} - ₦${amount} → ${to.bankName} ••••${last4} (${reference})`);
  return { ...withdrawal, transfer_code: sent.transfer_code };
};

/**
 * Finish a pending withdrawal once the bank answers (Paystack transfer.success / transfer.failed /
 * transfer.reversed). Failed or reversed: the money goes back into the wallet as a refund.
 * Safe to call more than once; only the first call for a pending withdrawal does anything.
 */
export const settleWithdrawal = async (
  reference: string,
  outcome: 'success' | 'failed' | 'reversed',
  info: Record<string, unknown> = {}
): Promise<{ settled: boolean }> =>
  prisma.$transaction(async tx => {
    const w = await tx.walletTransaction.findUnique({ where: { reference } });
    if (!w || w.transactionType !== 'withdrawal' || !w.walletId) return { settled: false };

    const metadata = {
      ...((w.metadata as Record<string, unknown>) || {}),
      outcome,
      settled_at: new Date().toISOString(),
      ...info,
    };
    // Claim it: only one caller can move it out of 'pending'.
    const claimed = await tx.walletTransaction.updateMany({
      where: { id: w.id, status: 'pending' },
      data: { status: outcome === 'success' ? 'completed' : 'failed', metadata: metadata as object },
    });
    if (claimed.count !== 1) return { settled: false };

    if (outcome !== 'success') {
      const amount = toNumber(w.amount);
      const { balanceBefore, balanceAfter } = await applyBalanceDelta(tx, w.walletId, amount);
      await tx.walletTransaction.create({
        data: {
          walletId: w.walletId,
          transactionType: 'refund',
          amount,
          balanceBefore,
          balanceAfter,
          reference: `${reference}_back`,
          description: "Payout didn't go through. Money back in your wallet",
          metadata: { withdrawal_reference: reference, outcome },
          status: 'completed',
        },
      });
    }
    logger.info(`Withdrawal ${reference} settled: ${outcome}`);
    return { settled: true };
  });

/**
 * Hold amount for bidding (escrow)
 */
export const holdAmount = async (
  userId: string,
  bidId: string,
  amount: number
): Promise<void> => {
  return prisma.$transaction(async tx => {
    // Get wallet with held amounts
    const wallet = await tx.wallet.findUnique({
      where: { userId },
      include: {
        bidHolds: {
          where: { status: 'held' },
          select: { amount: true },
        },
      },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const balance = toNumber(wallet.balance);
    const heldAmount = wallet.bidHolds.reduce(
      (sum, hold) => sum + toNumber(hold.amount),
      0
    );
    const availableBalance = balance - heldAmount;

    if (availableBalance < amount) {
      throw new Error(
        `Insufficient balance. Available: ₦${availableBalance.toFixed(2)}`
      );
    }

    // Create bid hold
    await tx.bidHold.create({
      data: {
        bidId,
        walletId: wallet.id,
        amount,
        status: 'held',
      },
    });

    // Create transaction record
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        transactionType: 'bid_hold',
        amount,
        balanceBefore: balance,
        balanceAfter: balance, // Balance doesn't change, just held
        description: 'Hold for bid',
        status: 'completed',
      },
    });

    logger.info(`Amount held: ${userId} - ₦${amount} for bid ${bidId}`);
  });
};

/**
 * Release held amount
 */
export const releaseHold = async (bidId: string): Promise<void> => {
  return prisma.$transaction(async tx => {
    // Get bid hold
    const hold = await tx.bidHold.findFirst({
      where: { bidId, status: 'held' },
      include: { wallet: true },
    });

    if (!hold) {
      return; // Already released or doesn't exist
    }

    // Release hold
    await tx.bidHold.update({
      where: { id: hold.id },
      data: { status: 'released', releasedAt: new Date() },
    });

    // Create transaction record
    const balance = toNumber(hold.wallet?.balance);

    await tx.walletTransaction.create({
      data: {
        walletId: hold.walletId!,
        transactionType: 'bid_release',
        amount: toNumber(hold.amount),
        balanceBefore: balance,
        balanceAfter: balance, // Balance doesn't change, just released
        description: 'Released hold for bid',
        status: 'completed',
      },
    });

    logger.info(`Hold released for bid: ${bidId}`);
  });
};

/**
 * Charge held amount (when bid wins)
 */
export const chargeHold = async (bidId: string): Promise<void> => {
  return prisma.$transaction(async tx => {
    // Get bid hold
    const hold = await tx.bidHold.findFirst({
      where: { bidId, status: 'held' },
    });

    if (!hold) {
      throw new Error('Hold not found or already charged');
    }

    // Get wallet
    const wallet = await tx.wallet.findUnique({
      where: { id: hold.walletId! },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const holdAmount = toNumber(hold.amount);

    const { balanceBefore, balanceAfter } = await applyBalanceDelta(
      tx,
      wallet.id,
      -holdAmount
    );

    // Mark hold as charged
    await tx.bidHold.update({
      where: { id: hold.id },
      data: { status: 'charged', releasedAt: new Date() },
    });

    // Create transaction record
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        transactionType: 'purchase',
        amount: holdAmount,
        balanceBefore,
        balanceAfter,
        description: 'Payment for winning bid',
        status: 'completed',
      },
    });

    logger.info(`Hold charged for bid: ${bidId} - ₦${holdAmount}`);
  });
};
