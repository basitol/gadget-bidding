// User Types
export interface User {
  id: string;
  phone_number: string;
  full_name: string;
  email?: string;
  avatar_url?: string;
  role: 'bidder' | 'seller' | 'admin';
  is_verified: boolean;
  business_name?: string;
  cac_number?: string;
  seller_kyb_status?: 'not_started' | 'pending' | 'approved' | 'rejected';
  seller_kyb_rejection_reason?: string;
  created_at: string;
}

// Auth Types
export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export interface LoginResponse {
  success: boolean;
  data: {
    user: User;
    access_token: string;
    refresh_token: string;
  };
}

// Wallet Types
export interface Wallet {
  id: string;
  user_id: string;
  balance: number;
  held_balance: number;
  available_balance?: number;
  currency: string;
  is_locked?: boolean;
  created_at: string;
  updated_at: string;
}

export interface WalletTransaction {
  id: string;
  wallet_id: string;
  type?:
    | 'deposit'
    | 'withdrawal'
    | 'bid_hold'
    | 'bid_release'
    | 'bid_charge'
    | 'sale_credit'
    | 'refund';
  transaction_type?: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  status: 'pending' | 'completed' | 'failed';
  reference: string;
  description?: string;
  created_at: string;
}

// Gadget Types
export interface Gadget {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  category: string;
  category_id?: string;
  brand?: string;
  model?: string;
  condition: 'new' | 'like_new' | 'excellent' | 'good' | 'fair' | 'for_parts';
  images: string[];
  specifications?: Record<string, unknown>;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'listed' | 'sold';
  rejection_reason?: string;
  auction_starting_price?: number;
  auction_reserve_price?: number;
  auction_buy_now_price?: number;
  auction_bid_increment?: number;
  auction_duration_hours?: number;
  auction_start_now?: boolean;
  created_at: string;
  updated_at: string;
  seller?: User;
}

// Auction Types
export interface Auction {
  id: string;
  gadget_id: string;
  seller_id: string;
  starting_price: number;
  current_price: number;
  reserve_price?: number;
  buy_now_price?: number;
  min_bid_increment: number;
  start_time: string;
  end_time: string;
  original_end_time: string;
  status: 'scheduled' | 'active' | 'ended' | 'sold' | 'cancelled';
  winner_id?: string;
  winning_bid_id?: string;
  bid_count: number;
  view_count: number;
  created_at: string;
  updated_at: string;
  gadget?: Gadget;
  winner?: User;
}

// Bid Types
export interface Bid {
  id: string;
  auction_id: string;
  bidder_id: string;
  amount: number;
  is_auto_bid: boolean;
  max_auto_bid?: number;
  status: 'active' | 'outbid' | 'won' | 'lost' | 'cancelled';
  is_winning?: boolean;
  created_at: string;
  bidder?: User;
  bid_time: string;
}

// Order Types
export interface Order {
  id: string;
  order_number: string;
  auction_id: string;
  buyer_id: string;
  seller_id: string;
  gadget_id: string;
  amount: number;
  total_amount?: number;
  platform_fee: number;
  seller_amount: number;
  seller_payout?: number;
  payout_status?: 'pending' | 'ready' | 'held' | 'paid';
  payout_paid_at?: string;
  payout_reference?: string;
  status:
    | 'pending_payment'
    | 'paid'
    | 'shipped'
    | 'delivered'
    | 'completed'
    | 'disputed'
    | 'cancelled';
  payment_status: 'pending' | 'paid' | 'completed' | 'refunded';
  fulfillment_status:
    | 'pending'
    | 'processing'
    | 'sent_to_backoffice'
    | 'received_by_backoffice'
    | 'paid'
    | 'shipped'
    | 'delivered'
    | 'completed'
    | 'disputed'
    | 'cancelled'
    | 'refunded';
  shipping_address?: ShippingAddress;
  tracking_number?: string;
  disputes?: Dispute[];
  open_dispute?: boolean;
  paid_at?: string;
  shipped_at?: string;
  delivered_at?: string;
  created_at: string;
  updated_at: string;
  auction?: Auction;
  gadget?: Gadget;
  buyer?: User;
  seller?: User;
}

export type DisputeType =
  | 'item_not_received'
  | 'item_damaged'
  | 'item_not_as_described'
  | 'fraud'
  | 'other';

export interface Dispute {
  id: string;
  order_id: string;
  raised_by: string;
  dispute_type: DisputeType;
  description: string;
  evidence?: Record<string, unknown>;
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  resolution?: string;
  created_at: string;
  updated_at: string;
}

export interface ShippingAddress {
  full_name: string;
  phone_number: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  postal_code?: string;
  country: string;
}

export interface UserAddress extends ShippingAddress {
  id: string;
  user_id: string;
  label: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// Notification Types
export interface Notification {
  id: string;
  user_id: string;
  type:
    | 'bid_placed'
    | 'outbid'
    | 'auction_won'
    | 'auction_lost'
    | 'auction_created'
    | 'auction_ending'
    | 'auction_ending_soon'
    | 'bid_defaulted'
    | 'backoffice_intake'
    | 'gadget_submitted'
    | 'buy_now_used'
    | 'order_paid_admin'
    | 'fulfillment_updated'
    | 'delivery_confirmed_admin'
    | 'dispute_opened'
    | 'support_message'
    | 'payment_initiated'
    | 'order_created'
    | 'order_shipped'
    | 'order_delivered'
    | 'payment_received'
    | 'payment_failed'
    | 'wallet_funded'
    | 'system';
  title: string;
  message: string;
  data?: Record<string, any>;
  is_read: boolean;
  created_at: string;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

// Filter Types
export interface AuctionFilters {
  status?: string;
  category?: string;
  min_price?: number;
  max_price?: number;
  condition?: string;
  search?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}
