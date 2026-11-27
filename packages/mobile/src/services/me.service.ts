import api, { getErrorMessage } from './api';

/** The signed-in buyer's own things: /api/v1/me (see backend me.routes.ts). */

export interface AuctionCard {
  id: string;
  title: string;
  condition: string | null;
  image: string | null;
  category_slug: string | null;
  status: 'scheduled' | 'active' | 'ended' | 'cancelled';
  current_price: number;
  starting_price: number;
  bid_increment: number;
  total_bids: number;
  start_time: string;
  end_time: string;
}

export interface MyBidRow extends AuctionCard {
  my_bid: number;
  auto_bid_max: number | null;
  is_leading: boolean;
  result: 'bidding' | 'won' | 'lost';
  order: { id: string; order_number: string; payment_status: string; fulfillment_status: string } | null;
}

export interface ProfileSummary {
  username: string | null;
  location: string | null;
  stats: { won: number; bidding: number; rating: number | null; rating_count: number };
  watchlist_count: number;
  orders: { to_pay: number; to_confirm: number };
  addresses: string[];
  default_card: string | null;
  saved_searches: string[];
  two_factor_enabled: boolean;
}

export interface SavedSearch {
  id: string;
  query: string | null;
  category_slug: string | null;
  max_price: number | null;
  label: string;
  created_at: string;
}

export interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  exp_month: string;
  exp_year: string;
  bank: string | null;
  is_default: boolean;
  label: string;
}

export type WatchFilter = 'all' | 'ending_soon' | 'starting_soon';
export type BidTab = 'bidding' | 'won' | 'lost';

const call = async <T,>(p: Promise<{ data: { data: T } }>): Promise<T> => {
  try {
    return (await p).data.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const meService = {
  summary: () => call<ProfileSummary>(api.get('/me/summary')),
  updateProfile: (data: { full_name?: string; username?: string; phone_number?: string }) => call(api.put('/me/profile', data)),

  myBids: (tab: BidTab) =>
    call<{ rows: MyBidRow[]; counts: Record<BidTab, number> }>(api.get('/me/bids', { params: { tab } })),

  watchlist: (filter: WatchFilter) =>
    call<{ auctions: AuctionCard[]; counts: Record<WatchFilter, number> }>(
      api.get('/me/watchlist', { params: { filter } })
    ),
  watchedIds: () => call<string[]>(api.get('/me/watchlist/ids')),
  watch: (auctionId: string) => call(api.put(`/me/watchlist/${auctionId}`)),
  unwatch: (auctionId: string) => call(api.delete(`/me/watchlist/${auctionId}`)),

  getAutoBid: (auctionId: string) =>
    call<{ max_amount: number; is_active: boolean } | null>(api.get(`/me/auto-bids/${auctionId}`)),
  setAutoBid: (auctionId: string, maxAmount: number, notifyOnMax = true) =>
    call<{ max_amount: number; is_active: boolean; notify_on_max?: boolean }>(
      api.put(`/me/auto-bids/${auctionId}`, { max_amount: maxAmount, notify_on_max: notifyOnMax })
    ),
  cancelAutoBid: (auctionId: string) => call(api.delete(`/me/auto-bids/${auctionId}`)),

  savedSearches: () => call<SavedSearch[]>(api.get('/me/saved-searches')),
  saveSearch: (data: { query?: string; category_slug?: string; max_price?: number }) =>
    call<SavedSearch>(api.post('/me/saved-searches', data)),
  deleteSearch: (id: string) => call(api.delete(`/me/saved-searches/${id}`)),

  cards: () => call<SavedCard[]>(api.get('/me/cards')),
  deleteCard: (id: string) => call<SavedCard[]>(api.delete(`/me/cards/${id}`)),
  defaultCard: (id: string) => call<SavedCard[]>(api.put(`/me/cards/${id}/default`)),
  payWithCard: (orderId: string, cardId: string) =>
    call(api.post(`/me/orders/${orderId}/pay-with-card`, { card_id: cardId })),

  myRating: (orderId: string) =>
    call<{ score: number; comment: string | null } | null>(api.get(`/me/ratings/${orderId}`)),
  rate: (orderId: string, score: number, comment?: string) =>
    call(api.post('/me/ratings', { order_id: orderId, score, comment })),

  setTwoFactor: (enabled: boolean, password: string) =>
    call<{ two_factor_enabled: boolean }>(api.put('/auth/2fa', { enabled, password })),
};
