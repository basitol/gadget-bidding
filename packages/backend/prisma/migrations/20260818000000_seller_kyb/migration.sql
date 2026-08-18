-- Lightweight seller KYB (business identity) fields. Self-declared for now,
-- no admin review workflow — this just gates listing creation until a
-- seller has told us who they are.
ALTER TABLE users ADD COLUMN business_name VARCHAR(255);
ALTER TABLE users ADD COLUMN cac_number VARCHAR(50);
ALTER TABLE users ADD COLUMN seller_kyb_completed_at TIMESTAMP(6);
