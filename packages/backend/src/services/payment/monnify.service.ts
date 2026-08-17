import axios from 'axios';
import crypto from 'crypto';
import config from '../../config';
import logger from '../../utils/logger';

/**
 * Log a gateway error without leaking sensitive response bodies
 * (customer names, account numbers, card metadata) to the logs.
 */
const logGatewayError = (context: string, error: unknown): void => {
  const err = error as {
    response?: { status?: number; data?: { responseMessage?: string } };
    message?: string;
  };
  logger.error(
    `${context}: status=${err.response?.status ?? 'n/a'} message=${
      err.response?.data?.responseMessage || err.message || 'Unknown gateway error'
    }`
  );
};

// Monnify access tokens are short-lived (~1hr); cache and reuse until near expiry.
let cachedToken: { token: string; expiresAt: number } | null = null;

const getAccessToken = async (): Promise<string> => {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  try {
    const credentials = Buffer.from(
      `${config.monnify.apiKey}:${config.monnify.secretKey}`
    ).toString('base64');

    const response = await axios.post(
      `${config.monnify.baseUrl}/api/v1/auth/login`,
      {},
      { headers: { Authorization: `Basic ${credentials}` } }
    );

    const body = response.data?.responseBody;
    if (!response.data?.requestSuccessful || !body?.accessToken) {
      throw new Error('Failed to authenticate with Monnify');
    }

    // expiresIn is in seconds; refresh a little early to avoid edge-of-expiry failures.
    cachedToken = {
      token: body.accessToken,
      expiresAt: Date.now() + (body.expiresIn - 60) * 1000,
    };

    return cachedToken.token;
  } catch (error) {
    logGatewayError('Monnify auth error', error);
    throw new Error('Failed to authenticate with payment gateway');
  }
};

export interface MonnifyInitializeResponse {
  authorization_url: string;
  access_code: string;
  reference: string;
}

/**
 * Initialize Monnify payment (hosted checkout).
 */
export const initializePayment = async (
  email: string,
  amount: number,
  userId: string,
  metadata?: Record<string, any>
): Promise<MonnifyInitializeResponse> => {
  try {
    const reference = `PAY-${crypto.randomUUID()}`;
    const token = await getAccessToken();

    const response = await axios.post(
      `${config.monnify.baseUrl}/api/v1/merchant/transactions/init-transaction`,
      {
        amount,
        customerEmail: email,
        customerName: email,
        paymentReference: reference,
        paymentDescription: 'Wallet funding',
        currencyCode: 'NGN',
        contractCode: config.monnify.contractCode,
        redirectUrl: `${config.backendUrl}/wallet/verify?reference=${encodeURIComponent(
          reference
        )}`,
        paymentMethods: ['CARD', 'ACCOUNT_TRANSFER'],
        metadata: {
          user_id: userId,
          ...metadata,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const body = response.data?.responseBody;
    if (response.data?.requestSuccessful && body?.checkoutUrl) {
      logger.info(`Monnify payment initialized: ${reference} - ₦${amount}`);

      return {
        authorization_url: body.checkoutUrl,
        access_code: body.transactionReference,
        reference: body.paymentReference || reference,
      };
    }

    throw new Error('Failed to initialize payment');
  } catch (error: any) {
    logGatewayError('Monnify initialization error', error);
    throw new Error(
      error.response?.data?.responseMessage || 'Failed to initialize payment'
    );
  }
};

/**
 * Verify Monnify payment by our payment reference.
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
    const token = await getAccessToken();

    const response = await axios.get(
      `${config.monnify.baseUrl}/api/v1/merchant/transactions/query`,
      {
        params: { paymentReference: reference },
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const body = response.data?.responseBody;
    const paid =
      response.data?.requestSuccessful && body?.paymentStatus === 'PAID';

    if (paid) {
      const amount = body.amountPaid ?? body.amount;
      logger.info(`Payment verified: ${reference} - ₦${amount}`);

      return {
        status: true,
        amount,
        currency: body.currencyCode || 'NGN',
        metadata: body.metaData || {},
        gatewayResponse: body,
      };
    }

    return {
      status: false,
      amount: 0,
      currency: 'NGN',
      metadata: {},
      gatewayResponse: body || response.data,
    };
  } catch (error: any) {
    logGatewayError('Monnify verification error', error);
    throw new Error('Failed to verify payment');
  }
};

/**
 * Verify Monnify webhook signature.
 * Monnify sends a `monnify-signature` header: SHA512(secretKey + rawRequestBody).
 */
export const verifyWebhookSignature = (
  payload: string,
  signature: string
): boolean => {
  if (!signature || !config.monnify.secretKey) {
    return false;
  }

  const hash = crypto
    .createHash('sha512')
    .update(config.monnify.secretKey + payload)
    .digest('hex');

  const expected = Buffer.from(hash, 'utf8');
  const received = Buffer.from(signature, 'utf8');

  if (expected.length !== received.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, received);
};

/**
 * List Nigerian banks (Monnify's supported disbursement banks).
 */
export const listBanks = async (): Promise<
  Array<{ id: number; name: string; code: string }>
> => {
  try {
    const token = await getAccessToken();
    const response = await axios.get(
      `${config.monnify.baseUrl}/api/v1/banks`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const banks = response.data?.responseBody || [];
    return banks.map((bank: any, index: number) => ({
      id: index,
      name: bank.name,
      code: bank.code,
    }));
  } catch (error) {
    logGatewayError('List banks error', error);
    return [];
  }
};

/**
 * Resolve account number via Monnify.
 */
export const resolveAccountNumber = async (
  accountNumber: string,
  bankCode: string
): Promise<{ account_number: string; account_name: string }> => {
  try {
    const token = await getAccessToken();
    const response = await axios.get(
      `${config.monnify.baseUrl}/api/v1/disbursements/account/validate`,
      {
        params: { accountNumber, bankCode },
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const body = response.data?.responseBody;
    if (response.data?.requestSuccessful && body?.accountName) {
      return {
        account_number: body.accountNumber,
        account_name: body.accountName,
      };
    }

    throw new Error('Could not resolve account number');
  } catch (error: any) {
    logGatewayError('Resolve account error', error);
    throw new Error(
      error.response?.data?.responseMessage || 'Invalid account details'
    );
  }
};
