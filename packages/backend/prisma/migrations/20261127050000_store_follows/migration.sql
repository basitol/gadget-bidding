-- Buyers following seller stores.
CREATE TABLE "follows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "follower_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "follows_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "follows_follower_seller_key" ON "follows"("follower_id", "seller_id");
CREATE INDEX "idx_follows_seller" ON "follows"("seller_id");
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "follows" ADD CONSTRAINT "follows_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "follows" ADD CONSTRAINT "follows_not_self" CHECK (follower_id <> seller_id);
