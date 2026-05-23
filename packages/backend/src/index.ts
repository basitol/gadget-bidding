import http from 'http';
import app from './app';
import config from './config';
import { connectDatabase, disconnectDatabase } from './config/prisma';
import { connectRedis, disconnectRedis } from './config/redis';
import logger from './utils/logger';
import { initializeSocket } from './services/socket/socket.service';
import { startAuctionJob, stopAuctionJob } from './jobs/auction.job';

// Create HTTP server
const server = http.createServer(app);

// Track if we're shutting down
let isShuttingDown = false;

// Initialize connections and start server
async function startServer() {
  try {
    // Connect to database with Prisma
    await connectDatabase();

    // Connect to Redis
    await connectRedis();
    logger.info('✅ Redis connected');

    // Initialize Socket.io
    initializeSocket(server);
    logger.info('✅ Socket.io initialized');

    // Start background jobs
    startAuctionJob();
    logger.info('✅ Auction job started');

    // Start server
    server.listen(config.port, () => {
      logger.info(
        `🚀 Server running on port ${config.port} in ${config.nodeEnv} mode`
      );
      logger.info(
        `📡 API available at http://localhost:${config.port}/api/${config.apiVersion}`
      );
    });

    // Handle server errors
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(
          `❌ Port ${config.port} is already in use. Retrying in 1 second...`
        );
        setTimeout(() => {
          server.close();
          server.listen(config.port);
        }, 1000);
      } else {
        logger.error('❌ Server error:', error);
        process.exit(1);
      }
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown function
async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    logger.info('Shutdown already in progress...');
    return;
  }

  isShuttingDown = true;
  logger.info(`${signal} signal received: closing HTTP server`);

  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      // Stop background jobs
      stopAuctionJob();
      logger.info('Background jobs stopped');

      // Close Redis connection
      await disconnectRedis();
      logger.info('Redis connection closed');

      // Close database connection (Prisma)
      await disconnectDatabase();
      logger.info('Database connection closed');

      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force exit after 5 seconds if graceful shutdown fails
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
}

// Handle graceful shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', error => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the server
startServer();
