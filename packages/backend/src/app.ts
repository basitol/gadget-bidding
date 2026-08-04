import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import config from './config';
import logger from './utils/logger';
import { sendError } from './utils/response';
import { prisma } from './config/prisma';
import redisClient from './config/redis';
import {
  globalRateLimiter,
  pollingRateLimiter,
} from './api/middlewares/security.middleware';

// Import routes
import authRoutes from './api/routes/auth.routes';
import walletRoutes from './api/routes/wallet.routes';
import webhookRoutes from './api/routes/webhook.routes';
import gadgetRoutes from './api/routes/gadget.routes';
import auctionRoutes from './api/routes/auction.routes';
import bidRoutes from './api/routes/bid.routes';
import orderRoutes from './api/routes/order.routes';
import addressRoutes from './api/routes/address.routes';
import notificationRoutes from './api/routes/notification.routes';
import supportRoutes from './api/routes/support.routes';
import adminRoutes from './api/routes/admin.routes';
import sellerRoutes from './api/routes/seller.routes';
import * as walletController from './api/controllers/wallet.controller';

const app: Application = express();

const apiRouteGroups = [
  { name: 'auth', path: `/api/${config.apiVersion}/auth` },
  { name: 'wallet', path: `/api/${config.apiVersion}/wallet` },
  { name: 'gadgets', path: `/api/${config.apiVersion}/gadgets` },
  { name: 'auctions', path: `/api/${config.apiVersion}/auctions` },
  { name: 'bids', path: `/api/${config.apiVersion}/bids` },
  { name: 'orders', path: `/api/${config.apiVersion}/orders` },
  { name: 'addresses', path: `/api/${config.apiVersion}/addresses` },
  {
    name: 'notifications',
    path: `/api/${config.apiVersion}/notifications`,
  },
  { name: 'support', path: `/api/${config.apiVersion}/support` },
  { name: 'admin', path: `/api/${config.apiVersion}/admin` },
  { name: 'seller', path: `/api/${config.apiVersion}/seller` },
  { name: 'webhooks', path: `/api/${config.apiVersion}/webhooks` },
] as const;

const getServiceChecks = async () => {
  const checks = [
    {
      name: 'api',
      status: 'ok',
    },
  ];

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({ name: 'database', status: 'ok' });
  } catch (error) {
    checks.push({ name: 'database', status: 'degraded' });
    logger.warn('Health check database probe failed:', error);
  }

  try {
    await redisClient.ping();
    checks.push({ name: 'redis', status: 'ok' });
  } catch (error) {
    checks.push({ name: 'redis', status: 'degraded' });
    logger.warn('Health check redis probe failed:', error);
  }

  return checks;
};

// Trust reverse proxy in deployed environments (rate limits, secure cookies)
if (config.isDeployed) {
  app.set('trust proxy', 1);
}

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: config.isDeployed,
    crossOriginEmbedderPolicy: false,
  })
);

// CORS
app.use(
  cors({
    origin: config.isDeployed
      ? [config.frontendUrl, config.mobileAppUrl]
      : true,
    credentials: config.isDeployed,
  })
);

// Paystack webhooks require raw body for signature verification
app.use(
  `/api/${config.apiVersion}/webhooks`,
  express.raw({ type: 'application/json', limit: '1mb' }),
  webhookRoutes
);

// JSON body parser for all other routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global rate limit
app.use(pollingRateLimiter);
app.use(globalRateLimiter);

// Logging (never log Authorization headers)
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
}

// Health check — minimal info in production
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ...(config.nodeEnv === 'development' && {
      uptime: process.uptime(),
      environment: config.nodeEnv,
    }),
  });
});

app.get('/healthz', (req: Request, res: Response) => {
  res.status(200).send('ok');
});

app.get(`/api/${config.apiVersion}/health`, async (req: Request, res: Response) => {
  const checks = await getServiceChecks();
  const unhealthy = checks.some(check => check.status !== 'ok');

  res.status(unhealthy ? 503 : 200).json({
    status: unhealthy ? 'degraded' : 'ok',
    timestamp: new Date().toISOString(),
    version: config.apiVersion,
    checks,
  });
});

app.get(`/api/${config.apiVersion}/routes`, (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    version: config.apiVersion,
    routes: apiRouteGroups,
  });
});

// API version endpoint
app.get(`/api/${config.apiVersion}`, (req: Request, res: Response) => {
  res.status(200).json({
    message: 'Gadget Bidding API',
    version: config.apiVersion,
    status: 'running',
  });
});

// Payment redirect fallback route for browser Paystack callbacks
app.get('/wallet/verify', walletController.handlePaymentCallback);

// Local gadget image uploads (dev / without Cloudinary)
app.use(
  '/uploads',
  express.static(path.join(process.cwd(), 'uploads'), {
    maxAge: '7d',
    fallthrough: true,
  })
);

// API Routes (webhooks mounted above with raw parser)
app.use(`/api/${config.apiVersion}/auth`, authRoutes);
app.use(`/api/${config.apiVersion}/wallet`, walletRoutes);
app.use(`/api/${config.apiVersion}/gadgets`, gadgetRoutes);
app.use(`/api/${config.apiVersion}/auctions`, auctionRoutes);
app.use(`/api/${config.apiVersion}/bids`, bidRoutes);
app.use(`/api/${config.apiVersion}/orders`, orderRoutes);
app.use(`/api/${config.apiVersion}/addresses`, addressRoutes);
app.use(`/api/${config.apiVersion}/notifications`, notificationRoutes);
app.use(`/api/${config.apiVersion}/support`, supportRoutes);
app.use(`/api/${config.apiVersion}/admin`, adminRoutes);
app.use(`/api/${config.apiVersion}/seller`, sellerRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  sendError(res, 'Route not found', 404);
});

// Global error handler — no stack traces in deployed environments
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error:', err);

  if (!config.isDeployed) {
    return sendError(res, err.message, 500);
  }

  sendError(res, 'Internal server error', 500);
});

export default app;
