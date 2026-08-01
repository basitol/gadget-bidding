import { create } from 'zustand';
import { auctionService, SellerDashboard } from '../services';

const SELLER_DASHBOARD_TTL_MS = 30_000;

interface SellerDashboardState {
  dashboard: SellerDashboard | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  lastFetchedAt: number;
  fetchDashboard: (force?: boolean) => Promise<void>;
  invalidateDashboard: () => void;
}

export const useSellerDashboardStore = create<SellerDashboardState>(
  (set, get) => ({
    dashboard: null,
    isLoading: false,
    isRefreshing: false,
    error: null,
    lastFetchedAt: 0,

    fetchDashboard: async (force = false) => {
      const { dashboard, lastFetchedAt, isLoading } = get();
      const isFresh = Date.now() - lastFetchedAt < SELLER_DASHBOARD_TTL_MS;

      if (!force && dashboard && isFresh) return;
      if (isLoading) return;

      set({
        isLoading: !dashboard,
        isRefreshing: force && Boolean(dashboard),
        error: null,
      });

      try {
        const response = await auctionService.getSellerDashboard();
        set({
          dashboard: response.data,
          lastFetchedAt: Date.now(),
          isLoading: false,
          isRefreshing: false,
        });
      } catch (error) {
        set({
          error:
            error instanceof Error
              ? error.message
              : 'Failed to load seller dashboard',
          isLoading: false,
          isRefreshing: false,
        });
      }
    },

    invalidateDashboard: () => set({ lastFetchedAt: 0 }),
  })
);
