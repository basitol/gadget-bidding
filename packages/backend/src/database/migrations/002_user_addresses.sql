-- Saved buyer delivery addresses.
CREATE TABLE IF NOT EXISTS user_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label VARCHAR(80) NOT NULL DEFAULT 'Delivery address',
    full_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    address_line1 VARCHAR(200) NOT NULL,
    address_line2 VARCHAR(200),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20),
    country VARCHAR(100) NOT NULL DEFAULT 'Nigeria',
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user ON user_addresses(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_addresses_one_default
    ON user_addresses(user_id)
    WHERE is_default = true;
