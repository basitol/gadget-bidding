import config from './index';
import logger from '../utils/logger';

const LOCAL_URL_PATTERNS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '10.0.2.2',
  '192.168.',
  '172.16.',
];

const INSECURE_JWT_PLACEHOLDERS = [
  'jwt_secret_change_this',
  'refresh_secret_change_this',
  'your_super_secret_jwt_key_change_this_in_production',
  'your_super_secret_refresh_key_change_this_in_production',
  'change_this',
  'changeme',
  'secret',
  'password',
  'test',
  'dev',
];

const PLACEHOLDER_VALUES = [
  'your-domain.com',
  'your_cloud_name',
  'xxxxxxxx',
  'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  'pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  'TLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  'SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
];

function isInsecureSecret(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    value.length < 48 ||
    INSECURE_JWT_PLACEHOLDERS.some(placeholder =>
      normalized.includes(placeholder)
    )
  );
}

function isPlaceholder(value: string): boolean {
  const normalized = value.toLowerCase();
  return PLACEHOLDER_VALUES.some(placeholder =>
    normalized.includes(placeholder.toLowerCase())
  );
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isLocalUrl(value: string): boolean {
  const normalized = value.toLowerCase();
  return LOCAL_URL_PATTERNS.some(pattern => normalized.includes(pattern));
}

function isValidCustomScheme(value: string): boolean {
  return (
    /^[a-z][a-z0-9+.-]*:\/\/$/i.test(value) ||
    /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
  );
}

function requireProductionValue(
  errors: string[],
  name: string,
  value: string,
  options: {
    https?: boolean;
    livePaystackSecret?: boolean;
    livePaystackPublic?: boolean;
    noLocal?: boolean;
  } = {}
) {
  if (!value || isPlaceholder(value)) {
    errors.push(`${name} is required and must not use a placeholder value`);
    return;
  }

  if (options.https && !isHttpsUrl(value)) {
    errors.push(`${name} must be an HTTPS URL in production`);
  }

  if (options.noLocal && isLocalUrl(value)) {
    errors.push(
      `${name} must not point to localhost or a private LAN address in production`
    );
  }

  if (options.livePaystackSecret && !value.startsWith('sk_live_')) {
    errors.push(
      `${name} must use a Paystack live secret key (sk_live_...) in production`
    );
  }

  if (options.livePaystackPublic && !value.startsWith('pk_live_')) {
    errors.push(
      `${name} must use a Paystack live public key (pk_live_...) in production`
    );
  }
}

function requirePaystackKey(
  errors: string[],
  name: string,
  value: string,
  expectedPrefix: 'sk' | 'pk'
) {
  requireProductionValue(errors, name, value);
  if (!value || isPlaceholder(value)) return;

  const allowedPrefixes =
    config.appEnv === 'production'
      ? [`${expectedPrefix}_live_`]
      : [`${expectedPrefix}_test_`, `${expectedPrefix}_live_`];

  if (!allowedPrefixes.some(prefix => value.startsWith(prefix))) {
    errors.push(
      config.appEnv === 'production'
        ? `${name} must use a Paystack live key in production`
        : `${name} must use a Paystack test or live key in ${config.appEnv}`
    );
  }
}

/**
 * Validate environment and secrets before the server accepts traffic.
 */
export function validateEnvironment(): void {
  const errors: string[] = [];

  if (!['development', 'staging', 'production', 'test'].includes(config.appEnv)) {
    errors.push('APP_ENV must be one of development, staging, production, test');
  }

  if (!config.database.url) {
    errors.push(
      'DATABASE_URL is missing. Set it in packages/backend/.env (e.g. postgresql://user@localhost:5432/gadget_bidding)'
    );
  }

  if (config.isDeployed) {
    if (isInsecureSecret(config.jwt.secret)) {
      errors.push(
        'JWT_SECRET must be set to a strong random value (48+ chars) in production'
      );
    }
    if (isInsecureSecret(config.jwt.refreshSecret)) {
      errors.push(
        'JWT_REFRESH_SECRET must be set to a strong random value (48+ chars) in production'
      );
    }

    if (config.jwt.secret === config.jwt.refreshSecret) {
      errors.push('JWT_SECRET and JWT_REFRESH_SECRET must be different values');
    }

    requireProductionValue(errors, 'DATABASE_URL', config.database.url, {
      noLocal: true,
    });
    requireProductionValue(errors, 'REDIS_URL', config.redis.url, {
      noLocal: true,
    });
    requirePaystackKey(
      errors,
      'PAYSTACK_SECRET_KEY',
      config.paystack.secretKey,
      'sk'
    );
    requirePaystackKey(
      errors,
      'PAYSTACK_PUBLIC_KEY',
      config.paystack.publicKey,
      'pk'
    );
    requireProductionValue(
      errors,
      'PAYSTACK_WEBHOOK_URL',
      config.paystack.webhookUrl,
      {
        https: true,
        noLocal: true,
      }
    );
    if (
      config.paystack.webhookUrl &&
      !config.paystack.webhookUrl.endsWith('/webhooks/paystack')
    ) {
      errors.push(
        'PAYSTACK_WEBHOOK_URL should point to the backend Paystack webhook endpoint'
      );
    }
    requireProductionValue(errors, 'FRONTEND_URL', config.frontendUrl, {
      https: true,
      noLocal: true,
    });
    if (
      !process.env.MOBILE_APP_URL ||
      !config.mobileAppUrl ||
      isPlaceholder(config.mobileAppUrl)
    ) {
      errors.push(
        'MOBILE_APP_URL must be set to the production app deep link or HTTPS app URL'
      );
    } else if (
      !isHttpsUrl(config.mobileAppUrl) &&
      !isValidCustomScheme(config.mobileAppUrl)
    ) {
      errors.push(
        'MOBILE_APP_URL must be an HTTPS URL or valid app URL scheme'
      );
    }
    requireProductionValue(errors, 'TERMII_API_KEY', config.termii.apiKey);
    requireProductionValue(errors, 'RESEND_API_KEY', config.email.resendApiKey);

    const hasCloudinary =
      Boolean(config.cloudinary.cloudName) ||
      Boolean(config.cloudinary.apiKey) ||
      Boolean(config.cloudinary.apiSecret);
    if (hasCloudinary) {
      requireProductionValue(
        errors,
        'CLOUDINARY_CLOUD_NAME',
        config.cloudinary.cloudName
      );
      requireProductionValue(
        errors,
        'CLOUDINARY_API_KEY',
        config.cloudinary.apiKey
      );
      requireProductionValue(
        errors,
        'CLOUDINARY_API_SECRET',
        config.cloudinary.apiSecret
      );
    } else {
      errors.push(
        'Cloudinary credentials are required in production so gadget images do not rely on local disk uploads'
      );
    }

    if (config.jwt.accessExpiry !== '15m') {
      logger.warn(
        `JWT_ACCESS_EXPIRY is ${config.jwt.accessExpiry}; 15m is recommended for production`
      );
    }
    if (config.rateLimitMaxRequests > 300) {
      errors.push('RATE_LIMIT_MAX_REQUESTS is too high for production');
    }
    if (config.rateLimitWriteMaxRequests > 300) {
      errors.push('RATE_LIMIT_WRITE_MAX_REQUESTS is too high for production');
    }
    if (config.rateLimitAuthMaxRequests > 50) {
      errors.push('RATE_LIMIT_AUTH_MAX_REQUESTS is too high for production');
    }
    if (config.rateLimitAuthSessionMaxRequests > 240) {
      errors.push(
        'RATE_LIMIT_AUTH_SESSION_MAX_REQUESTS is too high for production'
      );
    }
    if (config.rateLimitOtpMaxRequests > 10) {
      errors.push('RATE_LIMIT_OTP_MAX_REQUESTS is too high for production');
    }
    if (config.rateLimitBidMaxRequests > 120) {
      errors.push('RATE_LIMIT_BID_MAX_REQUESTS is too high for production');
    }
    if (config.rateLimitWalletFundingMaxRequests > 30) {
      errors.push(
        'RATE_LIMIT_WALLET_FUNDING_MAX_REQUESTS is too high for production'
      );
    }
    if (config.rateLimitWalletWithdrawalMaxRequests > 30) {
      errors.push(
        'RATE_LIMIT_WALLET_WITHDRAWAL_MAX_REQUESTS is too high for production'
      );
    }
    if (config.rateLimitPaymentVerificationMaxRequests > 120) {
      errors.push(
        'RATE_LIMIT_PAYMENT_VERIFICATION_MAX_REQUESTS is too high for production'
      );
    }
    if (config.rateLimitSupportMessageMaxRequests > 60) {
      errors.push(
        'RATE_LIMIT_SUPPORT_MESSAGE_MAX_REQUESTS is too high for production'
      );
    }
    if (config.rateLimitNotificationMutationMaxRequests > 240) {
      errors.push(
        'RATE_LIMIT_NOTIFICATION_MUTATION_MAX_REQUESTS is too high for production'
      );
    }
    if (config.rateLimitAdminMutationMaxRequests > 240) {
      errors.push(
        'RATE_LIMIT_ADMIN_MUTATION_MAX_REQUESTS is too high for production'
      );
    }
    if (!['info', 'warn', 'error'].includes(config.logLevel)) {
      errors.push('LOG_LEVEL must be info, warn, or error in production');
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
