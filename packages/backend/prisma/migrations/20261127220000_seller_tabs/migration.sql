-- Seller app tabs: automatic payouts at 6 pm, store details and staff, listing views.

-- A day's payout to a seller's bank: the orders that were ready at 6 pm (Lagos), sent as one transfer.
CREATE TABLE "seller_payouts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "seller_id" UUID NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  "order_count" INTEGER NOT NULL DEFAULT 0,
  -- sending (transfer started, or waiting for our team to send it by hand) → paid | failed
  "status" VARCHAR(20) NOT NULL DEFAULT 'sending',
  "scheduled_for" TIMESTAMP(6) NOT NULL,
  "reference" VARCHAR(100) NOT NULL,
  "transfer_code" VARCHAR(100),
  "bank_name" VARCHAR(100),
  "account_last4" VARCHAR(4),
  "account_name" VARCHAR(255),
  "paid_at" TIMESTAMP(6),
  "failure_reason" VARCHAR(500),
  "marked_by" UUID,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seller_payouts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "seller_payouts_status_check" CHECK ("status" IN ('sending', 'paid', 'failed'))
);
CREATE UNIQUE INDEX "seller_payouts_reference_key" ON "seller_payouts"("reference");
CREATE INDEX "idx_seller_payouts_seller" ON "seller_payouts"("seller_id", "created_at");
CREATE INDEX "idx_seller_payouts_status" ON "seller_payouts"("status");
ALTER TABLE "seller_payouts" ADD CONSTRAINT "seller_payouts_seller_id_fkey"
  FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "seller_payouts" ADD CONSTRAINT "seller_payouts_marked_by_fkey"
  FOREIGN KEY ("marked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Orders in a payout that's on its way are 'sending'.
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_payout_status_check";
ALTER TABLE "orders" ADD CONSTRAINT "orders_payout_status_check"
  CHECK ("payout_status" IN ('pending', 'ready', 'held', 'sending', 'paid'));
ALTER TABLE "orders" ADD COLUMN "payout_batch_id" UUID;
CREATE INDEX "idx_orders_payout_batch" ON "orders"("payout_batch_id");
ALTER TABLE "orders" ADD CONSTRAINT "orders_payout_batch_id_fkey"
  FOREIGN KEY ("payout_batch_id") REFERENCES "seller_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Store details the seller edits (buyers see them on the store page).
ALTER TABLE "users" ADD COLUMN "store_about" VARCHAR(500);
-- { mon..sun: { open: "09:00", close: "18:00" } | null }
ALTER TABLE "users" ADD COLUMN "store_hours" JSONB;

-- People who can drop off and collect at the hub for a store.
CREATE TABLE "store_staff" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "seller_id" UUID NOT NULL,
  "full_name" VARCHAR(255) NOT NULL,
  "phone" VARCHAR(15) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "store_staff_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_store_staff_seller" ON "store_staff"("seller_id");
ALTER TABLE "store_staff" ADD CONSTRAINT "store_staff_seller_id_fkey"
  FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Listing views for Sales insights (counted when someone other than the seller opens it).
ALTER TABLE "auctions" ADD COLUMN "view_count" INTEGER NOT NULL DEFAULT 0;
