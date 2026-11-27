-- Buyers can report a listing (stolen, fake, wrong details). Private: sellers never see who.
CREATE TABLE "listing_reports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "auction_id" UUID NOT NULL REFERENCES "auctions"("id") ON DELETE CASCADE,
  "gadget_id" UUID REFERENCES "gadgets"("id") ON DELETE SET NULL,
  "reporter_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reason" VARCHAR(20) NOT NULL CHECK ("reason" IN ('stolen', 'fake', 'wrong_details', 'other')),
  "details" TEXT,
  "status" VARCHAR(20) NOT NULL DEFAULT 'open' CHECK ("status" IN ('open', 'actioned', 'dismissed')),
  "resolution_note" TEXT,
  "reviewed_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "listing_reports_pkey" PRIMARY KEY ("id")
);
-- One report per person per auction.
CREATE UNIQUE INDEX "listing_reports_auction_reporter_key" ON "listing_reports" ("auction_id", "reporter_id");
CREATE INDEX "idx_listing_reports_status" ON "listing_reports" ("status", "created_at");
