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
  metadata?: Record<string, any>
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
