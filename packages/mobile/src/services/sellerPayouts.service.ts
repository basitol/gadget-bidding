import api, { getErrorMessage } from './api';

/** The seller's 6 pm payouts: GET /api/v1/seller/payouts (Payouts tab and the Home payout card). */

export type PayoutRowStatus = 'scheduled' | 'sending' | 'paid' | 'failed';

export interface PayoutHistoryRow {
  /** null for the upcoming (scheduled) payout. */
  id: string | null;
  at: string;
  order_count: number;
  first_order_number: string | null;
  amount: number;
  status: PayoutRowStatus;
}

export interface SellerPayoutSummary {
  /** Orders the buyer confirmed, not paid out yet (platform fee already taken off). */
  ready: number;
  ready_orders: number;
  /** Paid orders still waiting for the buyer to confirm (or held by a case). */
  in_escrow: number;
  /** The 6 pm this money goes out; null when nothing is ready or the seller can't be paid yet. */
  next_payout_at: string | null;
  /** true: Paystack sends it at 6 pm. false: our team sends it by hand after 6 pm. */
  automatic: boolean;
  blocked: null | { code: 'PAYOUT_ACCOUNT_REQUIRED' | 'TWO_STEP_REQUIRED'; message: string };
  payout_account: null | {
    bank_name: string;
    account_number_last4: string;
    account_name: string;
    matches_business_name: boolean;
  };
  /** The upcoming payout first (when there is one), then past payouts, newest first. */
  history: PayoutHistoryRow[];
  /** Money from before automatic payouts, still in the in-app wallet. */
  legacy_balance: number;
}

export const sellerPayoutsService = {
  async summary(): Promise<SellerPayoutSummary> {
    try {
      const res = await api.get('/seller/payouts');
      return res.data.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },
};
