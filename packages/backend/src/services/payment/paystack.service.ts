import axios from 'axios';
import crypto from 'crypto';
import config from '../../config';
import logger from '../../utils/logger';
import { PaystackInitializeResponse } from '@gadget-bidding/shared';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

/**
 * Log a gateway error without leaking sensitive response bodies
 * (customer names, account numbers, card metadata) to the logs.
 */
const logGatewayError = (context: string, error: unknown): void => {
  const err = error as {
    response?: { status?: number; data?: { message?: string } };
    message?: string;
  };
  logger.error(
    `${context}: status=${err.response?.status ?? 'n/a'} message=${
      err.response?.data?.message || err.message || 'Unknown gateway error'
    }`
  );
};

/**
 * Initialize Paystack payment
 */
export const initializePayment = async (
  email: string,
  amount: number,
  userId: string,
  metadata?: Record<string, any>,
  /** Limit the checkout to these methods, e.g. ['bank_transfer'] or ['ussd']. */
  channels?: string[]
): Promise<PaystackInitializeResponse> => {
  try {
    const reference = `PAY-${crypto.randomUUID()}`;

    const response = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        email,
        amount: amount * 100, // Convert Naira to kobo
        currency: 'NGN',
        reference,
        callback_url: `${config.backendUrl}/wallet/verify?reference=${encodeURIComponent(
          reference
        )}`,
        metadata: {
          user_id: userId,
          ...metadata,
        },
        ...(channels?.length ? { channels } : {}),
      },
      {
        headers: {
          Authorization: `Bearer ${config.paystack.secretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.status) {
      logger.info(`Paystack payment initialized: ${reference} - ₦${amount}`);

      return {
        authorization_url: response.data.data.authorization_url,
        access_code: response.data.data.access_code,
        reference: response.data.data.reference,
      };
    }

    throw new Error('Failed to initialize payment');
  } catch (error: any) {
    logGatewayError('Paystack initialization error', error);
    throw new Error(error.response?.data?.message || 'Failed to initialize payment');
  }
};

/**
 * Verify Paystack payment
 */
export const verifyPayment = async (
  reference: string
): Promise<{
  status: boolean;
  amount: number;
  currency: string;
  metadata: Record<string, any>;
  gatewayResponse: any;
}> => {
  try {
    const response = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${config.paystack.secretKey}`,
        },
      }
    );

    if (response.data.status && response.data.data.status === 'success') {
      const amount = response.data.data.amount / 100; // Convert kobo to Naira

      logger.info(`Payment verified: ${reference} - ₦${amount}`);

      return {
        status: true,
        amount,
        currency: response.data.data.currency,
        metadata: response.data.data.metadata || {},
        gatewayResponse: response.data.data,
      };
    }

    return {
      status: false,
      amount: 0,
      currency: 'NGN',
      metadata: {},
      gatewayResponse: response.data,
    };
  } catch (error: any) {
    logGatewayError('Paystack verification error', error);
    throw new Error('Failed to verify payment');
  }
};

/**
 * Verify Paystack webhook signature
 */
export const verifyWebhookSignature = (
  payload: string,
  signature: string
): boolean => {
  if (!signature || !config.paystack.secretKey) {
    return false;
  }

  const hash = crypto
    .createHmac('sha512', config.paystack.secretKey)
    .update(payload)
    .digest('hex');

  const expected = Buffer.from(hash, 'utf8');
  const received = Buffer.from(signature, 'utf8');

  if (expected.length !== received.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, received);
};

/**
 * Create transfer recipient (for withdrawals)
 */
