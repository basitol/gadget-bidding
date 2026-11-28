import api, { getErrorMessage } from './api';
import { getAlertPrefs, saveAlertPrefs } from './pushNotifications';
import type { NotificationSettings, NotificationSettingsChange } from './pushNotifications';

/** The seller app's Store tab: /api/v1/seller/store. Documents use sellerApplication.service; alerts use the shared preferences. */

export interface SellerStore {
  business_name: string | null;
  /** "TS" */
  initials: string;
  /** "CV-1042", what buyers see. */
  seller_code: string;
  /** "Shop 14, Otigba Tech Plaza · Computer Village" */
  shop_line: string | null;
  /** Approved on (else the account was made). */
  since: string;
  badges: { verified_business: boolean; cac_registered: boolean; top_seller: boolean };
  stats: {
    sales: number;
    rating: number | null;
    rating_count: number;
    /** null until the hub has inspected something. */
    passed_checks_percent: number | null;
    inspected: number;
  };
  payout_account: { bank_name: string; account_number_last4: string } | null;
  staff_count: number;
  documents: { total: number; needs_update: number; in_review: number; missing?: number };
}

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Day = (typeof DAYS)[number];
export type DayHours = { open: string; close: string } | null;
export type StoreHours = Record<Day, DayHours>;

export interface StoreDetails {
  /** Verified; changed only through our team. */
  business_name: string | null;
  seller_code: string;
  area: string | null;
  shop: { plaza: string | null; shop_number: string | null; area: string | null; line: string | null };
  /** "0803 000 0000" */
  business_phone: string | null;
  categories: string[];
  /** Phones, Laptops, Audio, Gaming, Wearables, Tablets */
  category_options: string[];
  about: string | null;
  about_max: number;
  hours: StoreHours | null;
  /** "Open Mon–Sat, 9:00 am–6:00 pm" */
  hours_line: string | null;
  away: boolean;
}

export interface StoreDetailsChange {
  plaza?: string;
  shop_number?: string;
  business_phone?: string;
  categories?: string[];
  about?: string | null;
  hours?: StoreHours | null;
  away?: boolean;
}

export interface StoreReview {
  id: string;
  score: number;
  comment: string | null;
  item: string | null;
  /** A stand-in ("Buyer •••7"), never a name. */
  buyer: string;
  created_at: string;
  well_packed: boolean | null;
  /** The seller's public reply. */
  reply: { text: string; at: string } | null;
}

export type ReviewFilter = 'all' | '5' | '4' | '3_or_less' | 'not_replied';

/** percent is null when there's nothing to count yet. */
export type ReviewMetric = { percent: number | null; out_of: number };

export interface StoreReviews {
  average: number | null;
  count: number;
  breakdown: { score: number; count: number }[];
  metrics: { as_described: ReviewMetric; well_packed: ReviewMetric; fast_dropoff: ReviewMetric };
  filter: ReviewFilter;
  counts: Record<ReviewFilter, number>;
  reply_max: number;
  reviews: StoreReview[];
}

export type StaffIdType = 'nin_slip' | 'drivers_licence' | 'passport' | 'voters_card';

export interface StoreStaffList {
  max: number;
  business_name: string | null;
  owner: { full_name: string | null };
  id_types: { key: StaffIdType; label: string }[];
  staff: {
    id: string;
    full_name: string;
    phone: string;
    /** What they sign in with (null: added before staff could sign in). */
    email: string | null;
    /** invited: hasn't set up their sign-in yet · joined: signed in · no_email: added before invites */
    status: 'invited' | 'joined' | 'no_email';
    joined_at: string | null;
    invite_sent_at: string | null;
    /** null for people added before we asked. */
    id_type: StaffIdType | null;
    id_label: string | null;
    added_at: string;
  }[];
}

export interface InsightTotals {
  views: number;
  bids: number;
  sold: number;
  earnings: number;
}

