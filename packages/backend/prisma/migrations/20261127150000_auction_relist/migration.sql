-- Relisting: a gadget can go up for auction again after a run that didn't sell.
-- Only one run may be open (scheduled or live) at a time.
ALTER TABLE "auctions" DROP CONSTRAINT IF EXISTS "auctions_gadget_id_key";
CREATE INDEX IF NOT EXISTS "idx_auctions_gadget" ON "auctions" ("gadget_id");
CREATE UNIQUE INDEX IF NOT EXISTS "auctions_one_open_per_gadget"
  ON "auctions" ("gadget_id")
  WHERE "status" IN ('scheduled', 'active');
