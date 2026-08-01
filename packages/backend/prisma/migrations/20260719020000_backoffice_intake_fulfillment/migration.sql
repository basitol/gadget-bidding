UPDATE orders
SET fulfillment_status = 'sent_to_backoffice'
WHERE fulfillment_status = 'ready_for_pickup';

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname
    INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'orders'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%fulfillment_status%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE orders DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE orders
  ADD CONSTRAINT orders_fulfillment_status_check
  CHECK (fulfillment_status IN ('pending', 'processing', 'sent_to_backoffice', 'received_by_backoffice', 'shipped', 'delivered', 'cancelled'));
