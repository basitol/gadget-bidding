-- Replace the self-declared "completed" timestamp with a real
-- pending/approved/rejected review workflow — seller KYB now requires
-- manual admin approval, not just submission.
ALTER TABLE users DROP COLUMN seller_kyb_completed_at;
ALTER TABLE users ADD COLUMN seller_kyb_status VARCHAR(20) NOT NULL DEFAULT 'not_started';
ALTER TABLE users ADD COLUMN seller_kyb_submitted_at TIMESTAMP(6);
ALTER TABLE users ADD COLUMN seller_kyb_reviewed_at TIMESTAMP(6);
ALTER TABLE users ADD COLUMN seller_kyb_rejection_reason VARCHAR(500);
