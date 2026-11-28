-- Store staff get their own sign-in: the owner adds them by email, they join from the seller log in.

-- A staff account can only see its store's drop-offs and collections.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_role_check";
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("role" IN ('bidder', 'seller', 'admin', 'staff'));

-- The email they sign in with (lowercase), the account once they join, and when the last invite went out.
ALTER TABLE "store_staff" ADD COLUMN "email" VARCHAR(255);
ALTER TABLE "store_staff" ADD COLUMN "user_id" UUID;
ALTER TABLE "store_staff" ADD COLUMN "joined_at" TIMESTAMP(6);
ALTER TABLE "store_staff" ADD COLUMN "invite_sent_at" TIMESTAMP(6);
CREATE UNIQUE INDEX "store_staff_email_key" ON "store_staff"("email");
CREATE UNIQUE INDEX "store_staff_user_id_key" ON "store_staff"("user_id");
ALTER TABLE "store_staff" ADD CONSTRAINT "store_staff_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
