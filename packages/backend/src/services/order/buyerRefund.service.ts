import prisma from '../../config/prisma';
import { Prisma } from '../../generated/prisma';
import { applyBalanceDelta } from '../../utils/wallet-balance';
import * as paystackService from '../payment/paystack.service';

/**
 * A buyer's full refund for an order: back to the card or bank through Paystack when they paid
 * that way, otherwise into their wallet. Shared by case returns (case.service) and items that
 * failed the hub check (seller/hub.service). Callers make sure it runs once per order.
 */

/** The successful Paystack payment for this order, if they paid by card or bank. */
export const cardPaymentFor = (orderId: string) =>
  prisma.paymentTransaction.findFirst({
    where: { status: 'success', paymentGateway: 'paystack', metadata: { path: ['order_id'], equals: orderId } },
    orderBy: { updatedAt: 'desc' },
  });

/** Ask Paystack to send the whole payment back. Returns our reference for it ("PSR-…"). */
export const startCardRefund = async (gatewayReference: string, note?: string): Promise<string> => {
  const refund = await paystackService.refundTransaction(gatewayReference, note);
  return refund.id ? `PSR-${refund.id}` : `PSR-${gatewayReference}`;
};

/** Put the amount back in the buyer's wallet, with its wallet history line. */
export const creditBuyerWallet = async (
  tx: Prisma.TransactionClient,
  buyerId: string,
  amount: number,
  reference: string,
  description: string
) => {
  const wallet = await tx.wallet.findUnique({ where: { userId: buyerId } });
  if (!wallet) throw new Error('Buyer wallet not found');
  const { balanceBefore, balanceAfter } = await applyBalanceDelta(tx, wallet.id, amount);
  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      transactionType: 'refund',
      amount,
      balanceBefore,
      balanceAfter,
      reference,
      description,
      status: 'completed',
    },
  });
};
