-- Payment deadline that can be reset (second-chance offers start a fresh 24 hours on accept).
-- NULL keeps the old rule: created_at + payment window.
ALTER TABLE "orders" ADD COLUMN "payment_due_at" TIMESTAMP(6);
-- Second-chance offer: the next bidder has until this time to accept or decline.
ALTER TABLE "orders" ADD COLUMN "offer_expires_at" TIMESTAMP(6);
-- When the buyer confirmed the item arrived okay (or we confirmed for them after 48 hours).
ALTER TABLE "orders" ADD COLUMN "buyer_confirmed_at" TIMESTAMP(6);

-- Orders already delivered before this change count as confirmed.
UPDATE "orders" SET "buyer_confirmed_at" = COALESCE("updated_at", "created_at")
WHERE "fulfillment_status" = 'delivered';

-- After 3 missed payments, bidding pauses for 30 days (the account itself stays usable).
ALTER TABLE "users" ADD COLUMN "bidding_paused_until" TIMESTAMP(6);

-- A buyer's missed payment, kept even after the order moves to the next bidder.
CREATE TABLE "missed_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "order_id" UUID,
    "order_number" VARCHAR(50) NOT NULL,
    "auction_id" UUID,
    "category_id" UUID,
    "gadget_title" VARCHAR(255) NOT NULL,
    "gadget_image" TEXT,
    "winning_bid" DECIMAL(15,2) NOT NULL,
    "forfeited_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "auction_ended_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "missed_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "missed_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "missed_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE INDEX "idx_missed_payments_user" ON "missed_payments"("user_id", "created_at" DESC);

-- More precise problem types for "Report a problem".
ALTER TABLE "disputes" DROP CONSTRAINT IF EXISTS "disputes_dispute_type_check";
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_dispute_type_check" CHECK (
  "dispute_type" IN (
    'item_not_received', 'item_damaged', 'item_not_as_described', 'not_working',
    'missing_parts', 'wrong_item', 'fraud', 'other'
  )
);
