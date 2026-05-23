-- ============================================================================
-- SEED TEST AUCTIONS - Items ending in 2, 5, and 10 minutes
-- Run with: psql -d gadget_bidding -f seed-test-auctions.sql
-- ============================================================================

-- Get seller ID (using the seller account with 9's)
DO $$
DECLARE
    seller_id UUID;
    cat_smartphones UUID;
    cat_laptops UUID;
    cat_tablets UUID;
    cat_smartwatches UUID;
    cat_headphones UUID;
    cat_cameras UUID;
    cat_gaming UUID;
    cat_accessories UUID;
    gadget_id UUID;
BEGIN
    -- Get seller (phone ending in 9's)
    SELECT id INTO seller_id FROM users WHERE phone_number LIKE '%9999%' LIMIT 1;
    
    IF seller_id IS NULL THEN
        RAISE EXCEPTION 'Seller not found. Please create a seller account first.';
    END IF;
    
    RAISE NOTICE 'Using seller ID: %', seller_id;
    
    -- Get category IDs
    SELECT id INTO cat_smartphones FROM gadget_categories WHERE slug = 'smartphones';
    SELECT id INTO cat_laptops FROM gadget_categories WHERE slug = 'laptops';
    SELECT id INTO cat_tablets FROM gadget_categories WHERE slug = 'tablets';
    SELECT id INTO cat_smartwatches FROM gadget_categories WHERE slug = 'smartwatches';
    SELECT id INTO cat_headphones FROM gadget_categories WHERE slug = 'headphones';
    SELECT id INTO cat_cameras FROM gadget_categories WHERE slug = 'cameras';
    SELECT id INTO cat_gaming FROM gadget_categories WHERE slug = 'gaming';
    SELECT id INTO cat_accessories FROM gadget_categories WHERE slug = 'accessories';

    -- ============================================================================
    -- SMARTPHONES (2 items: one ends in 2 min, one ends in 10 min)
    -- ============================================================================
    
    -- iPhone 15 Pro Max - ends in 2 minutes
    INSERT INTO gadgets (seller_id, category_id, title, description, brand, model, condition, specifications, images, status)
    VALUES (
        seller_id, cat_smartphones,
        'iPhone 15 Pro Max 256GB - Natural Titanium',
        'Brand new iPhone 15 Pro Max with A17 Pro chip. Comes with original box and accessories. Never used, still sealed.',
        'Apple', 'iPhone 15 Pro Max',
        'new',
        '{"Storage": "256GB", "Color": "Natural Titanium", "Display": "6.7 inch Super Retina XDR", "Chip": "A17 Pro", "Camera": "48MP Main"}'::jsonb,
        ARRAY['https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=800'],
        'approved'
    ) RETURNING id INTO gadget_id;
    
    INSERT INTO auctions (gadget_id, seller_id, starting_price, current_price, bid_increment, buy_now_price, start_time, end_time, status, total_bids)
    VALUES (gadget_id, seller_id, 850000, 850000, 5000, 1200000, NOW() - INTERVAL '1 day', NOW() + INTERVAL '2 minutes', 'active', 0);

    -- Samsung Galaxy S24 Ultra - ends in 10 minutes
    INSERT INTO gadgets (seller_id, category_id, title, description, brand, model, condition, specifications, images, status)
    VALUES (
        seller_id, cat_smartphones,
        'Samsung Galaxy S24 Ultra 512GB - Titanium Black',
        'Flagship Samsung phone with S Pen. Excellent AI features and 200MP camera. Lightly used for 2 weeks.',
        'Samsung', 'Galaxy S24 Ultra',
        'like_new',
        '{"Storage": "512GB", "RAM": "12GB", "Display": "6.8 inch Dynamic AMOLED", "Camera": "200MP Main", "Battery": "5000mAh"}'::jsonb,
        ARRAY['https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=800'],
        'approved'
    ) RETURNING id INTO gadget_id;
    
    INSERT INTO auctions (gadget_id, seller_id, starting_price, current_price, bid_increment, buy_now_price, start_time, end_time, status, total_bids)
    VALUES (gadget_id, seller_id, 750000, 750000, 5000, 1100000, NOW() - INTERVAL '1 day', NOW() + INTERVAL '10 minutes', 'active', 0);

    -- ============================================================================
    -- LAPTOPS (2 items: one ends in 5 min, one ends in 10 min)
    -- ============================================================================
    
    -- MacBook Pro M3 - ends in 5 minutes
    INSERT INTO gadgets (seller_id, category_id, title, description, brand, model, condition, specifications, images, status)
    VALUES (
        seller_id, cat_laptops,
        'MacBook Pro 14" M3 Pro - Space Black',
        'Powerful MacBook Pro with M3 Pro chip. 18GB unified memory and 512GB SSD. Perfect for professionals.',
        'Apple', 'MacBook Pro 14 M3 Pro',
        'like_new',
        '{"Chip": "M3 Pro", "RAM": "18GB", "Storage": "512GB SSD", "Display": "14.2 inch Liquid Retina XDR", "Battery": "Up to 17 hours"}'::jsonb,
        ARRAY['https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800'],
        'approved'
    ) RETURNING id INTO gadget_id;
    
    INSERT INTO auctions (gadget_id, seller_id, starting_price, current_price, bid_increment, buy_now_price, start_time, end_time, status, total_bids)
    VALUES (gadget_id, seller_id, 1200000, 1200000, 10000, 1800000, NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 minutes', 'active', 0);

    -- Dell XPS 15 - ends in 10 minutes
    INSERT INTO gadgets (seller_id, category_id, title, description, brand, model, condition, specifications, images, status)
    VALUES (
        seller_id, cat_laptops,
        'Dell XPS 15 9530 - Intel i9, 32GB RAM',
        'Premium Windows laptop with stunning OLED display. Great for content creators and developers.',
        'Dell', 'XPS 15 9530',
        'good',
        '{"Processor": "Intel Core i9-13900H", "RAM": "32GB DDR5", "Storage": "1TB NVMe SSD", "Display": "15.6 inch 3.5K OLED", "GPU": "RTX 4060"}'::jsonb,
        ARRAY['https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=800'],
        'approved'
    ) RETURNING id INTO gadget_id;
    
    INSERT INTO auctions (gadget_id, seller_id, starting_price, current_price, bid_increment, buy_now_price, start_time, end_time, status, total_bids)
    VALUES (gadget_id, seller_id, 900000, 900000, 5000, 1400000, NOW() - INTERVAL '1 day', NOW() + INTERVAL '10 minutes', 'active', 0);

    -- ============================================================================
    -- TABLETS (2 items: one ends in 2 min, one ends in 5 min)
    -- ============================================================================
    
    -- iPad Pro M4 - ends in 2 minutes
    INSERT INTO gadgets (seller_id, category_id, title, description, brand, model, condition, specifications, images, status)
    VALUES (
        seller_id, cat_tablets,
        'iPad Pro 13" M4 - Space Black 256GB',
        'Latest iPad Pro with M4 chip and stunning tandem OLED display. Includes Apple Pencil Pro.',
        'Apple', 'iPad Pro 13 M4',
        'new',
        '{"Chip": "M4", "Storage": "256GB", "Display": "13 inch Ultra Retina XDR OLED", "Connectivity": "WiFi + Cellular", "Accessories": "Apple Pencil Pro included"}'::jsonb,
        ARRAY['https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=800'],
        'approved'
    ) RETURNING id INTO gadget_id;
    
    INSERT INTO auctions (gadget_id, seller_id, starting_price, current_price, bid_increment, buy_now_price, start_time, end_time, status, total_bids)
    VALUES (gadget_id, seller_id, 800000, 800000, 5000, 1100000, NOW() - INTERVAL '1 day', NOW() + INTERVAL '2 minutes', 'active', 0);

    -- Samsung Galaxy Tab S9 Ultra - ends in 5 minutes
    INSERT INTO gadgets (seller_id, category_id, title, description, brand, model, condition, specifications, images, status)
    VALUES (
        seller_id, cat_tablets,
        'Samsung Galaxy Tab S9 Ultra 512GB',
        'Massive 14.6 inch Android tablet with S Pen. Perfect for productivity and entertainment.',
        'Samsung', 'Galaxy Tab S9 Ultra',
        'like_new',
        '{"Storage": "512GB", "RAM": "12GB", "Display": "14.6 inch Dynamic AMOLED 2X", "Processor": "Snapdragon 8 Gen 2", "S Pen": "Included"}'::jsonb,
        ARRAY['https://images.unsplash.com/photo-1561154464-82e9adf32764?w=800'],
        'approved'
    ) RETURNING id INTO gadget_id;
    
    INSERT INTO auctions (gadget_id, seller_id, starting_price, current_price, bid_increment, buy_now_price, start_time, end_time, status, total_bids)
    VALUES (gadget_id, seller_id, 600000, 600000, 5000, 900000, NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 minutes', 'active', 0);

    -- ============================================================================
    -- SMARTWATCHES (2 items: one ends in 2 min, one ends in 10 min)
    -- ============================================================================
    
    -- Apple Watch Ultra 2 - ends in 2 minutes
    INSERT INTO gadgets (seller_id, category_id, title, description, brand, model, condition, specifications, images, status)
    VALUES (
        seller_id, cat_smartwatches,
        'Apple Watch Ultra 2 - Titanium with Orange Alpine Loop',
        'The ultimate sports watch. 49mm titanium case with precision dual-frequency GPS.',
        'Apple', 'Watch Ultra 2',
        'new',
        '{"Case Size": "49mm", "Material": "Titanium", "Display": "Always-On Retina LTPO OLED", "Water Resistance": "100m", "Battery": "Up to 36 hours"}'::jsonb,
        ARRAY['https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?w=800'],
        'approved'
    ) RETURNING id INTO gadget_id;
    
    INSERT INTO auctions (gadget_id, seller_id, starting_price, current_price, bid_increment, buy_now_price, start_time, end_time, status, total_bids)
    VALUES (gadget_id, seller_id, 450000, 450000, 2500, 650000, NOW() - INTERVAL '1 day', NOW() + INTERVAL '2 minutes', 'active', 0);

    -- Samsung Galaxy Watch 6 Classic - ends in 10 minutes
    INSERT INTO gadgets (seller_id, category_id, title, description, brand, model, condition, specifications, images, status)
    VALUES (
        seller_id, cat_smartwatches,
        'Samsung Galaxy Watch 6 Classic 47mm - Silver',
        'Classic design with rotating bezel. Advanced health monitoring and fitness tracking.',
        'Samsung', 'Galaxy Watch 6 Classic',
        'like_new',
        '{"Case Size": "47mm", "Display": "1.5 inch Super AMOLED", "Processor": "Exynos W930", "Battery": "425mAh", "OS": "Wear OS 4"}'::jsonb,
        ARRAY['https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=800'],
        'approved'
    ) RETURNING id INTO gadget_id;
    
    INSERT INTO auctions (gadget_id, seller_id, starting_price, current_price, bid_increment, buy_now_price, start_time, end_time, status, total_bids)
    VALUES (gadget_id, seller_id, 180000, 180000, 2000, 280000, NOW() - INTERVAL '1 day', NOW() + INTERVAL '10 minutes', 'active', 0);

    -- ============================================================================
    -- HEADPHONES (2 items: one ends in 5 min, one ends in 10 min)
    -- ============================================================================
    
    -- AirPods Max - ends in 5 minutes
    INSERT INTO gadgets (seller_id, category_id, title, description, brand, model, condition, specifications, images, status)
    VALUES (
        seller_id, cat_headphones,
        'Apple AirPods Max - Space Gray',
        'Premium over-ear headphones with incredible sound quality and active noise cancellation.',
        'Apple', 'AirPods Max',
        'like_new',
        '{"Driver": "Apple-designed dynamic", "ANC": "Active Noise Cancellation", "Transparency": "Yes", "Spatial Audio": "Dolby Atmos", "Battery": "20 hours"}'::jsonb,
        ARRAY['https://images.unsplash.com/photo-1613040809024-b4ef7ba99bc3?w=800'],
        'approved'
    ) RETURNING id INTO gadget_id;
    
    INSERT INTO auctions (gadget_id, seller_id, starting_price, current_price, bid_increment, buy_now_price, start_time, end_time, status, total_bids)
    VALUES (gadget_id, seller_id, 280000, 280000, 2000, 420000, NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 minutes', 'active', 0);

    -- Sony WH-1000XM5 - ends in 10 minutes
    INSERT INTO gadgets (seller_id, category_id, title, description, brand, model, condition, specifications, images, status)
    VALUES (
        seller_id, cat_headphones,
        'Sony WH-1000XM5 - Black',
        'Industry-leading noise cancellation with exceptional sound quality. 30-hour battery life.',
        'Sony', 'WH-1000XM5',
        'good',
        '{"Driver": "30mm", "ANC": "Industry-leading", "Codec": "LDAC, AAC, SBC", "Battery": "30 hours", "Quick Charge": "3 min = 3 hours"}'::jsonb,
        ARRAY['https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=800'],
        'approved'
    ) RETURNING id INTO gadget_id;
    
    INSERT INTO auctions (gadget_id, seller_id, starting_price, current_price, bid_increment, buy_now_price, start_time, end_time, status, total_bids)
    VALUES (gadget_id, seller_id, 150000, 150000, 2000, 250000, NOW() - INTERVAL '1 day', NOW() + INTERVAL '10 minutes', 'active', 0);

    -- ============================================================================
    -- CAMERAS (2 items: one ends in 2 min, one ends in 5 min)
    -- ============================================================================
    
    -- Sony A7 IV - ends in 2 minutes
    INSERT INTO gadgets (seller_id, category_id, title, description, brand, model, condition, specifications, images, status)
    VALUES (
        seller_id, cat_cameras,
        'Sony A7 IV Full Frame Mirrorless Camera Body',
        'Professional full-frame camera with 33MP sensor. Excellent for photo and video.',
        'Sony', 'A7 IV',
        'like_new',
        '{"Sensor": "33MP Full Frame", "Video": "4K 60fps", "ISO": "100-51200", "AF Points": "759", "Stabilization": "5-axis IBIS"}'::jsonb,
        ARRAY['https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800'],
        'approved'
    ) RETURNING id INTO gadget_id;
    
    INSERT INTO auctions (gadget_id, seller_id, starting_price, current_price, bid_increment, buy_now_price, start_time, end_time, status, total_bids)
    VALUES (gadget_id, seller_id, 950000, 950000, 10000, 1400000, NOW() - INTERVAL '1 day', NOW() + INTERVAL '2 minutes', 'active', 0);

    -- Canon EOS R6 Mark II - ends in 5 minutes
    INSERT INTO gadgets (seller_id, category_id, title, description, brand, model, condition, specifications, images, status)
    VALUES (
        seller_id, cat_cameras,
        'Canon EOS R6 Mark II with RF 24-105mm Lens',
        'Versatile full-frame camera with kit lens. Great for both stills and video content.',
        'Canon', 'EOS R6 Mark II',
        'good',
        '{"Sensor": "24.2MP Full Frame", "Video": "4K 60fps, 6K RAW", "ISO": "100-102400", "AF": "Dual Pixel CMOS AF II", "Lens": "RF 24-105mm f/4L IS USM"}'::jsonb,
        ARRAY['https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800'],
        'approved'
    ) RETURNING id INTO gadget_id;
    
    INSERT INTO auctions (gadget_id, seller_id, starting_price, current_price, bid_increment, buy_now_price, start_time, end_time, status, total_bids)
    VALUES (gadget_id, seller_id, 1100000, 1100000, 10000, 1600000, NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 minutes', 'active', 0);

    -- ============================================================================
    -- GAMING (2 items: one ends in 5 min, one ends in 10 min)
    -- ============================================================================
    
    -- PlayStation 5 - ends in 5 minutes
    INSERT INTO gadgets (seller_id, category_id, title, description, brand, model, condition, specifications, images, status)
    VALUES (
        seller_id, cat_gaming,
        'PlayStation 5 Disc Edition with Extra Controller',
        'Latest PS5 console with disc drive. Includes extra DualSense controller and 3 games.',
        'Sony', 'PlayStation 5',
        'like_new',
        '{"Storage": "825GB SSD", "Resolution": "4K 120Hz", "Ray Tracing": "Yes", "Controller": "2x DualSense", "Games": "3 included"}'::jsonb,
        ARRAY['https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=800'],
        'approved'
    ) RETURNING id INTO gadget_id;
    
    INSERT INTO auctions (gadget_id, seller_id, starting_price, current_price, bid_increment, buy_now_price, start_time, end_time, status, total_bids)
    VALUES (gadget_id, seller_id, 380000, 380000, 5000, 550000, NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 minutes', 'active', 0);

    -- Nintendo Switch OLED - ends in 10 minutes
    INSERT INTO gadgets (seller_id, category_id, title, description, brand, model, condition, specifications, images, status)
    VALUES (
        seller_id, cat_gaming,
        'Nintendo Switch OLED Model - White',
        'Enhanced Switch with vibrant OLED screen. Perfect for portable gaming.',
        'Nintendo', 'Switch OLED',
        'good',
        '{"Display": "7 inch OLED", "Storage": "64GB", "Dock": "Wired LAN port", "Battery": "4.5-9 hours", "Joy-Con": "White"}'::jsonb,
        ARRAY['https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=800'],
        'approved'
    ) RETURNING id INTO gadget_id;
    
    INSERT INTO auctions (gadget_id, seller_id, starting_price, current_price, bid_increment, buy_now_price, start_time, end_time, status, total_bids)
    VALUES (gadget_id, seller_id, 200000, 200000, 2000, 320000, NOW() - INTERVAL '1 day', NOW() + INTERVAL '10 minutes', 'active', 0);

    -- ============================================================================
    -- ACCESSORIES (2 items: one ends in 2 min, one ends in 5 min)
    -- ============================================================================
    
    -- MagSafe Battery Pack Bundle - ends in 2 minutes
    INSERT INTO gadgets (seller_id, category_id, title, description, brand, model, condition, specifications, images, status)
    VALUES (
        seller_id, cat_accessories,
        'Apple MagSafe Accessories Bundle',
        'Complete MagSafe bundle: Battery Pack, Charger, and Wallet. All original Apple products.',
        'Apple', 'MagSafe Bundle',
        'new',
        '{"Items": "Battery Pack + Charger + Wallet", "Compatibility": "iPhone 12 and later", "Battery Capacity": "1460mAh", "Charger Output": "15W"}'::jsonb,
        ARRAY['https://images.unsplash.com/photo-1609081219090-a6d81d3085bf?w=800'],
        'approved'
    ) RETURNING id INTO gadget_id;
    
    INSERT INTO auctions (gadget_id, seller_id, starting_price, current_price, bid_increment, buy_now_price, start_time, end_time, status, total_bids)
    VALUES (gadget_id, seller_id, 85000, 85000, 1000, 130000, NOW() - INTERVAL '1 day', NOW() + INTERVAL '2 minutes', 'active', 0);

    -- Samsung Wireless Charging Station - ends in 5 minutes
    INSERT INTO gadgets (seller_id, category_id, title, description, brand, model, condition, specifications, images, status)
    VALUES (
        seller_id, cat_accessories,
        'Samsung 3-in-1 Wireless Charging Station',
        'Charge your phone, watch, and earbuds simultaneously. Fast wireless charging support.',
        'Samsung', 'Wireless Charger Trio',
        'like_new',
        '{"Devices": "Phone + Watch + Earbuds", "Phone Output": "15W", "Watch Output": "10W", "Earbuds Output": "5W", "Cable": "USB-C included"}'::jsonb,
        ARRAY['https://images.unsplash.com/photo-1586816879360-004f5b0c51e5?w=800'],
        'approved'
    ) RETURNING id INTO gadget_id;
    
    INSERT INTO auctions (gadget_id, seller_id, starting_price, current_price, bid_increment, buy_now_price, start_time, end_time, status, total_bids)
    VALUES (gadget_id, seller_id, 45000, 45000, 1000, 75000, NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 minutes', 'active', 0);

    RAISE NOTICE 'Successfully created 16 test auctions across all categories!';
    RAISE NOTICE 'Ending in 2 minutes: iPhone 15 Pro Max, iPad Pro M4, Apple Watch Ultra 2, Sony A7 IV, MagSafe Bundle';
    RAISE NOTICE 'Ending in 5 minutes: MacBook Pro M3, Galaxy Tab S9, AirPods Max, Canon R6 II, PS5, Samsung Charger';
    RAISE NOTICE 'Ending in 10 minutes: Galaxy S24 Ultra, Dell XPS 15, Galaxy Watch 6, Sony WH-1000XM5, Switch OLED';

END $$;
