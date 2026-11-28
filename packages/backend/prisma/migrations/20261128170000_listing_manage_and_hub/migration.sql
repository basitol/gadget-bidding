-- Managing a live listing: photos and a bidder note added after it went live (checked by our team first).
ALTER TABLE "gadgets" ADD COLUMN "pending_images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "gadgets" ADD COLUMN "bidder_note" TEXT;
ALTER TABLE "gadgets" ADD COLUMN "bidder_note_pending" TEXT;

-- Why the seller ended an auction early.
ALTER TABLE "auctions" ADD COLUMN "end_reason" VARCHAR(40);

-- Getting a sold item to the hub, and what happens after a failed hub check.
ALTER TABLE "orders" ADD COLUMN "hub_method" VARCHAR(10);
ALTER TABLE "orders" ADD COLUMN "hub_checklist_at" TIMESTAMP(6);
ALTER TABLE "orders" ADD COLUMN "rider_pickup" JSONB;
ALTER TABLE "orders" ADD COLUMN "failed_choice" VARCHAR(20);
ALTER TABLE "orders" ADD COLUMN "failed_choice_at" TIMESTAMP(6);
ALTER TABLE "orders" ADD COLUMN "second_check_at" TIMESTAMP(6);
ALTER TABLE "orders" ADD COLUMN "returned_to_seller_at" TIMESTAMP(6);
ALTER TABLE "orders" ADD CONSTRAINT "orders_hub_method_check" CHECK ("hub_method" IS NULL OR "hub_method" IN ('dropoff', 'rider'));
ALTER TABLE "orders" ADD CONSTRAINT "orders_failed_choice_check" CHECK ("failed_choice" IS NULL OR "failed_choice" IN ('collect', 'deliver', 'second_check'));

-- "Request a review" when new listings are paused.
ALTER TABLE "users" ADD COLUMN "listing_review_requested_at" TIMESTAMP(6);
