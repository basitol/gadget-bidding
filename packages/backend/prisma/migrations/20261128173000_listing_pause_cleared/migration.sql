-- Our team can lift the automatic "new listings paused" (failed hub checks / refunded sales):
-- failures up to this time stop counting.
ALTER TABLE "users" ADD COLUMN "listing_pause_cleared_at" TIMESTAMP(6);
