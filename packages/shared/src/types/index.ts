// ============================================================================
// User Types
// ============================================================================

export type UserRole = 'user' | 'seller' | 'admin';

export interface User {
  id: string;
  phone_number: string;
  email?: string;
  full_name: string;
  avatar_url?: string;
  role: UserRole;
  is_verified: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UserRegistration {
  phone_number: string;
  full_name: string;
  email?: string;
  password: string;
}

export interface UserLogin {
  phone_number: string;
  password: string;
}

export interface OTPVerification {
  verification_id: string;
  otp: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  user: User;
}

// ============================================================================
// Wallet Types
// ============================================================================

export type TransactionType =
  | 'deposit'
  | 'withdrawal'
  | 'bid_hold'
  | 'bid_release'
  | 'payment'
  | 'refund';

export type TransactionStatus = 'pending' | 'completed' | 'failed';

export interface Wallet {
  id: string;
  user_id: string;
  balance: number;
  currency: string;
  is_locked: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface WalletTransaction {
  id: string;
  wallet_id: string;
  transaction_type: TransactionType;
  amount: number;
  balance_before: number;
  balance_after: number;
  reference?: string;
  description?: string;
  metadata?: Record<string, any>;
  status: TransactionStatus;
  created_at: Date;
}

// ============================================================================
// Payment Types
// ============================================================================

export type PaymentGateway = 'paystack' | 'flutterwave' | 'bank_transfer';

export type PaymentStatus = 'pending' | 'success' | 'failed' | 'abandoned';

export type PaymentMethod = 'card' | 'bank_transfer' | 'ussd' | 'mobile_money';

export interface PaymentTransaction {
  id: string;
  user_id: string;
  wallet_transaction_id?: string;
  payment_gateway: PaymentGateway;
  gateway_reference?: string;
  amount: number;
  currency: string;
  payment_method?: PaymentMethod;
  status: PaymentStatus;
  gateway_response?: Record<string, any>;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface PaystackInitializeRequest {
  amount: number;
  email: string;
  callback_url?: string;
  metadata?: Record<string, any>;
}

export interface PaystackInitializeResponse {
  authorization_url: string;
  access_code: string;
  reference: string;
}

// ============================================================================
// Gadget Types
// ============================================================================

export type GadgetCondition = 'new' | 'like_new' | 'good' | 'fair';

export type GadgetStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'listed'
  | 'sold';

export interface GadgetCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon_url?: string;
  is_active: boolean;
  created_at: Date;
}

export interface Gadget {
  id: string;
  seller_id: string;
  category_id: string;
  title: string;
  description: string;
  brand?: string;
  model?: string;
  condition: GadgetCondition;
  specifications?: Record<string, any>;
  images: string[];
  status: GadgetStatus;
  rejection_reason?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateGadgetRequest {
  category_id: string;
  title: string;
  description: string;
  brand?: string;
  model?: string;
  condition: GadgetCondition;
  specifications?: Record<string, any>;
  images: string[];
}

// ============================================================================
// Auction Types
// ============================================================================

export type AuctionStatus =
  | 'scheduled'
  | 'active'
  | 'ended'
  | 'cancelled'
  | 'completed';

export interface Auction {
  id: string;
  gadget_id: string;
  seller_id: string;
  starting_price: number;
  reserve_price?: number;
  current_price: number;
  bid_increment: number;
  buy_now_price?: number;
  start_time: Date;
  end_time: Date;
  status: AuctionStatus;
  winner_id?: string;
  total_bids: number;
  auto_extend_enabled: boolean;
  auto_extend_minutes: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateAuctionRequest {
  gadget_id: string;
  starting_price: number;
  reserve_price?: number;
  bid_increment?: number;
  buy_now_price?: number;
  start_time: Date;
  end_time: Date;
  auto_extend_enabled?: boolean;
  auto_extend_minutes?: number;
}

export interface AuctionWithGadget extends Auction {
  gadget: Gadget;
  category?: GadgetCategory;
  seller?: Pick<User, 'id' | 'full_name' | 'avatar_url'>;
}

// ============================================================================
// Bid Types
// ============================================================================

export type BidStatus = 'active' | 'outbid' | 'withdrawn' | 'won';

export interface Bid {
  id: string;
  auction_id: string;
  bidder_id: string;
  amount: number;
  bid_time: Date;
  is_winning: boolean;
  is_auto_bid: boolean;
  status: BidStatus;
}

export interface PlaceBidRequest {
  auction_id: string;
  amount: number;
}

export interface BidWithBidder extends Bid {
  bidder: Pick<User, 'id' | 'full_name' | 'avatar_url'>;
}

export interface BidHold {
  id: string;
  bid_id: string;
  wallet_id: string;
  amount: number;
  status: 'held' | 'released' | 'charged';
  released_at?: Date;
  created_at: Date;
}

// ============================================================================
// Order Types
// ============================================================================

export type PaymentStatusType = 'pending' | 'paid' | 'refunded';

export type FulfillmentStatus =
  | 'pending'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

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

export interface Order {
  id: string;
  auction_id: string;
  buyer_id: string;
  seller_id: string;
  order_number: string;
  total_amount: number;
  platform_fee: number;
  seller_payout: number;
  payment_status: PaymentStatusType;
  fulfillment_status: FulfillmentStatus;
  shipping_address?: ShippingAddress;
  tracking_number?: string;
  created_at: Date;
  updated_at: Date;
}

export interface OrderWithDetails extends Order {
  auction: Auction;
  gadget: Gadget;
  buyer: Pick<User, 'id' | 'full_name' | 'phone_number'>;
  seller: Pick<User, 'id' | 'full_name' | 'phone_number'>;
}

// ============================================================================
// Notification Types
// ============================================================================

export type NotificationType =
  | 'bid_placed'
  | 'outbid'
  | 'auction_won'
  | 'auction_lost'
  | 'auction_ending_soon'
  | 'payment_received'
  | 'payment_failed'
  | 'payment_initiated'
  | 'order_created'
  | 'order_shipped'
  | 'order_delivered';

export type NotificationChannel = 'push' | 'sms' | 'email';

export interface Notification {
  id: string;
  user_id: string;
  notification_type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  channels: NotificationChannel[];
  is_read: boolean;
  sent_at?: Date;
  created_at: Date;
}

// ============================================================================
// Dispute Types
// ============================================================================

export type DisputeType =
  | 'item_not_received'
  | 'item_damaged'
  | 'item_not_as_described'
  | 'fraud'
  | 'other';

export type DisputeStatus = 'open' | 'investigating' | 'resolved' | 'closed';

export interface Dispute {
  id: string;
  order_id: string;
  raised_by: string;
  dispute_type: DisputeType;
  description: string;
  evidence?: Record<string, any>;
  status: DisputeStatus;
  resolution?: string;
  resolved_by?: string;
  resolved_at?: Date;
  created_at: Date;
  updated_at: Date;
}

// ============================================================================
// Socket.io Event Types
// ============================================================================

export interface SocketAuctionJoin {
  auctionId: string;
}

export interface SocketPlaceBid {
  auctionId: string;
  amount: number;
}

export interface SocketBidPlaced {
  bidder: Pick<User, 'id' | 'full_name' | 'avatar_url'>;
  amount: number;
  timestamp: Date;
  totalBids: number;
}

export interface SocketOutbid {
  auctionId: string;
  newHighestBid: number;
}

export interface SocketAuctionEnded {
  winnerId?: string;
  finalPrice?: number;
}

export interface SocketAuctionState {
  auction: AuctionWithGadget;
  currentPrice: number;
  totalBids: number;
  timeRemaining: number;
  isActive: boolean;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T = any> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  errors?: Record<string, string[]>;
}

// ============================================================================
// Query & Filter Types
// ============================================================================

export interface AuctionFilters {
  category_id?: string;
  status?: AuctionStatus;
  min_price?: number;
  max_price?: number;
  search?: string;
  sort_by?: 'price_asc' | 'price_desc' | 'ending_soon' | 'newly_listed';
  page?: number;
  limit?: number;
}

export interface WalletTransactionFilters {
  transaction_type?: TransactionType;
  status?: TransactionStatus;
  start_date?: Date;
  end_date?: Date;
  page?: number;
  limit?: number;
}

// ============================================================================
// Constants
// ============================================================================

export const CURRENCIES = {
  NGN: 'NGN',
  USD: 'USD',
} as const;

export const DEFAULT_BID_INCREMENT = 100; // ₦100
export const DEFAULT_AUCTION_DURATION_HOURS = 24;
export const AUTO_EXTEND_MINUTES = 5;
export const PLATFORM_FEE_PERCENTAGE = 5; // 5% platform fee
export const MIN_WALLET_BALANCE = 0;

// Nigerian payment gateway limits
export const PAYSTACK_MIN_AMOUNT = 100; // ₦100
export const PAYSTACK_MAX_AMOUNT = 10000000; // ₦10,000,000
