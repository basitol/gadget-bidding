import api, { getErrorMessage } from './api';

/** "New listings are paused" (seller app): /api/v1/seller/listing-pause. */

export interface FailedSale {
  order_id: string;
  order_number: string;
  title: string;
  /** When it failed: the hub check, or the refund decision. */
  at: string;
  /** "Screen crack", "Battery lower than listed", "Not as described". */
  reason: string;
  kind: 'hub_check' | 'case';
}

export interface ListingPause {
  paused: boolean;
  /** LISTINGS_PAUSED: too many failed sales · PAUSED_BY_TEAM: our team paused them. */
  code: 'LISTINGS_PAUSED' | 'PAUSED_BY_TEAM' | null;
  message: string | null;
  failed: FailedSale[];
  limit: number;
  window_days: number;
  team: { reason: string; until: string | null } | null;
  review_requested_at: string | null;
}

/** Codes the listing gate returns that this screen explains. */
export const PAUSE_CODES = ['LISTINGS_PAUSED', 'PAUSED_BY_TEAM'] as const;

const call = async <T>(p: Promise<{ data: { data: T } }>): Promise<T> => {
  try {
    return (await p).data.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const listingPauseService = {
  get: () => call<ListingPause>(api.get('/seller/listing-pause')),
  requestReview: () => call<ListingPause>(api.post('/seller/listing-pause/review')),
};
