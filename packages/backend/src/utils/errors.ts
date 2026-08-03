import config from '../config';
import logger from './logger';

/**
 * Return a safe client-facing error message. Logs the real error server-side.
 */
export function safeErrorMessage(
  error: unknown,
  fallback = 'Something went wrong'
): string {
  if (error instanceof Error) {
    logger.error(error.message, { stack: error.stack });
  } else {
    logger.error(String(error));
  }

  if (config.isDeployed) {
    return fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

/** User-safe messages for known business errors (shown in prod too). */
export const USER_ERRORS = {
  PAYMENT_NOT_FOUND: 'Payment reference not found',
  PAYMENT_NOT_YOURS: 'This payment does not belong to your account',
  PAYMENT_AMOUNT_MISMATCH: 'Payment amount does not match',
  PAYMENT_ALREADY_PROCESSED: 'Payment already processed',
  PAYMENT_FAILED: 'Payment verification failed',
  WITHDRAWALS_DISABLED:
    'Withdrawals are temporarily unavailable. Please contact support.',
} as const;