export interface SalesInsights {
  last_30_days: InsightTotals;
  all_time: InsightTotals;
  listings: {
    auction_id: string;
    title: string;
    image: string | null;
    /** "Live", "Sold", "Sold · in progress", "Ended", … */
    status: string;
    started_at: string;
    views: number;
    bids: number;
    price: number;
    sold: boolean;
    earnings: number;
  }[];
}

/** The seller's three switches on top of the shared alert settings. */
export interface SellerAlertSettings extends NotificationSettings {
  sales: boolean;
  seller_bids: boolean;
  payouts: boolean;
}
export type SellerAlertChange = NotificationSettingsChange & Partial<Pick<SellerAlertSettings, 'sales' | 'seller_bids' | 'payouts'>>;

const call = async <T,>(p: Promise<{ data: { data: T } }>): Promise<T> => {
  try {
    return (await p).data.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const sellerStoreService = {
  overview: () => call<SellerStore>(api.get('/seller/store')),
  details: () => call<StoreDetails>(api.get('/seller/store/details')),
  saveDetails: (changes: StoreDetailsChange) => call<StoreDetails>(api.put('/seller/store/details', changes)),
  reviews: (filter: ReviewFilter = 'all') => call<StoreReviews>(api.get('/seller/store/reviews', { params: { filter } })),
  reply: (reviewId: string, text: string) => call<StoreReview>(api.put(`/seller/store/reviews/${reviewId}/reply`, { text })),
  staff: () => call<StoreStaffList>(api.get('/seller/store/staff')),
  /** invite_sent is false when the invite email didn't go out (they can send it again). */
  addStaff: (input: { full_name: string; email: string; phone: string; id_type: StaffIdType }) =>
    call<StoreStaffList & { invite_sent?: boolean }>(api.post('/seller/store/staff', input)),
  resendInvite: (id: string) => call<StoreStaffList>(api.post(`/seller/store/staff/${id}/invite`)),
  removeStaff: (id: string) => call<StoreStaffList>(api.delete(`/seller/store/staff/${id}`)),
  insights: () => call<SalesInsights>(api.get('/seller/store/insights')),
  alerts: async (): Promise<SellerAlertSettings> => {
    try {
      const p = (await getAlertPrefs()) as Partial<SellerAlertSettings> & NotificationSettings;
      // Servers from before the seller switches existed: on by default.
      return { ...p, sales: p.sales ?? true, seller_bids: p.seller_bids ?? true, payouts: p.payouts ?? true };
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },
  saveAlerts: async (changes: SellerAlertChange): Promise<SellerAlertSettings> => {
    try {
      return (await saveAlertPrefs(changes as NotificationSettingsChange)) as SellerAlertSettings;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },
};

/* ---------------- Formatting ---------------- */

const DAY_SHORT: Record<Day, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

/** "09:00" → "9:00 am", "18:30" → "6:30 pm" */
export const clockLabel = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
};

/**
 * Days with the same hours grouped: ["Mon – Fri · 9:00 am – 6:00 pm", "Sat · 10:00 am – 4:00 pm", "Sun · Closed"].
 * Used by the seller's Store details and the buyer's store page.
 */
export const hoursSummary = (hours: Partial<Record<string, DayHours>> | null | undefined): string[] => {
  if (!hours) return [];
  const key = (d: Day) => {
    const h = hours[d];
    return h ? `${h.open}-${h.close}` : 'closed';
  };
  const lines: string[] = [];
  let i = 0;
  while (i < DAYS.length) {
    let j = i;
    while (j + 1 < DAYS.length && key(DAYS[j + 1]) === key(DAYS[i])) j++;
    const days = i === j ? DAY_SHORT[DAYS[i]] : `${DAY_SHORT[DAYS[i]]} – ${DAY_SHORT[DAYS[j]]}`;
    const h = hours[DAYS[i]];
    lines.push(`${days} · ${h ? `${clockLabel(h.open)} – ${clockLabel(h.close)}` : 'Closed'}`);
    i = j + 1;
  }
  return lines;
};

/** "Feb 2024" */
export const monthYear = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

/** "Nov 24" this year, else "Nov 24, 2025". */
export const shortDay = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
  });
};

/** "Nov 24, 2026" */
export const dayLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
