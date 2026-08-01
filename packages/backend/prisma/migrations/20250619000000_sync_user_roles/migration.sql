-- Align legacy buyer role values with Prisma UserRole enum / schema.sql CHECK constraint
UPDATE users SET role = 'bidder' WHERE role = 'user';

-- Optional: normalize any unknown roles to bidder (review manually in production)
-- UPDATE users SET role = 'bidder' WHERE role NOT IN ('bidder', 'seller', 'admin');
