UPDATE users SET role = 'bidder' WHERE role IS NULL;

ALTER TABLE users
  ALTER COLUMN role SET NOT NULL;
