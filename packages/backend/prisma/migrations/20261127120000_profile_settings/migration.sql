-- Personal details: usernames can change once every 30 days.
ALTER TABLE "users" ADD COLUMN "username_changed_at" TIMESTAMP(6);
-- Deleted accounts are anonymised and kept (orders and payouts still reference them).
ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMP(6);

-- Alerts: condition filter and an on/off switch.
-- condition: NULL = any, 'new', 'a_or_better', 'b_or_better'.
ALTER TABLE "saved_searches" ADD COLUMN "condition" VARCHAR(20);
ALTER TABLE "saved_searches" ADD COLUMN "is_enabled" BOOLEAN NOT NULL DEFAULT true;
