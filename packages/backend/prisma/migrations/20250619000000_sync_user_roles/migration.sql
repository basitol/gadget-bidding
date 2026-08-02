-- Align legacy buyer role values with Prisma UserRole enum / schema.sql CHECK constraint.
-- Guard table access so Prisma shadow database replay does not fail if this
-- legacy data-cleanup migration is applied in an environment without the
-- original hand-managed baseline table.
DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    UPDATE users SET role = 'bidder' WHERE role = 'user';
  END IF;
END $$;

-- Optional: normalize any unknown roles to bidder (review manually in production)
-- UPDATE users SET role = 'bidder' WHERE role NOT IN ('bidder', 'seller', 'admin');
