-- Privacy & your data: two more switches. "Deals and new auctions by email" reuses
-- notification_prefs.marketing, so it isn't stored twice.
ALTER TABLE "users" ADD COLUMN "personalised_picks" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "usage_stats" BOOLEAN NOT NULL DEFAULT true;

-- "Download my data": one open request per person; our team emails a link within 7 days.
CREATE TABLE "data_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    -- Where the link goes (the account email when they asked).
    "email" VARCHAR(255) NOT NULL,
    -- 'open', 'sent' or 'cancelled'
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "requested_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMP(6) NOT NULL,
    "completed_at" TIMESTAMP(6),

    CONSTRAINT "data_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "data_requests_status_check" CHECK ("status" IN ('open', 'sent', 'cancelled')),
    CONSTRAINT "data_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX "idx_data_requests_user" ON "data_requests"("user_id", "status");
CREATE INDEX "idx_data_requests_status" ON "data_requests"("status", "due_at");

-- "Was this helpful?" on help articles: one answer per person per article (they can change it).
CREATE TABLE "help_feedback" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "article" VARCHAR(80) NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "help_feedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "help_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "help_feedback_user_article_key" ON "help_feedback"("user_id", "article");
CREATE INDEX "idx_help_feedback_article" ON "help_feedback"("article", "helpful");
