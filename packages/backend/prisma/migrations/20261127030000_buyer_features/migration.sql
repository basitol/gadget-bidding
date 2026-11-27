-- Buyer features: watchlist, auto-bid, saved searches, saved cards, ratings, 2-step sign-in.
-- AlterTable
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "watchlist" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "auction_id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_bids" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "auction_id" UUID NOT NULL,
    "max_amount" DECIMAL(15,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auto_bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_searches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "query" VARCHAR(120),
    "category_slug" VARCHAR(100),
    "max_price" DECIMAL(15,2),
    "last_notified_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_cards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL DEFAULT 'paystack',
    "authorization_code" VARCHAR(100) NOT NULL,
    "signature" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "brand" VARCHAR(30) NOT NULL,
    "last4" VARCHAR(4) NOT NULL,
    "exp_month" VARCHAR(2) NOT NULL,
    "exp_year" VARCHAR(4) NOT NULL,
    "bank" VARCHAR(100),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "rater_id" UUID NOT NULL,
    "ratee_id" UUID NOT NULL,
    "score" SMALLINT NOT NULL,
    "comment" VARCHAR(500),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_watchlist_auction" ON "watchlist"("auction_id");

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_user_auction_key" ON "watchlist"("user_id", "auction_id");

-- CreateIndex
CREATE INDEX "idx_auto_bids_auction_active" ON "auto_bids"("auction_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "auto_bids_user_auction_key" ON "auto_bids"("user_id", "auction_id");

-- CreateIndex
CREATE INDEX "idx_saved_searches_user" ON "saved_searches"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_cards_user_signature_key" ON "saved_cards"("user_id", "signature");

-- CreateIndex
CREATE INDEX "idx_ratings_ratee" ON "ratings"("ratee_id");

-- CreateIndex
CREATE UNIQUE INDEX "ratings_order_rater_key" ON "ratings"("order_id", "rater_id");

-- AddForeignKey
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auto_bids" ADD CONSTRAINT "auto_bids_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auto_bids" ADD CONSTRAINT "auto_bids_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "saved_cards" ADD CONSTRAINT "saved_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_rater_id_fkey" FOREIGN KEY ("rater_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_ratee_id_fkey" FOREIGN KEY ("ratee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "ratings" ADD CONSTRAINT "ratings_score_check" CHECK (score BETWEEN 1 AND 5);
ALTER TABLE "auto_bids" ADD CONSTRAINT "auto_bids_max_amount_check" CHECK (max_amount > 0);
