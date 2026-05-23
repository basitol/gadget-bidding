import { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import * as paystackService from '../../services/payment/paystack.service';
import * as walletService from '../../services/wallet/wallet.service';
import * as orderService from '../../services/order/order.service';
import prisma from '../../config/prisma';
import logger from '../../utils/logger';

/**
 * Paystack webhook handler
 * POST /api/v1/webhooks/paystack
 */
export const paystackWebhook = async (req: Request, res: Response) => {
  try {
    // Verify webhook signature
    const signature = req.headers['x-paystack-signature'] as string;
    const payload = JSON.stringify(req.body);

    if (!paystackService.verifyWebhookSignature(payload, signature)) {
      logger.warn('Invalid Paystack webhook signature');
      return res.status(400).send('Invalid signature');
    }

    const event = req.body;
    logger.info(`Paystack webhook received: ${event.event}`);

    // Handle different event types
    switch (event.event) {
      case 'charge.success':
        await handleChargeSuccess(event.data);
        break;

      case 'transfer.success':
        await handleTransferSuccess(event.data);
        break;

      case 'transfer.failed':
        await handleTransferFailed(event.data);
        break;

      default:
        logger.info(`Unhandled webhook event: ${event.event}`);
    }

    // Always respond with 200 to acknowledge receipt
    res.status(200).send('Webhook received');
  } catch (error: any) {
    logger.error('Webhook processing error:', error);
    // Still return 200 to prevent retries
    res.status(200).send('Error processing webhook');
  }
};

/**
 * Handle successful charge
 */
async function handleChargeSuccess(data: any) {
  const reference = data.reference;
  const amount = data.amount / 100; // Convert kobo to Naira
  const metadata = data.metadata || {};

  // Check if already processed
  const existingTx = await prisma.paymentTransaction.findFirst({
    where: {
      gatewayReference: reference,
      status: 'success',
    },
  });

  if (existingTx) {
    logger.info(`Payment already processed: ${reference}`);
    return;
  }

  // Get pending transaction
  const pendingTx = await prisma.paymentTransaction.findFirst({
    where: {
      gatewayReference: reference,
      status: 'pending',
    },
  });

  if (!pendingTx) {
    logger.warn(`No pending transaction found for reference: ${reference}`);
    return;
  }

  // Check if this is an order payment
  const txMetadata = (pendingTx.metadata as any) || {};
  if (txMetadata.purpose === 'order_payment' && txMetadata.order_id) {
    // Process order payment
    logger.info(`Processing order payment via webhook: ${reference}`);
    await orderService.processOrderPayment(
      txMetadata.order_id,
      reference,
      amount,
      data
    );
    return;
  }

  // Otherwise, it's a wallet deposit
  // Update payment transaction (use 'success' as per DB constraint)
  await prisma.paymentTransaction.update({
    where: { id: pendingTx.id },
    data: {
      status: 'success',
      gatewayResponse: data,
      updatedAt: new Date(),
    },
  });

  // Credit wallet
  await walletService.createDepositTransaction(
    pendingTx.userId!,
    amount,
    reference,
    {
      gateway: 'paystack',
      payment_method: data.channel,
      webhook: true,
    }
  );

  logger.info(`Wallet credited via webhook: ${pendingTx.userId} - ₦${amount}`);
}

/**
 * Handle successful transfer
 */
async function handleTransferSuccess(data: any) {
  const reference = data.reference;

  logger.info(`Transfer successful: ${reference}`);

  // Update withdrawal transaction status
  // You would implement this based on your withdrawal flow
}

/**
 * Handle failed transfer
 */
async function handleTransferFailed(data: any) {
  const reference = data.reference;

  logger.error(`Transfer failed: ${reference}`, data);

  // Handle failed transfer - refund to wallet, notify user, etc.
}
