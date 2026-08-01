-- Seller ↔ admin support chat
CREATE TABLE IF NOT EXISTS "support_threads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "seller_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "subject" VARCHAR(255),
    "last_message_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "last_message_preview" VARCHAR(255),
    "seller_unread_count" INTEGER NOT NULL DEFAULT 0,
    "admin_unread_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_threads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "support_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "thread_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_support_threads_seller" ON "support_threads"("seller_id", "status");
CREATE INDEX IF NOT EXISTS "idx_support_threads_status" ON "support_threads"("status", "last_message_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_support_messages_thread" ON "support_messages"("thread_id", "created_at");

ALTER TABLE "support_threads"
  ADD CONSTRAINT "support_threads_seller_id_fkey"
  FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_messages"
  ADD CONSTRAINT "support_messages_thread_id_fkey"
  FOREIGN KEY ("thread_id") REFERENCES "support_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_messages"
  ADD CONSTRAINT "support_messages_sender_id_fkey"
  FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
