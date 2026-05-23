import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import config from './config';
import logger from './utils/logger';
import { sendError } from './utils/response';

// Import routes
import authRoutes from './api/routes/auth.routes';
import walletRoutes from './api/routes/wallet.routes';
import webhookRoutes from './api/routes/webhook.routes';
import gadgetRoutes from './api/routes/gadget.routes';
import auctionRoutes from './api/routes/auction.routes';
import bidRoutes from './api/routes/bid.routes';
import orderRoutes from './api/routes/order.routes';
import notificationRoutes from './api/routes/notification.routes';

// Create Express app
const app: Application = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin:
      config.nodeEnv === 'production'
        ? [config.frontendUrl, config.mobileAppUrl]
        : true,
    credentials: config.nodeEnv === 'production',
  })
);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
}

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.nodeEnv,
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

// API Routes
app.use(`/api/${config.apiVersion}/auth`, authRoutes);
app.use(`/api/${config.apiVersion}/wallet`, walletRoutes);
app.use(`/api/${config.apiVersion}/webhooks`, webhookRoutes);
app.use(`/api/${config.apiVersion}/gadgets`, gadgetRoutes);
app.use(`/api/${config.apiVersion}/auctions`, auctionRoutes);
app.use(`/api/${config.apiVersion}/bids`, bidRoutes);
app.use(`/api/${config.apiVersion}/orders`, orderRoutes);
app.use(`/api/${config.apiVersion}/notifications`, notificationRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  sendError(res, 'Route not found', 404);
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error:', err);

  if (config.nodeEnv === 'development') {
    return sendError(res, err.message, 500);
  }

  sendError(res, 'Internal server error', 500);
});

export default app;
