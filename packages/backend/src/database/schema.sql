-- ============================================================================
-- Gadget Bidding Platform - PostgreSQL Database Schema
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- USERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(15) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    role VARCHAR(20) DEFAULT 'bidder' CHECK (role IN ('bidder', 'seller', 'admin')),
    is_verified BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    accepted_terms_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_role ON users(role);

-- ============================================================================
-- USER VERIFICATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    verification_type VARCHAR(20) NOT NULL CHECK (verification_type IN ('phone', 'email', 'kyc')),
    verification_code VARCHAR(10),
    is_verified BOOLEAN DEFAULT false,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_verifications_user ON user_verifications(user_id);
CREATE INDEX idx_user_verifications_code ON user_verifications(verification_code) WHERE is_verified = false;

-- ============================================================================
-- REFRESH TOKENS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    device_info JSONB,
    expires_at TIMESTAMP NOT NULL,
    is_revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token) WHERE is_revoked = false;

-- ============================================================================
-- WALLETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    balance DECIMAL(15, 2) DEFAULT 0.00 CHECK (balance >= 0),
    currency VARCHAR(3) DEFAULT 'NGN',
    is_locked BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_wallets_user ON wallets(user_id);

-- ============================================================================
-- WALLET TRANSACTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal', 'bid_hold', 'bid_release', 'purchase', 'sale', 'refund', 'fee')),
    amount DECIMAL(15, 2) NOT NULL,
    balance_before DECIMAL(15, 2) NOT NULL,
    balance_after DECIMAL(15, 2) NOT NULL,
    reference VARCHAR(255) UNIQUE,
    description TEXT,
    metadata JSONB,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_wallet_transactions_wallet ON wallet_transactions(wallet_id, created_at DESC);
CREATE INDEX idx_wallet_transactions_status ON wallet_transactions(status);
CREATE INDEX idx_wallet_transactions_reference ON wallet_transactions(reference) WHERE reference IS NOT NULL;

-- ============================================================================
-- PAYMENT TRANSACTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    wallet_transaction_id UUID REFERENCES wallet_transactions(id),
    payment_gateway VARCHAR(20) NOT NULL CHECK (payment_gateway IN ('paystack', 'monnify', 'bank_transfer')),
    gateway_reference VARCHAR(255) UNIQUE,
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'NGN',
    payment_method VARCHAR(50),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'abandoned')),
    gateway_response JSONB,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_payment_transactions_user ON payment_transactions(user_id);
CREATE INDEX idx_payment_transactions_gateway_ref ON payment_transactions(gateway_reference) WHERE gateway_reference IS NOT NULL;
CREATE INDEX idx_payment_transactions_status ON payment_transactions(status, created_at DESC);

-- ============================================================================
-- GADGET CATEGORIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS gadget_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_gadget_categories_slug ON gadget_categories(slug);
CREATE INDEX idx_gadget_categories_active ON gadget_categories(is_active) WHERE is_active = true;

-- ============================================================================
-- GADGETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS gadgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES gadget_categories(id),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    brand VARCHAR(100),
    model VARCHAR(100),
    condition VARCHAR(20) NOT NULL CHECK (condition IN ('new', 'like_new', 'excellent', 'good', 'fair', 'for_parts')),
    specifications JSONB,
    images TEXT[] NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'listed', 'sold')),
    rejection_reason TEXT,
    auction_starting_price DECIMAL(15, 2),
    auction_reserve_price DECIMAL(15, 2),
    auction_buy_now_price DECIMAL(15, 2),
    auction_bid_increment DECIMAL(15, 2),
    auction_duration_hours INT,
    auction_start_now BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_gadgets_seller ON gadgets(seller_id, status);
CREATE INDEX idx_gadgets_category ON gadgets(category_id);
CREATE INDEX idx_gadgets_status ON gadgets(status);
CREATE INDEX idx_gadgets_search ON gadgets USING gin(to_tsvector('english', title || ' ' || description));

