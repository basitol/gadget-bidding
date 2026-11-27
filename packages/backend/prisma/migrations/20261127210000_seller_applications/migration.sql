-- Seller onboarding: a business application our team reviews by hand
-- (details, CAC / BN number, three private documents, the selling rules).
CREATE TABLE "seller_applications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
  "business_name" VARCHAR(255),
  "owner_name" VARCHAR(255),
  "plaza" VARCHAR(120),
  "shop_number" VARCHAR(60),
  "business_phone" VARCHAR(15),
  "area" VARCHAR(80) NOT NULL DEFAULT 'Computer Village, Ikeja',
  "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "registration_type" VARCHAR(2),
  "registration_number" VARCHAR(20),
  "number_check" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "number_checked_at" TIMESTAMP(6),
  "documents" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "rules_accepted_at" TIMESTAMP(6),
  "submitted_at" TIMESTAMP(6),
  "resubmitted_at" TIMESTAMP(6),
  "decided_at" TIMESTAMP(6),
  "reviewed_by" UUID,
  "team_note" VARCHAR(500),
  "reject_reason" VARCHAR(1000),
  "second_review_requested_at" TIMESTAMP(6),
  "approval_seen_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seller_applications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "seller_applications_status_check" CHECK ("status" IN ('draft', 'in_review', 'needs_info', 'approved', 'rejected')),
  CONSTRAINT "seller_applications_registration_type_check" CHECK ("registration_type" IS NULL OR "registration_type" IN ('rc', 'bn')),
  CONSTRAINT "seller_applications_number_check_check" CHECK ("number_check" IN ('pending', 'matched', 'not_matched'))
);
CREATE UNIQUE INDEX "seller_applications_user_id_key" ON "seller_applications"("user_id");
CREATE INDEX "idx_seller_applications_status" ON "seller_applications"("status", "submitted_at");
ALTER TABLE "seller_applications" ADD CONSTRAINT "seller_applications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "seller_applications" ADD CONSTRAINT "seller_applications_reviewed_by_fkey"
  FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Sellers who went through the old two-field check keep their result.
INSERT INTO "seller_applications" ("user_id", "status", "business_name", "owner_name", "registration_type",
  "registration_number", "submitted_at", "decided_at", "reject_reason", "approval_seen_at")
SELECT u."id",
  CASE u."seller_kyb_status" WHEN 'pending' THEN 'in_review' WHEN 'approved' THEN 'approved' ELSE 'rejected' END,
  u."business_name", u."full_name",
  CASE WHEN u."cac_number" ILIKE 'BN%' THEN 'bn' WHEN u."cac_number" IS NOT NULL THEN 'rc' END,
  NULLIF(LEFT(regexp_replace(COALESCE(u."cac_number", ''), '[^0-9]', '', 'g'), 20), ''),
  u."seller_kyb_submitted_at", u."seller_kyb_reviewed_at", u."seller_kyb_rejection_reason",
  CASE WHEN u."seller_kyb_status" = 'approved' THEN CURRENT_TIMESTAMP END
FROM "users" u
WHERE u."seller_kyb_status" IN ('pending', 'approved', 'rejected');

-- 2-step sign-in: authenticator app or text message as well as email.
ALTER TABLE "users" ADD COLUMN "two_factor_method" VARCHAR(10);
ALTER TABLE "users" ADD COLUMN "totp_secret" VARCHAR(255);
ALTER TABLE "users" ADD COLUMN "two_factor_phone" VARCHAR(15);
UPDATE "users" SET "two_factor_method" = 'email' WHERE "two_factor_enabled" = true;

-- Phones that already passed 2-step sign-in (stored as a hash of the app's device id).
CREATE TABLE "trusted_devices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "device_hash" VARCHAR(64) NOT NULL,
  "label" VARCHAR(100),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trusted_devices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "trusted_devices_user_id_device_hash_key" ON "trusted_devices"("user_id", "device_hash");
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sellers' payout account (must be in the registered business name).
ALTER TABLE "users" ADD COLUMN "payout_bank_code" VARCHAR(20);
ALTER TABLE "users" ADD COLUMN "payout_bank_name" VARCHAR(100);
ALTER TABLE "users" ADD COLUMN "payout_account_number" VARCHAR(20);
ALTER TABLE "users" ADD COLUMN "payout_account_name" VARCHAR(255);
ALTER TABLE "users" ADD COLUMN "payout_account_added_at" TIMESTAMP(6);
