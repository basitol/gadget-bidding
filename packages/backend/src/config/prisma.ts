import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import logger from '../utils/logger';

// Create PostgreSQL connection pool
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });

// Create Prisma adapter
const adapter = new PrismaPg(pool);

// Create a singleton Prisma client
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Initialize Prisma Client with adapter
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

// Log queries in development
if (process.env.NODE_ENV !== 'production') {
  prisma.$on('query' as never, (e: any) => {
    logger.debug(`Query: ${e.query}`);
    logger.debug(`Duration: ${e.duration}ms`);
  });
}

prisma.$on('error' as never, (e: any) => {
  logger.error('Prisma error:', e);
});

// Prevent multiple instances in development
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Connect to database
export const connectDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info('✅ Prisma connected to database');
  } catch (error) {
    logger.error('❌ Failed to connect to database:', error);
    throw error;
  }
};

// Disconnect from database
export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
  await pool.end();
  logger.info('Prisma disconnected from database');
};

// Transaction helper with proper typing
export const transaction = async <T>(
  fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>
): Promise<T> => {
  return prisma.$transaction(fn);
};

export default prisma;
