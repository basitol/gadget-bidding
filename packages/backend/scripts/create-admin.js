#!/usr/bin/env node
/**
 * Create or promote an admin user.
 *
 * Usage:
 *   node scripts/create-admin.js 08011111111 AdminPass123 "Platform Admin"
 */
const bcrypt = require('bcrypt');
const { Client } = require('pg');
require('dotenv').config();

async function main() {
  const phoneArg = process.argv[2] || '08011111111';
  const password = process.argv[3] || 'Admin1234';
  const fullName = process.argv[4] || 'Platform Admin';

  let phone = phoneArg.replace(/\D/g, '');
  if (phone.startsWith('0') && phone.length === 11) {
    phone = `+234${phone.slice(1)}`;
  } else if (phone.startsWith('234') && phone.length === 13) {
    phone = `+${phone}`;
  } else if (!phone.startsWith('+')) {
    phone = phoneArg.startsWith('+') ? phoneArg : `+${phone}`;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL missing in packages/backend/.env');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await client.query(
    'SELECT id, role FROM users WHERE phone_number = $1',
    [phone]
  );

  if (existing.rows.length > 0) {
    await client.query(
      `UPDATE users
       SET role = 'admin', password_hash = $1, full_name = $2, is_verified = true, updated_at = NOW()
       WHERE phone_number = $3`,
      [passwordHash, fullName, phone]
    );
    console.log(`Updated existing user to admin: ${phone}`);
  } else {
    const user = await client.query(
      `INSERT INTO users (phone_number, password_hash, full_name, role, is_verified)
       VALUES ($1, $2, $3, 'admin', true)
       RETURNING id`,
      [phone, passwordHash, fullName]
    );
    await client.query(
      `INSERT INTO wallets (user_id, balance, currency)
       VALUES ($1, 0, 'NGN')
       ON CONFLICT (user_id) DO NOTHING`,
      [user.rows[0].id]
    );
    console.log(`Created admin user: ${phone}`);
  }

  console.log(`Password: ${password}`);
  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
