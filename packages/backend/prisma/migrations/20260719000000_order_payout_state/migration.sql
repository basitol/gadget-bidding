ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payout_status VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payout_paid_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS payout_reference VARCHAR(100);

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_payout_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_payout_status_check
  CHECK (payout_status IN ('pending', 'ready', 'held', 'paid'));

CREATE INDEX IF NOT EXISTS idx_orders_payout
  ON orders(payout_status, fulfillment_status);
