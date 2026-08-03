-- Store auction configuration on a gadget at listing time so the auction is
-- created automatically when an admin approves the listing.
ALTER TABLE gadgets
  ADD COLUMN auction_starting_price DECIMAL(15, 2),
  ADD COLUMN auction_reserve_price DECIMAL(15, 2),
  ADD COLUMN auction_buy_now_price DECIMAL(15, 2),
  ADD COLUMN auction_bid_increment DECIMAL(15, 2),
  ADD COLUMN auction_duration_hours INT,
  ADD COLUMN auction_start_now BOOLEAN DEFAULT TRUE;
