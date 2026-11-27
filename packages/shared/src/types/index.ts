// ============================================================================
// User Types
// ============================================================================

export type UserRole = 'bidder' | 'seller' | 'admin';

export type AccountType = 'buyer' | 'seller';

export type SellerKybStatus = 'not_started' | 'pending' | 'approved' | 'rejected';

export interface User {
  id: string;
  phone_number: string;
  email?: string;
  full_name: string;
  avatar_url?: string;
  role: UserRole;
  is_verified: boolean;
  is_active: boolean;
  business_name?: string;
  cac_number?: string;
  seller_kyb_status?: SellerKybStatus;
  seller_kyb_rejection_reason?: string;
  created_at: Date;
  updated_at: Date;
}

export interface UserRegistration {
  phone_number: string;
  full_name: string;
  email?: string;
  password: string;
  account_type?: AccountType;
  accepted_terms?: boolean;
}

export interface UserLogin {
  identifier: string;
  password: string;
  account_type?: AccountType;
}

export type SocialProvider = 'google' | 'apple';

export interface SocialLoginRequest {
  provider: SocialProvider;
  id_token: string;
  account_type?: AccountType;
  accepted_terms?: boolean;
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
  | 'purchase'
  | 'sale'
  | 'refund'
  | 'fee';

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
  type?: TransactionType;
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

export type PaymentGateway = 'paystack' | 'monnify' | 'bank_transfer';

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

export type GadgetCondition =
  | 'new'
  | 'like_new'
  | 'excellent'
  | 'good'
  | 'fair'
  | 'for_parts';

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
  specifications?: Record<string, unknown>;
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
  brand: string;
  model: string;
  condition: GadgetCondition;
  specifications?: Record<string, unknown>;
  images: string[];
  // Auction configuration captured at listing time; the auction is created
  // automatically when an admin approves the listing.
  auction_starting_price?: number;
  auction_reserve_price?: number;
  auction_buy_now_price?: number;
  auction_bid_increment?: number;
  auction_duration_hours?: number;
  auction_start_now?: boolean;
}

// ============================================================================
// Auction Types
// ============================================================================

export type AuctionStatus = 'scheduled' | 'active' | 'ended' | 'cancelled';

export interface Auction {
  /** Flat delivery charge (₦) a winner pays on top of the bid. */
  delivery_fee?: number;
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

export type PayoutStatus = 'pending' | 'ready' | 'held' | 'paid';

export type FulfillmentStatus =
  | 'pending'
  | 'processing'
  | 'sent_to_backoffice'
  | 'received_by_backoffice'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export interface ShippingAddress {
  full_name: string;
  phone_number: string;
  address_line1: string;
  /** Nearest landmark ("Opposite Ikeja City Mall"). */
  address_line2?: string;
  city: string;
  state: string;
  postal_code?: string;
  country: string;
  /** Optional note for the rider ("Call when you get to the gate"). */
  delivery_note?: string;
}

export interface UserAddress extends ShippingAddress {
  id: string;
  user_id: string;
  label: string;
  is_default: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface Order {
  /** Included in total_amount. */
  delivery_fee?: number;
  delivery_method?: 'delivery' | 'pickup';
  /** total_amount minus delivery_fee. */
  item_amount?: number;
  id: string;
  auction_id: string;
  buyer_id: string;
  seller_id: string;
  order_number: string;
  total_amount: number;
  platform_fee: number;
  seller_payout: number;
  payout_status?: PayoutStatus;
  payout_paid_at?: string;
  payout_reference?: string;
  payment_status: PaymentStatusType;
  fulfillment_status: FulfillmentStatus;
  shipping_address?: ShippingAddress;
  tracking_number?: string;
  disputes?: Dispute[];
  open_dispute?: boolean;
  /** A refund was decided; the order is on hold until the item is back and refunded. */
  refund_pending?: boolean;
  /** Each payment/fulfillment status change, oldest first (buyer tracking timeline). */
  events?: OrderEvent[];
  /** Unpaid orders: when the payment window closes. */
  payment_due_at?: string;
  /** Buyer view: "Visa ending 4242", "Bank transfer", "Wallet". */
  paid_with?: string | null;
  /** Buyer view: the delivery address can still change (item hasn't left the hub). */
  address_editable?: boolean;
  /** Second-chance offer: accept or decline before this time. */
  offer_expires_at?: string | null;
  /** When the buyer confirmed it arrived okay (or we did after 48 hours). */
  buyer_confirmed_at?: string | null;
  /** Delivered, not yet confirmed: we confirm for the buyer at this time. */
  confirm_by?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface OrderEvent {
  kind: 'payment' | 'fulfillment';
  status: string;
  at: string;
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
  | 'auction_no_sale'
  | 'auction_relisted'
  | 'listing_reported'
  | 'auction_created'
  | 'auction_ending_soon'
  | 'bid_defaulted'
  | 'backoffice_intake'
  | 'gadget_submitted'
  | 'buy_now_used'
  | 'order_paid_admin'
  | 'fulfillment_updated'
  | 'delivery_confirmed_admin'
  | 'dispute_opened'
  | 'dispute_updated'
  | 'support_message'
  | 'payment_received'
  | 'payment_failed'
  | 'payment_reminder'
  | 'saved_search_match'
  | 'store_new_listing'
  | 'payment_initiated'
  | 'order_created'
  | 'order_shipped'
  | 'order_delivered'
  | 'system';

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
  | 'not_working'
  | 'missing_parts'
  | 'wrong_item'
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
export const BID_COMMITMENT_AMOUNT = 1000; // ₦1,000 commitment hold to bid
export const BID_DEFAULT_PENALTY_AMOUNT = 5000; // ₦5,000 reactivation penalty
export const BID_PAYMENT_DEADLINE_HOURS = 24;
export const MIN_WALLET_BALANCE = BID_COMMITMENT_AMOUNT;

// Nigerian payment gateway limits
export const PAYSTACK_MIN_AMOUNT = 100; // ₦100
export const PAYSTACK_MAX_AMOUNT = 10000000; // ₦10,000,000