-- ============================================================================
-- AUCTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS auctions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gadget_id UUID UNIQUE REFERENCES gadgets(id) ON DELETE CASCADE,
    seller_id UUID REFERENCES users(id) ON DELETE CASCADE,
    starting_price DECIMAL(15, 2) NOT NULL CHECK (starting_price > 0),
    reserve_price DECIMAL(15, 2),
    current_price DECIMAL(15, 2) NOT NULL,
    bid_increment DECIMAL(15, 2) DEFAULT 100.00,
    buy_now_price DECIMAL(15, 2),
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'ended', 'cancelled')),
    winner_id UUID REFERENCES users(id),
    total_bids INTEGER DEFAULT 0,
    auto_extend_enabled BOOLEAN DEFAULT true,
    auto_extend_minutes INTEGER DEFAULT 5,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT valid_times CHECK (end_time > start_time),
    CONSTRAINT valid_reserve CHECK (reserve_price IS NULL OR reserve_price >= starting_price),
    CONSTRAINT valid_buy_now CHECK (buy_now_price IS NULL OR buy_now_price >= starting_price)
);

CREATE INDEX idx_auctions_status ON auctions(status, start_time, end_time);
CREATE INDEX idx_auctions_active ON auctions(status) WHERE status = 'active';
CREATE INDEX idx_auctions_seller ON auctions(seller_id);
CREATE INDEX idx_auctions_end_time ON auctions(end_time) WHERE status = 'active';

-- ============================================================================
-- BIDS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS bids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auction_id UUID REFERENCES auctions(id) ON DELETE CASCADE,
    bidder_id UUID REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(15, 2) NOT NULL,
    bid_time TIMESTAMP DEFAULT NOW(),
    is_winning BOOLEAN DEFAULT false,
    is_auto_bid BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'outbid', 'withdrawn', 'won')),

    CONSTRAINT unique_bid_per_user_price UNIQUE (auction_id, bidder_id, amount)
);

CREATE INDEX idx_bids_auction_time ON bids(auction_id, bid_time DESC);
CREATE INDEX idx_bids_winning ON bids(auction_id, is_winning) WHERE is_winning = true;
CREATE INDEX idx_bids_bidder ON bids(bidder_id, bid_time DESC);
CREATE INDEX idx_bids_status ON bids(status);

-- ============================================================================
-- BID HOLDS TABLE (Escrow)
-- ============================================================================

CREATE TABLE IF NOT EXISTS bid_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bid_id UUID UNIQUE REFERENCES bids(id) ON DELETE CASCADE,
    wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,
    amount DECIMAL(15, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'held' CHECK (status IN ('held', 'released', 'charged')),
    released_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bid_holds_wallet ON bid_holds(wallet_id, status);
CREATE INDEX idx_bid_holds_bid ON bid_holds(bid_id);

-- ============================================================================
-- ORDERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auction_id UUID UNIQUE REFERENCES auctions(id) ON DELETE CASCADE,
    buyer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    seller_id UUID REFERENCES users(id) ON DELETE CASCADE,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    total_amount DECIMAL(15, 2) NOT NULL,
    platform_fee DECIMAL(15, 2) DEFAULT 0.00,
    seller_payout DECIMAL(15, 2) NOT NULL,
    payout_status VARCHAR(20) DEFAULT 'pending' CHECK (payout_status IN ('pending', 'ready', 'held', 'paid')),
    payout_paid_at TIMESTAMP,
    payout_reference VARCHAR(100),
    payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded')),
    fulfillment_status VARCHAR(50) DEFAULT 'pending' CHECK (fulfillment_status IN ('pending', 'processing', 'sent_to_backoffice', 'received_by_backoffice', 'shipped', 'delivered', 'cancelled')),
    shipping_address JSONB,
    tracking_number VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_orders_buyer ON orders(buyer_id, payment_status);
CREATE INDEX idx_orders_seller ON orders(seller_id, fulfillment_status);
CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_payout ON orders(payout_status, fulfillment_status);
CREATE INDEX idx_orders_status ON orders(payment_status, fulfillment_status);

-- ============================================================================
-- NOTIFICATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    channels VARCHAR(20)[] DEFAULT ARRAY['push']::VARCHAR[],
    is_read BOOLEAN DEFAULT false,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_type ON notifications(notification_type);

-- ============================================================================
-- DISPUTES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    raised_by UUID REFERENCES users(id) ON DELETE CASCADE,
    dispute_type VARCHAR(50) NOT NULL CHECK (dispute_type IN ('item_not_received', 'item_damaged', 'item_not_as_described', 'fraud', 'other')),
    description TEXT NOT NULL,
    evidence JSONB,
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
    resolution TEXT,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_disputes_order ON disputes(order_id);
CREATE INDEX idx_disputes_raised_by ON disputes(raised_by);
CREATE INDEX idx_disputes_status ON disputes(status, created_at DESC);

-- ============================================================================
-- AUDIT LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    changes JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action, created_at DESC);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_transactions_updated_at BEFORE UPDATE ON payment_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gadgets_updated_at BEFORE UPDATE ON gadgets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_auctions_updated_at BEFORE UPDATE ON auctions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_disputes_updated_at BEFORE UPDATE ON disputes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SEED DATA - Default Categories
-- ============================================================================

