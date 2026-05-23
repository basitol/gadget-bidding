import { create } from 'zustand';
import { Wallet, WalletTransaction } from '../types';
import { walletService } from '../services';

interface WalletState {
  wallet: Wallet | null;
  transactions: WalletTransaction[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  pagination: {
    page: number;
    total: number;
    hasMore: boolean;
  };

  // Actions
  fetchWallet: () => Promise<void>;
  fetchTransactions: (page?: number) => Promise<void>;
  loadMoreTransactions: () => Promise<void>;
  refreshWallet: () => Promise<void>;
  clearError: () => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  wallet: null,
  transactions: [],
  isLoading: false,
  isRefreshing: false,
  error: null,
  pagination: {
    page: 1,
    total: 0,
    hasMore: false,
  },

  fetchWallet: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await walletService.getWallet();
      // Transform backend response to match Wallet type
      const walletData = response.data;
      const wallet: Wallet = {
        id: walletData.id || '',
        user_id: walletData.user_id || '',
        balance: walletData.balance || 0,
        held_balance:
          walletData.balance -
            (walletData.available_balance || walletData.balance) || 0,
        currency: walletData.currency || 'NGN',
        is_locked: walletData.is_locked || false,
        created_at: walletData.created_at || new Date().toISOString(),
        updated_at: walletData.updated_at || new Date().toISOString(),
      };
      set({ wallet, isLoading: false });
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : 'Failed to fetch wallet',
        isLoading: false,
      });
    }
  },

  fetchTransactions: async (page = 1) => {
    set({ isLoading: true, error: null });
    try {
      const response = await walletService.getTransactions(page);
      set({
        transactions:
          page === 1
            ? response.data
            : [...get().transactions, ...response.data],
        pagination: {
          page: response.pagination.page,
          total: response.pagination.total,
          hasMore: response.pagination.page < response.pagination.total_pages,
        },
        isLoading: false,
      });
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch transactions',
        isLoading: false,
      });
    }
  },

  loadMoreTransactions: async () => {
    const { pagination, isLoading } = get();
    if (isLoading || !pagination.hasMore) return;
    await get().fetchTransactions(pagination.page + 1);
  },

  refreshWallet: async () => {
    set({ isRefreshing: true });
    try {
      await Promise.all([get().fetchWallet(), get().fetchTransactions(1)]);
    } finally {
      set({ isRefreshing: false });
    }
  },

  clearError: () => set({ error: null }),
}));
