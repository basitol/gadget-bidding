import { Pool } from 'pg';
import config from './index';

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: config.database.url,
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  min: config.database.poolMin,
  max: config.database.poolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err: Error) => {
  console.error('❌ Unexpected error on idle PostgreSQL client:', err);
  process.exit(-1);
});

/**
 * Execute a SQL query
 */
export const query = async <T = any>(
  text: string,
  params?: any[]
): Promise<T[]> => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: result.rowCount });
    return result.rows;
  } catch (error) {
    console.error('Query error:', error);
    throw error;
  }
};

/**
 * Get a client from the pool for transactions
 */
export const getClient = () => {
  return pool.connect();
};

/**
 * Execute a transaction
 */
export const transaction = async <T>(
  callback: (client: any) => Promise<T>
): Promise<T> => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export default pool;
