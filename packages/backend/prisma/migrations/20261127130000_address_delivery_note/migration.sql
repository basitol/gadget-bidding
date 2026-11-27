-- Saved addresses: an optional note for the rider ("Call when you get to the gate").
-- The nearest landmark keeps using address_line2.
ALTER TABLE "user_addresses" ADD COLUMN "delivery_note" VARCHAR(200);
