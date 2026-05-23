import api, { getErrorMessage } from './api';
import {
  Auction,
  Gadget,
  Bid,
  ApiResponse,
  PaginatedResponse,
  AuctionFilters,
} from '../types';

export interface CreateGadgetData {
  title: string;
  description: string;
  category: string;
  brand?: string;
  model?: string;
  condition: string;
  images: string[];
  specifications?: Record<string, string>;
}

export interface CreateAuctionData {
  gadget_id: string;
  starting_price: number;
  reserve_price?: number;
  buy_now_price?: number;
  min_bid_increment?: number;
  start_time: string;
  end_time: string;
}

class AuctionService {
  // ============ GADGETS ============

  // Create gadget
  async createGadget(data: CreateGadgetData): Promise<ApiResponse<Gadget>> {
    try {
      const response = await api.post('/gadgets', data);
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Get gadget by ID
  async getGadget(id: string): Promise<ApiResponse<Gadget>> {
    try {
      const response = await api.get(`/gadgets/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Get my gadgets
  async getMyGadgets(page = 1, limit = 20): Promise<PaginatedResponse<Gadget>> {
    try {
      const response = await api.get('/gadgets/my-listings', {
        params: { page, limit },
      });
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Get gadget categories
  async getCategories(): Promise<ApiResponse<string[]>> {
    try {
      const response = await api.get('/gadgets/categories');
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Update gadget
  async updateGadget(
    id: string,
    data: Partial<CreateGadgetData>
  ): Promise<ApiResponse<Gadget>> {
    try {
      const response = await api.put(`/gadgets/${id}`, data);
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Delete gadget
  async deleteGadget(id: string): Promise<ApiResponse<void>> {
    try {
      const response = await api.delete(`/gadgets/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // ============ AUCTIONS ============

  // Create auction
  async createAuction(data: CreateAuctionData): Promise<ApiResponse<Auction>> {
    try {
      const response = await api.post('/auctions', data);
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Get auctions with filters
  async getAuctions(
    filters: AuctionFilters = {},
    page = 1,
    limit = 20
  ): Promise<PaginatedResponse<Auction>> {
    try {
      const response = await api.get('/auctions', {
        params: { ...filters, page, limit },
      });
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Get active auctions
  async getActiveAuctions(
    page = 1,
    limit = 20
  ): Promise<PaginatedResponse<Auction>> {
    return this.getAuctions({ status: 'active' }, page, limit);
  }

  // Get auction by ID
  async getAuction(
    id: string
  ): Promise<ApiResponse<Auction & { gadget: Gadget }>> {
    try {
      const response = await api.get(`/auctions/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Get my auctions (as seller)
  async getMyAuctions(
    page = 1,
    limit = 20
  ): Promise<PaginatedResponse<Auction>> {
    try {
      const response = await api.get('/auctions/my-auctions', {
        params: { page, limit },
      });
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Cancel auction
  async cancelAuction(id: string): Promise<ApiResponse<Auction>> {
    try {
      const response = await api.post(`/auctions/${id}/cancel`);
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // ============ BIDS ============

  // Place bid
  async placeBid(auctionId: string, amount: number): Promise<ApiResponse<Bid>> {
    try {
      const response = await api.post('/bids', {
        auction_id: auctionId,
        amount,
      });
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Buy now - returns bid and order
  async buyNow(auctionId: string): Promise<
    ApiResponse<{
      bid: Bid;
      order: {
        id: string;
        order_number: string;
        total_amount: number;
      } | null;
    }>
  > {
    try {
      const response = await api.post(`/bids/buy-now/${auctionId}`);
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Get auction bids
  async getAuctionBids(
    auctionId: string,
    page = 1,
    limit = 20
  ): Promise<PaginatedResponse<Bid>> {
    try {
      const response = await api.get(`/bids/auction/${auctionId}`, {
        params: { page, limit },
      });
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Get my bids
  async getMyBids(page = 1, limit = 20): Promise<PaginatedResponse<Bid>> {
    try {
      const response = await api.get('/bids/my-bids', {
        params: { page, limit },
      });
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Get my active bids
  async getMyActiveBids(): Promise<ApiResponse<Bid[]>> {
    try {
      const response = await api.get('/bids/my-bids/active');
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // ============ SEARCH ============

  // Search auctions
  async searchAuctions(
    query: string,
    page = 1,
    limit = 20
  ): Promise<PaginatedResponse<Auction>> {
    return this.getAuctions({ search: query }, page, limit);
  }

  // Get auctions by category
  async getAuctionsByCategory(
    category: string,
    page = 1,
    limit = 20
  ): Promise<PaginatedResponse<Auction>> {
    return this.getAuctions({ category, status: 'active' }, page, limit);
  }

  // Get ending soon auctions
  async getEndingSoon(
    page = 1,
    limit = 10
  ): Promise<PaginatedResponse<Auction>> {
    return this.getAuctions(
      { status: 'active', sort_by: 'ending_soon' },
      page,
      limit
    );
  }

  // Get hot auctions (most bids) - fallback to ending soon since bid_count not supported
  async getHotAuctions(
    page = 1,
    limit = 10
  ): Promise<PaginatedResponse<Auction>> {
    return this.getAuctions({ status: 'active' }, page, limit);
  }
}

export const auctionService = new AuctionService();
