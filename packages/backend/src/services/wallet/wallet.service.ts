import prisma from '../../config/prisma';
import { Wallet, WalletTransaction } from '@gadget-bidding/shared';
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
    // Get wallet (Prisma handles locking with serializable isolation)
    const wallet = await tx.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const balanceBefore = toNumber(wallet.balance);
    const balanceAfter = balanceBefore + amount;

    // Update wallet balance
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: balanceAfter },
    });

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
 * Used by client verify endpoint and Paystack webhooks.
 */
export const processWalletFundingFromPaystack = async (params: {
  userId: string;
  reference: string;
  amount: number;
  gatewayResponse: Record<string, unknown>;
  source: 'verify' | 'webhook';
}): Promise<WalletFundingResult> => {
  const { userId, reference, amount, gatewayResponse, source } = params;

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

    const balanceBefore = toNumber(wallet.balance);
    const balanceAfter = balanceBefore + amount;

    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: balanceAfter },
    });

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
          gateway: 'paystack',
          payment_method: (gatewayResponse as { channel?: string }).channel,
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
 * Create a withdrawal transaction
 */
export const createWithdrawalTransaction = async (
  userId: string,
  amount: number,
  bankDetails: Record<string, any>,
  metadata?: Record<string, any>
): Promise<WalletTransaction> => {
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

    if (wallet.isLocked) {
      throw new Error('Wallet is locked. Please contact support');
    }

    const balanceBefore = toNumber(wallet.balance);
    const heldAmount = wallet.bidHolds.reduce(
      (sum, hold) => sum + toNumber(hold.amount),
      0
    );
    const availableBalance = balanceBefore - heldAmount;

    if (availableBalance < amount) {
      throw new Error(
        `Insufficient available balance. Available: ₦${availableBalance.toFixed(2)}`
      );
    }

    const balanceAfter = balanceBefore - amount;

    // Update wallet balance
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: balanceAfter },
    });

    // Create transaction record
    const transaction = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        transactionType: 'withdrawal',
        amount,
        balanceBefore,
        balanceAfter,
        reference: `WD-${Date.now()}`,
        description: 'Withdrawal to bank',
        metadata: { ...metadata, bankDetails },
        status: 'pending',
      },
    });

    logger.info(`Withdrawal initiated: ${userId} - ₦${amount}`);

    return transformTransaction(transaction);
  });
};

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

    const balanceBefore = toNumber(wallet.balance);
    const holdAmount = toNumber(hold.amount);
    const balanceAfter = balanceBefore - holdAmount;

    // Update wallet balance
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: balanceAfter },
    });

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
