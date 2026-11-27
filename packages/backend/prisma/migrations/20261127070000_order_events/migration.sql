-- When each order step happened (paid, at hub, checked, shipped, delivered…), for the buyer's
-- tracking timeline. A trigger records every payment/fulfillment status change, so all the
-- code paths that move an order (webhooks, admin, seller, buyer, jobs) are covered.
CREATE TABLE "order_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX "idx_order_events_order" ON "order_events"("order_id", "created_at");

-- Stamped in UTC like the timestamps Prisma writes, whatever the server's time zone is.
CREATE OR REPLACE FUNCTION record_order_event() RETURNS trigger AS $$
BEGIN
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    INSERT INTO order_events (order_id, kind, status, created_at)
    VALUES (NEW.id, 'payment', COALESCE(NEW.payment_status, 'pending'), timezone('UTC', now()));
  END IF;
  IF NEW.fulfillment_status IS DISTINCT FROM OLD.fulfillment_status THEN
    INSERT INTO order_events (order_id, kind, status, created_at)
    VALUES (NEW.id, 'fulfillment', COALESCE(NEW.fulfillment_status, 'pending'), timezone('UTC', now()));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_record_event
AFTER UPDATE OF payment_status, fulfillment_status ON "orders"
FOR EACH ROW EXECUTE FUNCTION record_order_event();

-- Existing orders: their current step, dated by their last update (best we know).
INSERT INTO "order_events" ("order_id", "kind", "status", "created_at")
SELECT "id", 'payment', "payment_status", COALESCE("updated_at", "created_at", CURRENT_TIMESTAMP)
FROM "orders"
WHERE "payment_status" IS NOT NULL AND "payment_status" <> 'pending';

INSERT INTO "order_events" ("order_id", "kind", "status", "created_at")
SELECT "id", 'fulfillment', "fulfillment_status", COALESCE("updated_at", "created_at", CURRENT_TIMESTAMP)
FROM "orders"
WHERE "fulfillment_status" IS NOT NULL AND "fulfillment_status" <> 'pending';
