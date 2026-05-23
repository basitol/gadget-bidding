import { createClient, RedisClientType } from 'redis';
import config from './index';

// Create Redis client
const redisClient: RedisClientType = createClient({
  url: config.redis.url,
  socket: {
    reconnectStrategy: (retries: number) => {
      if (retries > 10) {
        console.error('Redis reconnection failed after 10 attempts');
        return new Error('Redis reconnection failed');
      }
      return retries * 100;
    },
  },
});

redisClient.on('connect', () => {
  console.log('✅ Connected to Redis');
});

redisClient.on('error', (err: Error) => {
  console.error('❌ Redis Client Error:', err);
});

redisClient.on('reconnecting', () => {
  console.log('🔄 Reconnecting to Redis...');
});

// Connect to Redis
export const connectRedis = async () => {
  try {
    await redisClient.connect();
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    throw error;
  }
};

// Disconnect from Redis
export const disconnectRedis = async () => {
  try {
    if (redisClient.isOpen) {
      await redisClient.quit();
    }
  } catch (error) {
    console.error('Failed to disconnect from Redis:', error);
  }
};

export default redisClient;