export const createTransferRecipient = async (
  name: string,
  accountNumber: string,
  bankCode: string
): Promise<{ recipient_code: string }> => {
  try {
    const response = await axios.post(
      `${PAYSTACK_BASE_URL}/transferrecipient`,
      {
        type: 'nuban',
        name,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: 'NGN',
      },
      {
        headers: {
          Authorization: `Bearer ${config.paystack.secretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.status) {
      return {
        recipient_code: response.data.data.recipient_code,
      };
    }

    throw new Error('Failed to create transfer recipient');
  } catch (error: any) {
    logGatewayError('Create recipient error', error);
    throw new Error(error.response?.data?.message || 'Failed to create recipient');
  }
};

/**
 * Initiate transfer (for withdrawals)
 */
export const initiateTransfer = async (
  recipientCode: string,
  amount: number,
  reference: string,
  reason?: string
): Promise<{ transfer_code: string; reference: string }> => {
  try {
    const response = await axios.post(
      `${PAYSTACK_BASE_URL}/transfer`,
      {
        source: 'balance',
        reason: reason || 'Withdrawal',
        amount: amount * 100, // Convert to kobo
        recipient: recipientCode,
        reference,
      },
      {
        headers: {
          Authorization: `Bearer ${config.paystack.secretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.status) {
      logger.info(`Transfer initiated: ${reference} - ₦${amount}`);

      return {
        transfer_code: response.data.data.transfer_code,
        reference: response.data.data.reference,
      };
    }

    throw new Error('Failed to initiate transfer');
  } catch (error: any) {
    logGatewayError('Transfer initiation error', error);
    throw new Error(error.response?.data?.message || 'Failed to initiate transfer');
  }
};

/**
 * List Nigerian banks
 */
export const listBanks = async (): Promise<Array<{ id: number; name: string; code: string }>> => {
  try {
    const response = await axios.get(
      `${PAYSTACK_BASE_URL}/bank?currency=NGN`,
      {
        headers: {
          Authorization: `Bearer ${config.paystack.secretKey}`,
        },
      }
    );

    if (response.data.status) {
      return response.data.data.map((bank: any) => ({
        id: bank.id,
        name: bank.name,
        code: bank.code,
      }));
    }

    return [];
  } catch (error: any) {
    logGatewayError('List banks error', error);
    return [];
  }
};

/**
 * Resolve account number
 */
export const resolveAccountNumber = async (
  accountNumber: string,
  bankCode: string
): Promise<{ account_number: string; account_name: string }> => {
  try {
    const response = await axios.get(
      `${PAYSTACK_BASE_URL}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      {
        headers: {
          Authorization: `Bearer ${config.paystack.secretKey}`,
        },
      }
    );

    if (response.data.status) {
      return {
        account_number: response.data.data.account_number,
        account_name: response.data.data.account_name,
      };
    }

    throw new Error('Could not resolve account number');
  } catch (error: any) {
    logGatewayError('Resolve account error', error);
    throw new Error(error.response?.data?.message || 'Invalid account details');
  }
};

/* ---------------- Charge API: pay by bank transfer or USSD without the web checkout ---------------- */

/** USSD banks Paystack supports on this integration (checked in test mode: 737, 919, 966 work). */
export const USSD_BANKS = {
  '737': 'GTBank',
  '966': 'Zenith Bank',
  '919': 'UBA',
} as const;
export type UssdBankCode = keyof typeof USSD_BANKS;

const chargeHeaders = () => ({
  Authorization: `Bearer ${config.paystack.secretKey}`,
  'Content-Type': 'application/json',
});

export interface TransferCharge {
  reference: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  expiresAt: string;
}

/** One-time account number for this payment ("Pay with Transfer"). */
export const chargeBankTransfer = async (
  email: string,
  amount: number,
  expiresAt: Date,
  metadata: Record<string, any>
): Promise<TransferCharge> => {
  const reference = `PAY-${crypto.randomUUID()}`;
  try {
    const { data } = await axios.post(
      `${PAYSTACK_BASE_URL}/charge`,
      {
        email,
        amount: Math.round(amount * 100),
        reference,
        metadata,
        bank_transfer: { account_expires_at: expiresAt.toISOString() },
      },
      { headers: chargeHeaders() }
    );
    const d = data?.data;
    if (!data?.status || d?.status !== 'pending_bank_transfer' || !d?.account_number) {
      throw new Error(data?.message || 'Bank transfer is not available right now');
    }
    return {
      reference: d.reference || reference,
      bankName: d.bank?.name || 'Bank',
      accountNumber: String(d.account_number),
      accountName: d.account_name || 'Gadgets Bidding',
      expiresAt: d.account_expires_at || expiresAt.toISOString(),
    };
  } catch (error: any) {
    logGatewayError('Paystack bank transfer charge error', error);
    throw new Error(error.response?.data?.message || error.message || 'Bank transfer is not available right now');
  }
};

/** A USSD code the buyer dials on the phone linked to their bank account. */
export const chargeUssd = async (
  email: string,
  amount: number,
  bank: UssdBankCode,
  metadata: Record<string, any>
): Promise<{ reference: string; ussdCode: string }> => {
  const reference = `PAY-${crypto.randomUUID()}`;
  try {
    const { data } = await axios.post(
      `${PAYSTACK_BASE_URL}/charge`,
      { email, amount: Math.round(amount * 100), reference, metadata, ussd: { type: bank } },
      { headers: chargeHeaders() }
    );
    const d = data?.data;
    if (!data?.status || d?.status !== 'pay_offline' || !d?.ussd_code) {
      throw new Error(`${USSD_BANKS[bank]} USSD isn't available right now. Try bank transfer instead.`);
    }
    return { reference: d.reference || reference, ussdCode: d.ussd_code };
  } catch (error: any) {
    logGatewayError('Paystack USSD charge error', error);
    throw new Error(error.response?.data?.message || error.message || 'USSD is not available right now');
  }
};

/** Where a payment stands right now: paid, still waiting, or failed. */
export const paymentState = async (
  reference: string
): Promise<{ state: 'paid' | 'pending' | 'failed'; amount: number; metadata: Record<string, any>; gatewayResponse: any }> => {
  try {
    const { data } = await axios.get(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: chargeHeaders(),
    });
    const d = data?.data ?? {};
    const status = String(d.status || '');
    const state = status === 'success' ? 'paid' : ['failed', 'reversed'].includes(status) ? 'failed' : 'pending';
    return { state, amount: (d.amount || 0) / 100, metadata: d.metadata || {}, gatewayResponse: d };
  } catch (error: any) {
    // Paystack answers 400 "Transaction reference not found" until the money lands for some channels.
    if (error.response?.status === 400) return { state: 'pending', amount: 0, metadata: {}, gatewayResponse: {} };
    logGatewayError('Paystack payment state error', error);
    throw new Error('Could not check the payment right now');
  }
};

/**
 * Refund a successful Paystack transaction in full, back to the card or bank it came from.
 * Paystack processes it in the background (usually 3–5 working days to reach the buyer).
 */
export const refundTransaction = async (
  reference: string,
  merchantNote = 'Gadgets Bidding case refund'
): Promise<{ id: string; status: string }> => {
  try {
    const { data } = await axios.post(
      `${PAYSTACK_BASE_URL}/refund`,
      { transaction: reference, merchant_note: merchantNote },
      { headers: chargeHeaders() }
    );
    if (!data?.status) throw new Error(data?.message || 'Refund was not accepted');
    return { id: String(data.data?.id ?? ''), status: String(data.data?.status ?? 'pending') };
  } catch (error: any) {
    logGatewayError('Paystack refund error', error);
    throw new Error(error.response?.data?.message || error.message || 'Refund could not be started');
  }
};
