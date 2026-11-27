-- Support chat for buyers as well as sellers. A thread now belongs to any user, records which
-- side of the marketplace opened it, and can point at the order it is about. Columns are
-- renamed (not copied) so every existing seller thread keeps its messages and unread counts.
ALTER TABLE "support_threads" RENAME COLUMN "seller_id" TO "user_id";
ALTER TABLE "support_threads" RENAME COLUMN "seller_unread_count" TO "owner_unread_count";
ALTER TABLE "support_threads" RENAME CONSTRAINT "support_threads_seller_id_fkey" TO "support_threads_user_id_fkey";
ALTER INDEX "idx_support_threads_seller" RENAME TO "idx_support_threads_user";

-- 'buyer' or 'seller'. Threads used to be seller-only, but Help > Contact support already let
-- buyers write in, so take each thread's side from its owner's role (sellers and admins are sellers).
ALTER TABLE "support_threads" ADD COLUMN "owner_role" VARCHAR(20) NOT NULL DEFAULT 'seller';
UPDATE "support_threads" t
   SET "owner_role" = CASE WHEN u."role" IN ('seller', 'admin') THEN 'seller' ELSE 'buyer' END
  FROM "users" u
 WHERE u."id" = t."user_id";
ALTER TABLE "support_threads" ALTER COLUMN "owner_role" DROP DEFAULT;

-- The order a buyer last asked about, when they opened help from an order page.
ALTER TABLE "support_threads" ADD COLUMN "order_id" UUID;
ALTER TABLE "support_threads"
  ADD CONSTRAINT "support_threads_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_support_threads_order" ON "support_threads"("order_id");
