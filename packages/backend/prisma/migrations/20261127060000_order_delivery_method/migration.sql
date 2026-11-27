-- Home delivery vs free pickup at the hub.
ALTER TABLE "orders" ADD COLUMN "delivery_method" VARCHAR(10) NOT NULL DEFAULT 'delivery';
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_method_check" CHECK (delivery_method IN ('delivery','pickup'));
