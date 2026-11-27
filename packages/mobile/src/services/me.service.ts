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

/** null = any condition. */
export type AlertCondition = 'new' | 'a_or_better' | 'b_or_better';

export interface SavedSearch {
  id: string;
  query: string | null;
  category_slug: string | null;
  max_price: number | null;
  condition: AlertCondition | null;
  enabled: boolean;
  /** Matches we told you about in the last 7 days. */
  new_this_week: number;
  label: string;
  created_at: string;
}

/** What Personal details shows. phone_number is null until a real number is added. */
export interface PersonalProfile {
  first_name: string;
  last_name: string;
  full_name: string;
  username: string | null;
  /** Set while the 30-day wait after a username change is running. */
  username_change_available_at: string | null;
  email: string | null;
  email_verified: boolean;
  phone_number: string | null;
  avatar_url: string | null;
}

export interface ContactChange {
  verification_id: string;
  kind: 'email' | 'phone';
  /** Masked: "qa•••@example.com", "0803 ••• 4521" */
  sent_to: string;
  expires_in_minutes: number;
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

/** Profile › Privacy & your data (GET/PUT /me/privacy). */
export interface PrivacySettings {
  /** "Deals and new auctions by email": the same switch as Notifications › Offers and news. */
  marketing_emails: boolean;
  personalised_picks: boolean;
  usage_stats: boolean;
  email: string | null;
  data_request_days: number;
  data_request: DataRequest | null;
}
export type PrivacySwitch = 'marketing_emails' | 'personalised_picks' | 'usage_stats';

export interface DataRequest {
  id: string;
  status: 'open' | 'sent' | 'cancelled';
  email: string;
  requested_at: string;
  due_at: string;
  completed_at: string | null;
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

export interface MissedPayment {
  id: string;
  order_id: string | null;
  order_number: string;
  auction_id: string | null;
  category_id: string | null;
  gadget_title: string;
  gadget_image: string | null;
  winning_bid: number;
  forfeited_amount: number;
  auction_ended_at: string | null;
  created_at: string;
}

export interface StrikeSummary {
  strikes: number;
  strike_limit: number;
  lookback_days: number;
  pause_days: number;
  bidding_paused_until: string | null;
}

export const meService = {
  missedPayments: () => call<StrikeSummary & { items: MissedPayment[] }>(api.get('/me/missed-payments')),
  missedPayment: (id: string) =>
    call<
      MissedPayment &
        StrikeSummary & { nth: number; outcome: 'next_bidder' | 'cancelled'; category_slug: string | null }
    >(api.get(`/me/missed-payments/${id}`)),
  /** Upload photos for a problem report; returns their URLs. */
  uploadPhotos: async (localUris: string[]): Promise<string[]> => {
    if (!localUris.length) return [];
    const { toJpegUris } = await import('../utils/images');
    const jpegs = await toJpegUris(localUris);
    const form = new FormData();
    jpegs.forEach((uri, i) =>
      form.append('images', { uri, name: `problem_${Date.now()}_${i}.jpg`, type: 'image/jpeg' } as unknown as Blob)
    );
    const res = await call<{ urls: string[] }>(api.post('/me/uploads', form, { transformRequest: d => d }));
    return res.urls ?? [];
  },

  summary: () => call<ProfileSummary>(api.get('/me/summary')),
  profile: () => call<PersonalProfile>(api.get('/me/profile')),
  updateProfile: (data: { full_name?: string; username?: string; phone_number?: string; avatar_url?: string | null }) =>
    call<{ user: any; profile: PersonalProfile }>(api.put('/me/profile', data)),
  /** Refused (with the reason) while an order, dispute, live lead or wallet balance is open. */
  deleteAccount: () => call<{ deleted: true }>(api.delete('/me/account')),

  /** Change email or phone: a code goes to the NEW one. */
  startContactChange: (kind: 'email' | 'phone', value: string) =>
    call<ContactChange>(api.post('/me/contact/start', { kind, value })),
  resendContactCode: (verificationId: string) =>
    call<ContactChange>(api.post('/me/contact/resend', { verification_id: verificationId })),
  verifyContactChange: (verificationId: string, code: string) =>
    call<{ user: any; profile: PersonalProfile }>(api.post('/me/contact/verify', { verification_id: verificationId, code })),

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

  /** How an auction ended for me (lost, no sale, cancelled) plus similar auctions ending soon. */
  auctionResult: (auctionId: string) =>
    call<import('../screens/buyer/ResultScreens').AuctionResult>(api.get(`/me/auction-result/${auctionId}`)),

  savedSearches: () => call<SavedSearch[]>(api.get('/me/saved-searches')),
  saveSearch: (data: { query?: string; category_slug?: string; max_price?: number; condition?: AlertCondition | null }) =>
    call<SavedSearch>(api.post('/me/saved-searches', data)),
  setSearchEnabled: (id: string, enabled: boolean) => call<SavedSearch>(api.put(`/me/saved-searches/${id}`, { enabled })),
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

  privacy: () => call<PrivacySettings>(api.get('/me/privacy')),
  updatePrivacy: (changes: Partial<Record<PrivacySwitch, boolean>>) =>
    call<PrivacySettings>(api.put('/me/privacy', changes)),
  /** One open request at a time; asking again returns the open one (already_requested). */
  requestData: () =>
    call<DataRequest & { already_requested: boolean; message: string }>(api.post('/me/data-request')),
  /** Help › "Was this helpful?" */
  helpFeedback: (article: string, helpful: boolean) => call(api.post('/me/help-feedback', { article, helpful })),

  setTwoFactor: (enabled: boolean, password: string) =>
    call<{ two_factor_enabled: boolean }>(api.put('/auth/2fa', { enabled, password })),
};
