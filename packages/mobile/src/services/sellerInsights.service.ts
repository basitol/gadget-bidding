import api, { getErrorMessage } from './api';

/** Store › Sales insights: GET /seller/insights?period=30d|6m|1y */

export type InsightPeriod = '30d' | '6m' | '1y';

export interface SalesInsightsData {
  period: InsightPeriod;
  from: string;
  to: string;
  /** After our fee, on orders the buyer confirmed in the period. change_pct is against the same length before. */
  earned: { amount: number; previous: number; change_pct: number | null };
  items_sold: { count: number; previous: number; change: number };
  /** Auctions that ended with a winner ÷ all that ended. pct is null when none ended. */
  sell_through: { pct: number | null; sold: number; ended: number };
  views: { count: number; previous: number; change_pct: number | null };
  /** Earnings after fees per bar (naira); the last bar is now. */
  chart: { label: string; from: string; to: string; amount: number }[];
  best_sellers: { label: string; sold: number; avg_price: number }[];
  avg_bids_per_sale: number | null;
  /** Only when the seller's own auctions show it. */
  tip: { text: string } | null;
}

export const sellerInsightsService = {
  get: async (period: InsightPeriod): Promise<SalesInsightsData> => {
    try {
      return (await api.get('/seller/insights', { params: { period } })).data.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },
};