INSERT INTO gadget_categories (name, slug, description, is_active) VALUES
    ('Smartphones', 'smartphones', 'Mobile phones and smartphones', true),
    ('Laptops', 'laptops', 'Laptop computers', true),
    ('Tablets', 'tablets', 'Tablets and iPads', true),
    ('Smartwatches', 'smartwatches', 'Smartwatches and fitness trackers', true),
    ('Headphones', 'headphones', 'Headphones and earbuds', true),
    ('Cameras', 'cameras', 'Digital cameras and accessories', true),
    ('Gaming', 'gaming', 'Gaming consoles and accessories', true),
    ('Accessories', 'accessories', 'Tech accessories', true)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- VIEWS (Optional - for easier querying)
-- ============================================================================

-- View for active auctions with gadget details
CREATE OR REPLACE VIEW active_auctions_view AS
SELECT
    a.*,
    g.title as gadget_title,
    g.images as gadget_images,
    g.condition as gadget_condition,
    gc.name as category_name,
    u.full_name as seller_name,
    u.avatar_url as seller_avatar,
    EXTRACT(EPOCH FROM (a.end_time - NOW())) as seconds_remaining
FROM auctions a
JOIN gadgets g ON a.gadget_id = g.id
JOIN gadget_categories gc ON g.category_id = gc.id
JOIN users u ON a.seller_id = u.id
WHERE a.status = 'active' AND a.end_time > NOW();

-- View for user wallet summary
CREATE OR REPLACE VIEW user_wallet_summary AS
SELECT
    u.id as user_id,
    u.full_name,
    w.balance,
    w.currency,
    COALESCE(SUM(CASE WHEN bh.status = 'held' THEN bh.amount ELSE 0 END), 0) as held_amount,
    w.balance - COALESCE(SUM(CASE WHEN bh.status = 'held' THEN bh.amount ELSE 0 END), 0) as available_balance
FROM users u
JOIN wallets w ON u.id = w.user_id
LEFT JOIN bid_holds bh ON w.id = bh.wallet_id AND bh.status = 'held'
GROUP BY u.id, u.full_name, w.balance, w.currency;

-- ============================================================================
-- COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE users IS 'User accounts with authentication details';
COMMENT ON TABLE wallets IS 'User wallet balances in Naira';
COMMENT ON TABLE wallet_transactions IS 'All wallet transaction history';
COMMENT ON TABLE payment_transactions IS 'Payment gateway transactions';
COMMENT ON TABLE gadgets IS 'Gadget listings by sellers';
COMMENT ON TABLE auctions IS 'Auction details and status';
COMMENT ON TABLE bids IS 'All bids placed on auctions';
COMMENT ON TABLE bid_holds IS 'Escrow holds for active bids';
COMMENT ON TABLE orders IS 'Orders created from won auctions';
COMMENT ON TABLE notifications IS 'User notifications (push, SMS, email)';
COMMENT ON TABLE disputes IS 'Dispute resolution system';
COMMENT ON TABLE audit_logs IS 'Audit trail for admin actions';

-- ============================================================================
-- FUNCTIONS FOR BIDDING LOGIC
-- ============================================================================

-- Function to get available wallet balance (balance minus held amounts)
CREATE OR REPLACE FUNCTION get_available_balance(wallet_uuid UUID)
RETURNS DECIMAL(15, 2) AS $$
DECLARE
    wallet_balance DECIMAL(15, 2);
    held_amount DECIMAL(15, 2);
BEGIN
    SELECT balance INTO wallet_balance FROM wallets WHERE id = wallet_uuid;

    SELECT COALESCE(SUM(amount), 0) INTO held_amount
    FROM bid_holds
    WHERE wallet_id = wallet_uuid AND status = 'held';

    RETURN wallet_balance - held_amount;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
