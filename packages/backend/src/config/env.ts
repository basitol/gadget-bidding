import config from './index';
import logger from '../utils/logger';

const INSECURE_JWT_PLACEHOLDERS = [
  'jwt_secret_change_this',
  'refresh_secret_change_this',
  'your_super_secret_jwt_key_change_this_in_production',
  'your_super_secret_refresh_key_change_this_in_production',
];

function isInsecureSecret(value: string): boolean {
  return (
    value.length < 32 ||
    INSECURE_JWT_PLACEHOLDERS.some(placeholder => value.includes(placeholder))
  );
}

/**
 * Validate environment and secrets before the server accepts traffic.
 */
export function validateEnvironment(): void {
  const errors: string[] = [];

  if (!config.database.url) {
    errors.push(
      'DATABASE_URL is missing. Set it in packages/backend/.env (e.g. postgresql://user@localhost:5432/gadget_bidding)'
    );
  }

  if (config.nodeEnv === 'production') {
    if (isInsecureSecret(config.jwt.secret)) {
      errors.push('JWT_SECRET must be set to a strong random value (32+ chars) in production');
    }
    if (isInsecureSecret(config.jwt.refreshSecret)) {
      errors.push(
        'JWT_REFRESH_SECRET must be set to a strong random value (32+ chars) in production'
      );
    }
    if (!config.paystack.secretKey) {
      errors.push('PAYSTACK_SECRET_KEY is required in production');
    }
    if (!config.termii.apiKey) {
      errors.push('TERMII_API_KEY is required in production');
    }
  } else {
    if (isInsecureSecret(config.jwt.secret)) {
      logger.warn(
        'Using default JWT_SECRET in development. Set a strong secret in packages/backend/.env before production.'
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n- ${errors.join('\n- ')}`);
  }

  logger.info('Environment validation passed');
}
