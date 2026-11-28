import api, { getErrorMessage } from './api';

/**
 * Managing a listing after it went live (/seller/manage): Manage listing, Edit listing, End listing,
 * End early, Relist, and the note and photos our team checks before bidders see them.
 */

export type Money = { sale: number; fee: number; fee_label: string; you_receive: number };
export type SimilarSold = { model: string; low: number; high: number; count: number } | null;

export interface ManageView {
  auction_id: string;
  gadget_id: string;
  status: 'scheduled' | 'active' | 'ended' | 'cancelled' | 'paused';
  sold: boolean;
  title: string;
  model: string | null;
  image: string | null;
  photos: { url: string; label: string }[];
  pending_photos: string[];
  max_photos: number;
  grade: string | null;
  battery: number | null;
  identifier_masked: string | null;
  listed_at: string | null;
  start_time: string | null;
  end_time: string | null;
  run_hours: number;
  durations_hours: number[];
  starting_price: number;
  current_price: number;
  buy_now_price: number | null;
  reserve_price: number | null;
  min_start_price: number;
  bids: number;
  watching: number;
  can_edit: boolean;
  locked: boolean;
  note: { text: string; mode: 'note' | 'description' };
  bidder_note: string | null;
  bidder_note_pending: string | null;
  highest_bid: { amount: number; reserve_met: boolean } | null;
  if_sold_now: Money | null;
  at_start: Money;
  payment_hours: number;
  similar_sold: SimilarSold;
  photo_tip: { threshold: number; ratio: number; sample: number } | null;
  end_reason: string | null;
}

export interface RelistView {
  auction_id: string;
  gadget_id: string;
  title: string;
  image: string | null;
  ended_at: string | null;
  ended_by_seller: boolean;
  end_reason: string | null;
  bids: number;
  watched: number;
  last_starting_price: number;
  reserve_price: number | null;
  buy_now_price: number | null;
  similar_sold: SimilarSold;
  tip_price: number | null;
  last_run_hours: number | null;
  durations_hours: number[];
  min_start_price: number;
  can_relist: boolean;
}

export type EndReason = 'sold_elsewhere' | 'change_price' | 'found_fault' | 'other';

export type SellNowResult = {
  auction_id: string;
  action: 'sell';
  ending: boolean;
  order: { id: string; order_number: string; payment_due_at: string | null } | null;
};

/** An error with the server's code (e.g. LISTINGS_PAUSED from the listing gate). */
export class ManageApiError extends Error {
  constructor(
    message: string,
    public code: string | null
  ) {
    super(message);
  }
}

const call = async <T>(p: Promise<{ data: { data: T } }>): Promise<T> => {
  try {
    return (await p).data.data;
  } catch (error: any) {
    throw new ManageApiError(getErrorMessage(error), error?.response?.data?.code ?? null);
  }
};

const base = (id: string) => `/seller/manage/${id}`;

export const listingManageService = {
  view: (auctionId: string) => call<ManageView>(api.get(base(auctionId))),
  edit: (auctionId: string, body: { starting_price?: number; duration_hours?: number; note?: string }) =>
    call<ManageView>(api.patch(base(auctionId), body)),
  end: (auctionId: string, reason: EndReason) =>
    call<{ auction_id: string }>(api.post(`${base(auctionId)}/end`, { reason })),
  sellNow: (auctionId: string) => call<SellNowResult>(api.post(`${base(auctionId)}/end-early`, { action: 'sell' })),
  cancelForProblem: (auctionId: string, detail?: string) =>
    call<{ auction_id: string; released_holds: number }>(
      api.post(`${base(auctionId)}/end-early`, { action: 'cancel', detail })
    ),
  addBidderNote: (auctionId: string, note: string) =>
    call<ManageView>(api.post(`${base(auctionId)}/bidder-note`, { note })),
  addPhotos: (auctionId: string, urls: string[]) => call<ManageView>(api.post(`${base(auctionId)}/photos`, { urls })),
  removePendingPhoto: (auctionId: string, url: string) =>
    call<ManageView>(api.delete(`${base(auctionId)}/photos`, { data: { url } })),
  relistView: (auctionId: string) => call<RelistView>(api.get(`${base(auctionId)}/relist`)),
  relist: (auctionId: string, body: { starting_price: number; duration_hours: number }) =>
    call<{ auction_id: string; end_time: string; starting_price: number }>(api.post(`${base(auctionId)}/relist`, body)),
};

/** "₦430k" / "₦1.2m" for short ranges. */
export const shortNaira = (n: number) => {
  if (n >= 1_000_000) return `₦${(Math.round(n / 100_000) / 10).toString().replace(/\.0$/, '')}m`;
  if (n >= 1000) return `₦${Math.round(n / 1000)}k`;
  return `₦${n}`;
};

/** "1 day" / "3 days". */
export const daysLabel = (hours: number) => {
  const d = Math.round(hours / 24);
  return `${d} day${d === 1 ? '' : 's'}`;
};
