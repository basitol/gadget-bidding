-- Prisma migration: sync enums and role model with application code.
-- Apply with: pnpm --filter backend db:migrate

-- Buyer role normalization (legacy `user` -> `bidder`)
UPDATE users SET role = 'bidder' WHERE role = 'user';

-- Gadget conditions (add excellent, for_parts if missing from CHECK constraints)
ALTER TABLE gadgets DROP CONSTRAINT IF EXISTS gadgets_condition_check;
ALTER TABLE gadgets ADD CONSTRAINT gadgets_condition_check
  CHECK (condition IN ('new', 'like_new', 'excellent', 'good', 'fair', 'for_parts'));

-- Wallet transaction types (align with Prisma TransactionType enum)
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_transaction_type_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_transaction_type_check
  CHECK (transaction_type IN ('deposit', 'withdrawal', 'bid_hold', 'bid_release', 'purchase', 'sale', 'refund', 'fee'));

-- Auction statuses (remove unused `completed` if present in old DBs)
UPDATE auctions SET status = 'ended' WHERE status = 'completed';
ALTER TABLE auctions DROP CONSTRAINT IF EXISTS auctions_status_check;
ALTER TABLE auctions ADD CONSTRAINT auctions_status_check
  CHECK (status IN ('scheduled', 'active', 'ended', 'cancelled'));

-- User roles CHECK (bidder, seller, admin)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('bidder', 'seller', 'admin'));
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'bidder';
