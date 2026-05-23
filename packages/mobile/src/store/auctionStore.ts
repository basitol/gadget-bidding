import { create } from 'zustand';
import { Auction, Bid, AuctionFilters } from '../types';
import { auctionService, socketService } from '../services';

// Store unsubscribe functions outside of zustand state
const socketUnsubscribers: Map<string, (() => void)[]> = new Map();

interface AuctionState {
  auctions: Auction[];
  currentAuction: Auction | null;
  currentBids: Bid[];
  hotAuctions: Auction[];
  endingSoon: Auction[];
  myBids: Bid[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  filters: AuctionFilters;
  pagination: {
    page: number;
    total: number;
    hasMore: boolean;
  };

  // Actions
  fetchAuctions: (filters?: AuctionFilters, page?: number) => Promise<void>;
  fetchAuction: (id: string) => Promise<void>;
  fetchAuctionBids: (auctionId: string) => Promise<void>;
  fetchHotAuctions: () => Promise<void>;
  fetchEndingSoon: () => Promise<void>;
  fetchMyBids: () => Promise<void>;
  placeBid: (auctionId: string, amount: number) => Promise<void>;
  buyNow: (auctionId: string) => Promise<{
    orderId: string;
    orderNumber: string;
    amount: number;
  } | null>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  setFilters: (filters: AuctionFilters) => void;
  subscribeToAuction: (auctionId: string) => void;
  unsubscribeFromAuction: (auctionId: string) => void;
  updateAuctionFromSocket: (auctionId: string, data: Partial<Auction>) => void;
  addBidFromSocket: (bid: Bid) => void;
  clearError: () => void;
}

export const useAuctionStore = create<AuctionState>((set, get) => ({
  auctions: [],
  currentAuction: null,
  currentBids: [],
  hotAuctions: [],
  endingSoon: [],
  myBids: [],
  isLoading: false,
  isRefreshing: false,
  error: null,
  filters: { status: 'active' },
  pagination: {
    page: 1,
    total: 0,
    hasMore: false,
  },

  fetchAuctions: async (filters, page = 1) => {
    const currentFilters = filters || get().filters;
    set({ isLoading: true, error: null, filters: currentFilters });
    try {
      const response = await auctionService.getAuctions(currentFilters, page);
      set({
        auctions:
          page === 1 ? response.data : [...get().auctions, ...response.data],
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
          error instanceof Error ? error.message : 'Failed to fetch auctions',
        isLoading: false,
      });
    }
  },

  fetchAuction: async id => {
    set({ isLoading: true, error: null });
    try {
      const response = await auctionService.getAuction(id);
      set({ currentAuction: response.data, isLoading: false });
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : 'Failed to fetch auction',
        isLoading: false,
      });
    }
  },

  fetchAuctionBids: async auctionId => {
    try {
      const response = await auctionService.getAuctionBids(auctionId);
      set({ currentBids: response.data });
    } catch (error) {
      console.error('Failed to fetch bids:', error);
    }
  },

  fetchHotAuctions: async () => {
    try {
      const response = await auctionService.getHotAuctions();
      set({ hotAuctions: response.data });
    } catch (error) {
      console.error('Failed to fetch hot auctions:', error);
    }
  },

  fetchEndingSoon: async () => {
    try {
      const response = await auctionService.getEndingSoon();
      set({ endingSoon: response.data });
    } catch (error) {
      console.error('Failed to fetch ending soon:', error);
    }
  },

  fetchMyBids: async () => {
    try {
      const response = await auctionService.getMyBids();
      set({ myBids: response.data });
    } catch (error) {
      console.error('Failed to fetch my bids:', error);
    }
  },

  placeBid: async (auctionId, amount) => {
    set({ isLoading: true, error: null });
    try {
      await auctionService.placeBid(auctionId, amount);
      // Refresh auction data
      await get().fetchAuction(auctionId);
      await get().fetchAuctionBids(auctionId);
      set({ isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to place bid',
        isLoading: false,
      });
      throw error;
    }
  },

  buyNow: async auctionId => {
    set({ isLoading: true, error: null });
    try {
      const response = await auctionService.buyNow(auctionId);
      await get().fetchAuction(auctionId);
      set({ isLoading: false });

      // Return order info for navigation to payment
      if (response.data?.order) {
        return {
          orderId: response.data.order.id,
          orderNumber: response.data.order.order_number,
          amount: response.data.order.total_amount,
        };
      }
      return null;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to buy now',
        isLoading: false,
      });
      throw error;
    }
  },

  loadMore: async () => {
    const { pagination, isLoading, filters } = get();
    if (isLoading || !pagination.hasMore) return;
    await get().fetchAuctions(filters, pagination.page + 1);
  },

  refresh: async () => {
    set({ isRefreshing: true });
    try {
      await Promise.all([
        get().fetchAuctions(get().filters, 1),
        get().fetchHotAuctions(),
        get().fetchEndingSoon(),
      ]);
    } finally {
      set({ isRefreshing: false });
    }
  },

  setFilters: filters => {
    set({ filters });
    get().fetchAuctions(filters, 1);
  },

  subscribeToAuction: auctionId => {
    // First, clean up any existing subscriptions for this auction
    const existingUnsubs = socketUnsubscribers.get(auctionId);
    if (existingUnsubs) {
      existingUnsubs.forEach(unsub => unsub());
      socketUnsubscribers.delete(auctionId);
    }

    // Join the auction room
    socketService.joinAuction(auctionId);

    const unsubscribers: (() => void)[] = [];

    // Listen for new bids
    const unsubNewBid = socketService.on(
      'new_bid',
      (data: {
        auction_id: string;
        bid: Bid;
        current_price: number;
        total_bids?: number;
      }) => {
        console.log(
          'Store: Received new_bid event for auction',
          data.auction_id,
          'current auction:',
          auctionId
        );
        if (data.auction_id === auctionId) {
          console.log('Store: Updating auction with new bid data', data);
          get().addBidFromSocket(data.bid);
          get().updateAuctionFromSocket(auctionId, {
            current_price: data.current_price,
            bid_count: data.total_bids,
          });
        }
      }
    );
    unsubscribers.push(unsubNewBid);

    // Listen for auction updates
    const unsubAuctionUpdated = socketService.on(
      'auction_updated',
      (data: { auction_id: string; auction: Auction }) => {
        if (data.auction_id === auctionId) {
          set({ currentAuction: data.auction });
        }
      }
    );
    unsubscribers.push(unsubAuctionUpdated);

    // Listen for auction end
    const unsubAuctionEnded = socketService.on(
      'auction_ended',
      (data: { auction_id: string }) => {
        if (data.auction_id === auctionId) {
          get().fetchAuction(auctionId);
        }
      }
    );
    unsubscribers.push(unsubAuctionEnded);

    // Store unsubscribers for cleanup
    socketUnsubscribers.set(auctionId, unsubscribers);
  },

  unsubscribeFromAuction: auctionId => {
    // Clean up listeners
    const unsubs = socketUnsubscribers.get(auctionId);
    if (unsubs) {
      unsubs.forEach(unsub => unsub());
      socketUnsubscribers.delete(auctionId);
    }

    // Leave the auction room
    socketService.leaveAuction(auctionId);
  },

  updateAuctionFromSocket: (auctionId, data) => {
    const { currentAuction, auctions } = get();

    if (currentAuction?.id === auctionId) {
      set({ currentAuction: { ...currentAuction, ...data } });
    }

    set({
      auctions: auctions.map(a => (a.id === auctionId ? { ...a, ...data } : a)),
    });
  },

  addBidFromSocket: bid => {
    set({ currentBids: [bid, ...get().currentBids] });
  },

  clearError: () => set({ error: null }),
}));
