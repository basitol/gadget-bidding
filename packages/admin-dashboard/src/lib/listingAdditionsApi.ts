import { request } from '@/api';

/** Photos and bidder notes sellers added to live listings, waiting for our team (/admin/listing-additions). */
export type ListingAddition = {
  gadget_id: string;
  title: string;
  image: string | null;
  photos: string[];
  pending_photos: string[];
  bidder_note: string | null;
  bidder_note_pending: string | null;
  updated_at: string | null;
  seller: { id: string; name: string | null; email: string | null } | null;
  auction: { id: string; status: string; end_time: string | null; bids: number } | null;
};

export type AdditionDecision = {
  approve_photos?: string[];
  reject_photos?: string[];
  note?: 'approve' | 'reject';
  reason?: string;
};

export const listingAdditionsApi = {
  list: () => request<{ data: ListingAddition[] }>('/admin/listing-additions'),
  decide: (gadgetId: string, body: AdditionDecision) =>
    request<{ data: { approved_photos: number; rejected_photos: number }; message?: string }>(
      `/admin/listing-additions/${gadgetId}/decide`,
      { method: 'POST', body: JSON.stringify(body) }
    ),
};
