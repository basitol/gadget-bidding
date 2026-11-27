import api, { getErrorMessage } from './api';

/** A problem report ("case") as the buyer sees it. */
export interface CaseMessage {
  id: string;
  role: 'buyer' | 'seller' | 'team';
  author: string;
  mine: boolean;
  body: string;
  at: string;
}

export interface CaseReturn {
  method: 'dropoff' | 'pickup';
  code: string;
  status: 'started' | 'received' | 'refunded';
  due_at: string;
  started_at: string;
  received_at: string | null;
  refunded_at: string | null;
  refund_destination: 'card' | 'wallet' | null;
}

export interface Case {
  id: string;
  case_number: string;
  status: string;
  in_review: boolean;
  outcome: 'refund' | 'not_upheld' | null;
  findings: string | null;
  /** Set by our team: what happens next, shown under Team review ("Hub re-test tomorrow"). */
  next_step: string | null;
  decided_at: string | null;
  second_review_requested_at: string | null;
  can_ask_second_review: boolean;
  problem: { type: string; label: string; description: string };
  photos: string[];
  created_at: string;
  timeline: {
    reported_at: string | null;
    seller_replied_at: string | null;
    team_review_at: string | null;
    decided_at: string | null;
  };
  order: {
    id: string;
    order_number: string;
    total_amount: number;
    delivery_fee: number;
    item_amount: number;
    payment_status: string;
    delivery_method: 'delivery' | 'pickup';
    shipping_address?: any;
    paid_with?: string | null;
    gadget: {
      title: string;
      images: string[];
      condition: string;
      brand?: string | null;
      /** From the listing: 'none' | 'seller' | 'manufacturer' | 'applecare' */
      warranty?: string | null;
    } | null;
  };
  messages: CaseMessage[];
  return: CaseReturn | null;
}

const call = async <T,>(p: Promise<{ data: { data: T } }>): Promise<T> => {
  try {
    return (await p).data.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const caseService = {
  get: (id: string) => call<Case>(api.get(`/cases/${id}`)),
  message: (id: string, body: string) => call<Case>(api.post(`/cases/${id}/messages`, { body })),
  startReturn: (id: string, method: 'dropoff' | 'pickup') => call<Case>(api.post(`/cases/${id}/return`, { method })),
  secondReview: (id: string) => call<Case>(api.post(`/cases/${id}/second-review`)),
};
