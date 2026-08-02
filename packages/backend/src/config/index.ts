import dotenv from 'dotenv';
import path from 'path';

// Load packages/backend/.env (works from src/ and dist/)
const backendEnvPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: backendEnvPath });

const isProduction = process.env.NODE_ENV === 'production';
const appEnv = process.env.APP_ENV || process.env.NODE_ENV || 'development';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

interface Config {
  // Server
  appEnv: string;
  nodeEnv: string;
  port: number;
  apiVersion: string;

  // Database
  database: {
    url: string;
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    poolMin: number;
    poolMax: number;
  };

  // Redis
  redis: {
    url: string;
    host: string;
    port: number;
  };

  // JWT
  jwt: {
    secret: string;
    refreshSecret: string;
    accessExpiry: string;
    refreshExpiry: string;
  };

  // Payment Gateways
  paystack: {
    secretKey: string;
    publicKey: string;
    webhookUrl: string;
  };

  flutterwave: {
    secretKey: string;
    publicKey: string;
    webhookUrl: string;
  };

  // SMS (Termii)
  termii: {
    apiKey: string;
    senderId: string;
    apiUrl: string;
  };

  // Cloudinary
  cloudinary: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
  };

  // App URLs
  frontendUrl: string;
  mobileAppUrl: string;

  // Security
  bcryptSaltRounds: number;
  otpExpiryMinutes: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  rateLimitReadMaxRequests: number;
  rateLimitWriteMaxRequests: number;
  rateLimitAuthMaxRequests: number;
  rateLimitAuthSessionMaxRequests: number;
  rateLimitOtpMaxRequests: number;
  rateLimitBidMaxRequests: number;
  rateLimitWalletFundingMaxRequests: number;
  rateLimitWalletWithdrawalMaxRequests: number;
  rateLimitPaymentVerificationMaxRequests: number;
  rateLimitSupportMessageMaxRequests: number;
  rateLimitNotificationMutationMaxRequests: number;
  rateLimitAdminMutationMaxRequests: number;

  // Platform Settings
  platformFeePercentage: number;
  minBidIncrement: number;
  defaultAuctionDurationHours: number;
  autoExtendMinutes: number;

  // File Upload
  maxFileSizeMB: number;
  allowedImageTypes: string[];
  maxImagesPerGadget: number;

  // Logging
  logLevel: string;
  logFilePath: string;
}

const config: Config = {
  // Server
  appEnv,
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiVersion: process.env.API_VERSION || 'v1',

  // Database — DATABASE_URL is the single source of truth for Prisma
  database: {
    url: process.env.DATABASE_URL || '',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'gadget_bidding',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    poolMin: parseInt(process.env.DB_POOL_MIN || '2', 10),
    poolMax: parseInt(process.env.DB_POOL_MAX || '10', 10),
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },

  // JWT
  jwt: {
    secret: isProduction
      ? requireEnv('JWT_SECRET')
      : process.env.JWT_SECRET || 'jwt_secret_change_this',
    refreshSecret: isProduction
      ? requireEnv('JWT_REFRESH_SECRET')
      : process.env.JWT_REFRESH_SECRET || 'refresh_secret_change_this',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '24h', // Increased for development
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '30d',
  },

  // Payment Gateways
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY || '',
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    webhookUrl: process.env.PAYSTACK_WEBHOOK_URL || '',
  },

  flutterwave: {
    secretKey: process.env.FLUTTERWAVE_SECRET_KEY || '',
    publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY || '',
    webhookUrl: process.env.FLUTTERWAVE_WEBHOOK_URL || '',
  },

  // SMS (Termii)
  termii: {
    apiKey: process.env.TERMII_API_KEY || '',
    senderId: process.env.TERMII_SENDER_ID || 'N-Alert',
    apiUrl: process.env.TERMII_API_URL || 'https://v3.api.termii.com/api',
  },

  // Cloudinary
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },

  // App URLs
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  mobileAppUrl: process.env.MOBILE_APP_URL || 'gadgetbid://',

  // Security
  bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10),
  otpExpiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  rateLimitMaxRequests: parseInt(
    process.env.RATE_LIMIT_MAX_REQUESTS || '100',
    10
  ),
  rateLimitReadMaxRequests: parseInt(
    process.env.RATE_LIMIT_READ_MAX_REQUESTS || '1000',
    10
  ),
  rateLimitWriteMaxRequests: parseInt(
    process.env.RATE_LIMIT_WRITE_MAX_REQUESTS || '300',
    10
  ),
  rateLimitAuthMaxRequests: parseInt(
    process.env.RATE_LIMIT_AUTH_MAX_REQUESTS || '20',
    10
  ),
  rateLimitAuthSessionMaxRequests: parseInt(
    process.env.RATE_LIMIT_AUTH_SESSION_MAX_REQUESTS || '120',
    10
  ),
  rateLimitOtpMaxRequests: parseInt(
    process.env.RATE_LIMIT_OTP_MAX_REQUESTS || '6',
    10
  ),
  rateLimitBidMaxRequests: parseInt(
    process.env.RATE_LIMIT_BID_MAX_REQUESTS || '60',
    10
  ),
  rateLimitWalletFundingMaxRequests: parseInt(
    process.env.RATE_LIMIT_WALLET_FUNDING_MAX_REQUESTS || '10',
    10
  ),
  rateLimitWalletWithdrawalMaxRequests: parseInt(
    process.env.RATE_LIMIT_WALLET_WITHDRAWAL_MAX_REQUESTS || '10',
    10
  ),
  rateLimitPaymentVerificationMaxRequests: parseInt(
    process.env.RATE_LIMIT_PAYMENT_VERIFICATION_MAX_REQUESTS || '60',
    10
  ),
  rateLimitSupportMessageMaxRequests: parseInt(
    process.env.RATE_LIMIT_SUPPORT_MESSAGE_MAX_REQUESTS || '30',
    10
  ),
  rateLimitNotificationMutationMaxRequests: parseInt(
    process.env.RATE_LIMIT_NOTIFICATION_MUTATION_MAX_REQUESTS || '120',
    10
  ),
  rateLimitAdminMutationMaxRequests: parseInt(
    process.env.RATE_LIMIT_ADMIN_MUTATION_MAX_REQUESTS || '120',
    10
  ),

  // Platform Settings
  platformFeePercentage: parseFloat(process.env.PLATFORM_FEE_PERCENTAGE || '5'),
  minBidIncrement: parseInt(process.env.MIN_BID_INCREMENT || '100', 10),
  defaultAuctionDurationHours: parseInt(
    process.env.DEFAULT_AUCTION_DURATION_HOURS || '24',
    10
  ),
  autoExtendMinutes: parseInt(process.env.AUTO_EXTEND_MINUTES || '5', 10),

  // File Upload
  maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB || '5', 10),
  allowedImageTypes: (
    process.env.ALLOWED_IMAGE_TYPES || 'image/jpeg,image/png,image/webp'
  ).split(','),
  maxImagesPerGadget: parseInt(process.env.MAX_IMAGES_PER_GADGET || '5', 10),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  logFilePath: process.env.LOG_FILE_PATH || 'logs/app.log',
};

export default config;
