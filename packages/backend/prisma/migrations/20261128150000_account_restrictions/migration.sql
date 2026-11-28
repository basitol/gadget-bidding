-- Users › Suspend a buyer, pause a seller's listings, restore them (design › Users board).

-- What the team did to an account, why, for how long, and who. One active (or pending) per person.
CREATE TABLE "account_restrictions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  -- suspend (a buyer can't sign in, bid or pay) | pause_listings (a seller's auctions pause, no new listings, payouts held)
  "kind" VARCHAR(20) NOT NULL,
  "reason" VARCHAR(30) NOT NULL,
  "note" VARCHAR(500),
  -- null = permanent (suspend) or until fixed (pause)
  "until" TIMESTAMP(6),
  "close_store" BOOLEAN NOT NULL DEFAULT false,
  -- pending (a second admin has to approve) → active → lifted | declined
  "status" VARCHAR(20) NOT NULL DEFAULT 'active',
  "requested_by" UUID,
  "approver_id" UUID,
  "applied_at" TIMESTAMP(6),
  -- Paused auctions and what they had left, so restoring gives the time back.
  "meta" JSONB,
  "lifted_at" TIMESTAMP(6),
  "lifted_by" UUID,
  -- served | mistake | appeal | expired
  "lift_reason" VARCHAR(20),
  "lift_note" VARCHAR(500),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "account_restrictions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "account_restrictions_kind_check" CHECK ("kind" IN ('suspend', 'pause_listings')),
  CONSTRAINT "account_restrictions_status_check" CHECK ("status" IN ('pending', 'active', 'lifted', 'declined'))
);
CREATE INDEX "idx_account_restrictions_user" ON "account_restrictions"("user_id", "status");
CREATE INDEX "idx_account_restrictions_until" ON "account_restrictions"("status", "until");
CREATE UNIQUE INDEX "account_restrictions_one_open" ON "account_restrictions"("user_id") WHERE "status" IN ('pending', 'active');
ALTER TABLE "account_restrictions" ADD CONSTRAINT "account_restrictions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "account_restrictions" ADD CONSTRAINT "account_restrictions_requested_by_fkey"
  FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "account_restrictions" ADD CONSTRAINT "account_restrictions_approver_id_fkey"
  FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "account_restrictions" ADD CONSTRAINT "account_restrictions_lifted_by_fkey"
  FOREIGN KEY ("lifted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Notes the team keeps on a person (Users › Notes), including the note left with a suspension.
CREATE TABLE "user_notes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "author_id" UUID,
  -- note | suspend | pause | restore
  "kind" VARCHAR(20) NOT NULL DEFAULT 'note',
  "body" VARCHAR(1000) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_user_notes_user" ON "user_notes"("user_id", "created_at" DESC);
ALTER TABLE "user_notes" ADD CONSTRAINT "user_notes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_notes" ADD CONSTRAINT "user_notes_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- "Last active" on a person's page (updated at most every few minutes while they use the app).
ALTER TABLE "users" ADD COLUMN "last_active_at" TIMESTAMP(6);

-- A paused seller's auctions stop (no bids, no ending) until restored with the time they had left.
ALTER TABLE "auctions" DROP CONSTRAINT IF EXISTS "auctions_status_check";
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_status_check"
  CHECK ("status" IN ('scheduled', 'active', 'ended', 'cancelled', 'paused'));
