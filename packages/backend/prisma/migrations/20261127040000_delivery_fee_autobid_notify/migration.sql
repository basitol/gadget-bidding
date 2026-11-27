-- Flat delivery fee on orders (included in total_amount), and the auto-bid "tell me at my max" switch.
ALTER TABLE "orders" ADD COLUMN "delivery_fee" DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE "auto_bids" ADD COLUMN "notify_on_max" BOOLEAN NOT NULL DEFAULT true;
