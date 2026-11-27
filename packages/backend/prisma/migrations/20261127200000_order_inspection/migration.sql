-- What the hub checked before an order left it: the seven checks (passed or not), how many
-- passed, a note, who checked it and when. Null until someone records the inspection; an order
-- can't leave the hub (shipped or collected) until all seven checks pass.
ALTER TABLE "orders" ADD COLUMN "inspection" JSONB;
