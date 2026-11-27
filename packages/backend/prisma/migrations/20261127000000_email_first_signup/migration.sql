-- Email-first buyer sign-up: username + interests on users, and pre-account email checks.
ALTER TABLE "users" ADD COLUMN "username" VARCHAR(20);
ALTER TABLE "users" ADD COLUMN "interests" JSONB;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

ALTER TABLE "user_verifications" ADD COLUMN "target" VARCHAR(255);
CREATE INDEX "idx_user_verifications_target" ON "user_verifications"("target");
