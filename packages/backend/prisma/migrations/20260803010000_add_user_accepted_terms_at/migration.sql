-- Record when a user explicitly accepts the Terms of Service and Privacy
-- Policy at account creation (required by the register endpoint).
ALTER TABLE users
  ADD COLUMN accepted_terms_at TIMESTAMP(6);
