-- Add the wallet balance non-negative CHECK constraint to match the inline
-- CHECK already present in src/database/schema.sql. This is the hard DB-level
-- guarantee that backs the atomic balance updates (see src/utils/wallet-balance.ts).
ALTER TABLE wallets
  ADD CONSTRAINT wallets_balance_non_negative CHECK (balance >= 0);
