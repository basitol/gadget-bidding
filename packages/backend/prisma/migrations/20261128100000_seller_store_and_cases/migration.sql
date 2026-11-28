-- Seller store, cases and money (design › seller board).

-- Store: away mode, closing, and the 7-day payout pause after a payout account change.
ALTER TABLE "users" ADD COLUMN "store_away" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "store_closed_at" TIMESTAMP(6);
ALTER TABLE "users" ADD COLUMN "payouts_paused_until" TIMESTAMP(6);

-- Reviews: "Well packed?" from the buyer, and the seller's public reply.
ALTER TABLE "ratings" ADD COLUMN "well_packed" BOOLEAN;
ALTER TABLE "ratings" ADD COLUMN "seller_reply" VARCHAR(500);
ALTER TABLE "ratings" ADD COLUMN "seller_replied_at" TIMESTAMP(6);

-- Cases: what the hub found (rows the team writes), the seller's side, and what happens to a returned item.
ALTER TABLE "disputes" ADD COLUMN "hub_findings" JSONB;
ALTER TABLE "disputes" ADD COLUMN "seller_position" VARCHAR(20);
ALTER TABLE "disputes" ADD COLUMN "seller_replied_at" TIMESTAMP(6);
ALTER TABLE "disputes" ADD COLUMN "seller_accepted_at" TIMESTAMP(6);
ALTER TABLE "disputes" ADD COLUMN "seller_second_review_requested_at" TIMESTAMP(6);
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_seller_position_check"
  CHECK ("seller_position" IS NULL OR "seller_position" IN ('matched', 'partly'));
ALTER TABLE "dispute_returns" ADD COLUMN "seller_return_method" VARCHAR(10);
ALTER TABLE "dispute_returns" ADD COLUMN "seller_return_chosen_at" TIMESTAMP(6);
ALTER TABLE "dispute_returns" ADD COLUMN "returned_to_seller_at" TIMESTAMP(6);
ALTER TABLE "dispute_returns" ADD CONSTRAINT "dispute_returns_seller_return_method_check"
  CHECK ("seller_return_method" IS NULL OR "seller_return_method" IN ('collect', 'deliver'));

-- Store staff: which ID they show at the hub, and the code we text them.
ALTER TABLE "store_staff" ADD COLUMN "id_type" VARCHAR(30);
ALTER TABLE "store_staff" ADD COLUMN "pickup_code" VARCHAR(10);

-- Listing views per day (Sales insights compares periods).
CREATE TABLE "auction_view_days" (
  "auction_id" UUID NOT NULL,
  "day" DATE NOT NULL,
  "views" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "auction_view_days_pkey" PRIMARY KEY ("auction_id", "day")
);
ALTER TABLE "auction_view_days" ADD CONSTRAINT "auction_view_days_auction_id_fkey"
  FOREIGN KEY ("auction_id") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Charges taken off a seller's next payout (e.g. a rider bringing a returned item to the shop).
CREATE TABLE "seller_charges" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "seller_id" UUID NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  "reason" VARCHAR(200) NOT NULL,
  "order_id" UUID,
  "dispute_id" UUID,
  -- pending → applied (taken off a payout) | waived
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "payout_id" UUID,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "applied_at" TIMESTAMP(6),
  CONSTRAINT "seller_charges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "seller_charges_status_check" CHECK ("status" IN ('pending', 'applied', 'waived'))
);
CREATE INDEX "idx_seller_charges_seller" ON "seller_charges"("seller_id", "status");
ALTER TABLE "seller_charges" ADD CONSTRAINT "seller_charges_seller_id_fkey"
  FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "seller_charges" ADD CONSTRAINT "seller_charges_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "seller_charges" ADD CONSTRAINT "seller_charges_dispute_id_fkey"
  FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "seller_charges" ADD CONSTRAINT "seller_charges_payout_id_fkey"
  FOREIGN KEY ("payout_id") REFERENCES "seller_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- One return-delivery charge per case.
CREATE UNIQUE INDEX "seller_charges_dispute_reason_key" ON "seller_charges"("dispute_id", "reason");

-- A payout's charges come off its amount.
ALTER TABLE "seller_payouts" ADD COLUMN "charges_total" DECIMAL(15,2) NOT NULL DEFAULT 0;
