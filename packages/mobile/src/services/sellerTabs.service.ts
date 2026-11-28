import api, { getErrorMessage } from './api';

/** The seller app's Home, My listings and Orders tabs. */

export type Tone = 'amber' | 'red' | 'blue' | 'green' | 'neutral';

export interface SellerTodo {
  kind: 'dropoff' | 'changes' | 'case' | 'hub_failed' | 'hub_collect';
  id: string;
  order_id?: string;
  title: string;
  item: string;
  note?: string | null;
  due_at: string | null;
}

export interface SellerHome {
  business_name: string | null;
  verified: boolean;
  shop_line: string | null;
  unread_notifications: number;
  todo: SellerTodo[];
  todo_count: number;
  live: { id: string; title: string; image: string | null; bids: number; price: number; end_time: string }[];
  stats: { sold_30d: number; rating: number | null; on_time_dropoff: number | null };
}

export type ListingTab = 'live' | 'review' | 'changes' | 'unsold';

export interface SellerListing {
  kind: 'auction' | 'gadget';
  id: string;
  gadget_id?: string | null;
  title: string;
  image: string | null;
  price: number;
  // live
  status?: 'active' | 'scheduled';
  bids?: number;
  watching?: number;
  start_time?: string;
  end_time?: string;
  can_edit?: boolean;
  starting_price?: number;
  buy_now_price?: number | null;
  // review / changes
  sent_at?: string | null;
  note?: string | null;
  // unsold
  ended_at?: string;
  ended_by_seller?: boolean;
}

export type OrderTab = 'todo' | 'progress' | 'done';

export interface SellerOrderCard {
  id: string;
  order_number: string;
  title: string;
  image: string | null;
  sold_for: number;
  payout: number;
  chip: { label: string; tone: Tone };
  dropoff_due_at: string | null;
  case: { id: string; number: string; respond_by: string | null } | null;
  fulfillment_status: string;
  payout_status: string | null;
}

export interface DropoffCode {
  order_id: string;
  code: string;
  title: string;
  image: string | null;
  due_at: string;
}

const call = async <T,>(p: Promise<{ data: { data: T } }>): Promise<T> => {
  try {
    return (await p).data.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const sellerTabsService = {
  home: () => call<SellerHome>(api.get('/seller/home')),
  listings: (tab: ListingTab) =>
    call<{ counts: Record<ListingTab, number>; items: SellerListing[] }>(api.get('/seller/listings', { params: { tab } })),
  orders: (tab: OrderTab) =>
    call<{ counts: Record<OrderTab, number>; dropoff: { count: number; due_at: string | null } | null; items: SellerOrderCard[] }>(
      api.get('/seller/orders', { params: { tab } })
    ),
  dropoffCodes: () => call<DropoffCode[]>(api.get('/seller/dropoff-codes')),
  /** "Send to hub": the item is with our hub team. */
  sendToHub: (orderId: string) => call<unknown>(api.put(`/orders/${orderId}/fulfillment`, { status: 'sent_to_backoffice' })),
  /** No bids yet: change the prices of a live or scheduled listing. */
  updatePrices: (auctionId: string, prices: { starting_price?: number; buy_now_price?: number | null }) =>
    call<unknown>(api.put(`/auctions/${auctionId}`, prices)),
  endListing: (auctionId: string) => call<unknown>(api.post(`/auctions/${auctionId}/cancel`)),
  relist: (auctionId: string) => call<unknown>(api.post(`/auctions/${auctionId}/relist`, {})),
};

/** "14:44" under an hour, "41h 50m" under three days, else "5d 3h". */
export const timeLeftLong = (iso: string, now = Date.now()) => {
  const s = Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000));
  if (s < 3600) return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const h = Math.floor(s / 3600);
  if (h < 72) return `${h}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
};

/** "by 6:00 pm today" / "by 6:00 pm tomorrow" / "by 6:00 pm Mon" / "overdue" */
export const byWhen = (iso: string, now = Date.now()) => {
  const d = new Date(iso);
  if (d.getTime() < now) return 'overdue';
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const today = new Date(now);
  const tomorrow = new Date(now + 86_400_000);
  if (d.toDateString() === today.toDateString()) return `by ${time} today`;
  if (d.toDateString() === tomorrow.toDateString()) return `by ${time} tomorrow`;
  return `by ${time} ${d.toLocaleDateString('en-US', { weekday: 'short' })}`;
};

/** "47h left" for a reply deadline. */
export const hoursLeft = (iso: string, now = Date.now()) => {
  const h = Math.floor((new Date(iso).getTime() - now) / 3_600_000);
  if (h < 0) return 'overdue';
  if (h < 1) return 'less than an hour left';
  return `${h}h left`;
};
