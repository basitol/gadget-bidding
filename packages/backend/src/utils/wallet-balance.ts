import { Prisma } from '../generated/prisma';

const toNumber = (value: any): number => {
  if (!value) return 0;
  return parseFloat(value.toString());
};

const isBalanceConstraintError = (error: unknown): boolean => {
  const err = error as { message?: string };
  return /check|constraint|23514/i.test(err?.message || '');
};

/**
 * Atomically apply a wallet balance delta via `increment` so concurrent
 * read-modify-write races (two deposits, deposit + withdrawal, etc.) cannot
 * lose updates. The wallet's `balance >= 0` CHECK is the hard guarantee for
 * debits that race past the app-side availability check. Returns the accurate
 * before/after balances for the wallet transaction audit trail.
 */
export const applyBalanceDelta = async (
  tx: Prisma.TransactionClient,
  walletId: string,
  delta: number,
  insufficientMessage = 'Insufficient available balance'
): Promise<{ balanceBefore: number; balanceAfter: number }> => {
  let updated;
  try {
    updated = await tx.wallet.update({
      where: { id: walletId },
      data: { balance: { increment: delta } },
    });
  } catch (error) {
    if (delta < 0 && isBalanceConstraintError(error)) {
      throw new Error(insufficientMessage);
    }
    throw error;
  }

  const balanceAfter = toNumber(updated.balance);
  return { balanceBefore: balanceAfter - delta, balanceAfter };
};
