import { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import * as paystackService from '../../services/payment/paystack.service';
import * as monnifyService from '../../services/payment/monnify.service';
import * as walletService from '../../services/wallet/wallet.service';
import * as orderService from '../../services/order/order.service';
import prisma from '../../config/prisma';
import logger from '../../utils/logger';
import * as savedCardService from '../../services/buyer/savedCard.service';
import * as payoutsService from '../../services/seller/payouts.service';

/**
 * Paystack webhook handler
 * POST /api/v1/webhooks/paystack
 */
export const paystackWebhook = async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-paystack-signature'] as string;
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body);

    if (!paystackService.verifyWebhookSignature(rawBody, signature)) {
      logger.warn('Invalid Paystack webhook signature');
      return res.status(400).send('Invalid signature');
    }

    const event = JSON.parse(rawBody);
    logger.info(`Paystack webhook received: ${event.event}`);

    switch (event.event) {
      case 'charge.success':
        await handleChargeSuccess('paystack', event.data);
        break;

      case 'transfer.success':
      case 'transfer.failed':
      case 'transfer.reversed':
        await handleTransferEvent(event.event, event.data || {});
        break;

      default:
        logger.info(`Unhandled webhook event: ${event.event}`);
    }

    res.status(200).send('Webhook received');
  } catch (error: unknown) {
    logger.error('Webhook processing error:', error);
    // 5xx so Paystack retries transient failures
    res.status(500).send('Error processing webhook');
  }
};

/**
 * Monnify webhook handler
 * POST /api/v1/webhooks/monnify
 */
export const monnifyWebhook = async (req: Request, res: Response) => {
  try {
    const signature = req.headers['monnify-signature'] as string;
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body);

    if (!monnifyService.verifyWebhookSignature(rawBody, signature)) {
      logger.warn('Invalid Monnify webhook signature');
      return res.status(400).send('Invalid signature');
    }

    const event = JSON.parse(rawBody);
    const eventType = event.eventType;
    logger.info(`Monnify webhook received: ${eventType}`);

    switch (eventType) {
      case 'SUCCESSFUL_TRANSACTION':
        await handleChargeSuccess('monnify', {
          reference: event.eventData?.paymentReference,
          amount: event.eventData?.amountPaid ?? event.eventData?.amount,
          metadata: event.eventData?.metaData,
          raw: event.eventData,
        });
        break;

      default:
        logger.info(`Unhandled Monnify webhook event: ${eventType}`);
    }

    res.status(200).send('Webhook received');
  } catch (error: unknown) {
    logger.error('Monnify webhook processing error:', error);
    res.status(500).send('Error processing webhook');
  }
};

/**
 * Handle successful charge (shared between Paystack and Monnify)
 */
async function handleChargeSuccess(
  gateway: 'paystack' | 'monnify',
  data: Record<string, unknown>
) {
  const reference = data.reference as string;
  const amount =
    gateway === 'paystack'
      ? (data.amount as number) / 100
      : (data.amount as number);
  const metadata = (data.metadata as Record<string, unknown>) || {};
  const gatewayResponse = (data.raw as Record<string, unknown>) || data;

  // "+ Add a card" ₦50 checks: save the card and refund it. Never an order payment or a wallet top-up.
  if (gateway === 'paystack' && (await savedCardService.isCardCheckReference(reference, metadata))) {
    logger.info(`Processing card check via webhook: ${reference}`);
    await savedCardService.settleCardCheckFromWebhook(reference, data);
    return;
  }

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

  const txMetadata = (pendingTx.metadata as Record<string, unknown>) || {};

  if (txMetadata.purpose === 'order_payment' && txMetadata.order_id) {
    const expectedAmount = parseFloat(pendingTx.amount.toString());
    if (Math.abs(expectedAmount - amount) > 0.01) {
      throw new Error(
        `Order payment amount mismatch for ${reference}: expected ${expectedAmount}, got ${amount}`
      );
    }

    logger.info(`Processing order payment via webhook: ${reference}`);
    await orderService.processOrderPayment(
      txMetadata.order_id as string,
      reference,
      amount,
      gatewayResponse
    );
    if (gateway === 'paystack') await savedCardService.saveFromGateway(pendingTx.userId, data);
    return;
  }

  if (!pendingTx.userId) {
    throw new Error(`Wallet funding missing user for reference: ${reference}`);
  }

  await walletService.processWalletFunding({
    userId: pendingTx.userId,
    reference,
    amount,
    gatewayResponse,
    source: 'webhook',
    gateway,
  });
  if (gateway === 'paystack') await savedCardService.saveFromGateway(pendingTx.userId, data);
}

/**
 * Paystack transfers: the 6 pm seller payouts (PO-… references) and old wallet withdrawals
 * (po_… references). Both settle once; Paystack's retries and repeats do nothing.
 */
async function handleTransferEvent(
  event: 'transfer.success' | 'transfer.failed' | 'transfer.reversed',
  data: Record<string, unknown>
) {
  const reference = typeof data.reference === 'string' ? data.reference : '';
  if (!reference) {
    logger.warn(`Paystack ${event} without a reference`);
    return;
  }
  if (payoutsService.isPayoutReference(reference)) {
    const r = await payoutsService.settleFromTransferEvent(event, data);
    logger.info(`Paystack ${event} for payout ${reference}: ${r.settled ? 'settled' : 'already settled or unknown'}`);
    return;
  }
  const outcome = event === 'transfer.success' ? 'success' : event === 'transfer.failed' ? 'failed' : 'reversed';
  const info: Record<string, string> = {};
  if (typeof data.transfer_code === 'string') info.transfer_code = data.transfer_code;
  if (typeof data.gateway_response === 'string') info.gateway_response = data.gateway_response;
  const r = await walletService.settleWithdrawal(reference, outcome, info);
  logger.info(`Paystack ${event} for ${reference}: ${r.settled ? 'withdrawal settled' : 'nothing to settle'}`);
}
