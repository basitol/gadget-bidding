-- Problem reports become "cases": a short number buyers can quote (D-119), a decision
-- (refund or not upheld) with what our team found, one second review, a message thread
-- between buyer, seller and our team, and a return when the decision is a refund.
CREATE SEQUENCE IF NOT EXISTS "disputes_case_number_seq" START WITH 101;
ALTER TABLE "disputes" ADD COLUMN "case_number" INTEGER NOT NULL DEFAULT nextval('disputes_case_number_seq');
ALTER SEQUENCE "disputes_case_number_seq" OWNED BY "disputes"."case_number";
CREATE UNIQUE INDEX "disputes_case_number_key" ON "disputes"("case_number");

-- 'refund' (item goes back, buyer is refunded) or 'not_upheld' (seller is paid, buyer keeps it).
ALTER TABLE "disputes" ADD COLUMN "outcome" VARCHAR(20);
ALTER TABLE "disputes" ADD COLUMN "findings" TEXT;
ALTER TABLE "disputes" ADD COLUMN "decided_at" TIMESTAMP(6);
ALTER TABLE "disputes" ADD COLUMN "second_review_requested_at" TIMESTAMP(6);
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_outcome_check" CHECK ("outcome" IS NULL OR "outcome" IN ('refund', 'not_upheld'));

CREATE TABLE "dispute_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dispute_id" UUID NOT NULL,
    "author_id" UUID,
    -- 'buyer', 'seller' or 'team'
    "author_role" VARCHAR(10) NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dispute_messages_role_check" CHECK ("author_role" IN ('buyer', 'seller', 'team')),
    CONSTRAINT "dispute_messages_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "dispute_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX "idx_dispute_messages_dispute" ON "dispute_messages"("dispute_id", "created_at");

CREATE TABLE "dispute_returns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dispute_id" UUID NOT NULL,
    -- 'dropoff' (buyer brings it to the hub) or 'pickup' (rider collects from the buyer)
    "method" VARCHAR(10) NOT NULL,
    "return_code" VARCHAR(12) NOT NULL,
    -- 'started' → 'received' (at the hub) → 'refunded'
    "status" VARCHAR(10) NOT NULL DEFAULT 'started',
    "pickup_address" JSONB,
    "due_at" TIMESTAMP(6) NOT NULL,
    "started_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_at" TIMESTAMP(6),
    "refunded_at" TIMESTAMP(6),
    -- 'card' (back to the card/bank via Paystack) or 'wallet'
    "refund_destination" VARCHAR(10),
    "refund_reference" VARCHAR(100),

    CONSTRAINT "dispute_returns_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dispute_returns_method_check" CHECK ("method" IN ('dropoff', 'pickup')),
    CONSTRAINT "dispute_returns_status_check" CHECK ("status" IN ('started', 'received', 'refunded')),
    CONSTRAINT "dispute_returns_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "dispute_returns_dispute_id_key" ON "dispute_returns"("dispute_id");
CREATE UNIQUE INDEX "dispute_returns_return_code_key" ON "dispute_returns"("return_code");
