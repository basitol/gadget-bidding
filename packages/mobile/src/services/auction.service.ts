import api, { getErrorMessage } from './api';
import {
  Auction,
  Gadget,
  Bid,
  ApiResponse,
  PaginatedResponse,
  AuctionFilters,
} from '../types';

export interface GadgetCategory {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  icon_url?: string | null;
  is_active?: boolean;
}

export interface CreateGadgetData {
  title: string;
  description: string;
  category_id: string;
  brand: string;
  model: string;
  condition: string;
  images: string[];
  specifications?: Record<string, unknown>;
  auction_starting_price?: number;
  auction_reserve_price?: number;
  auction_buy_now_price?: number;
  auction_bid_increment?: number;
  auction_duration_hours?: number;
  auction_start_now?: boolean;
  status?: string;
}

export interface CreateAuctionData {
  gadget_id: string;
  starting_price: number;
  reserve_price?: number;
  buy_now_price?: number;
  bid_increment?: number;
  start_time: string;
  end_time: string;
}

export interface SellerDashboard {
  stats: {
    total_gadgets: number;
    pending_gadgets: number;
    ready_gadgets: number;
    total_auctions: number;
    active_auctions: number;
    sold_orders: number;
  };
  pending_gadgets: Gadget[];
  ready_gadgets: Gadget[];
  rejected_gadgets: Gadget[];
}

export interface SellerKybStatus {
  business_name: string | null;
  cac_number: string | null;
  status: 'not_started' | 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
}

export interface SubmitSellerKybData {
  business_name: string;
  cac_number?: string;
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

  /** Upload local device photos; returns public image URLs */
  async uploadImages(localUris: string[]): Promise<string[]> {
    if (localUris.length === 0) return [];

    const { toJpegUris } = await import('../utils/images');
    const jpegUris = await toJpegUris(localUris);

    const formData = new FormData();
    jpegUris.forEach((uri, index) => {
      formData.append('images', {
        uri,
        name: `gadget_${Date.now()}_${index}.jpg`,
        type: 'image/jpeg',
      } as unknown as Blob);
    });

    try {
      const response = await api.post('/gadgets/upload-images', formData, {
        transformRequest: data => data,
      });
      return response.data?.data?.urls || [];
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  /** Keep remote URLs; upload any local file URIs */
  async resolveImageUrls(uris: string[]): Promise<string[]> {
    const remote: string[] = [];
    const local: string[] = [];

    uris.forEach(uri => {
      if (/^https?:\/\//i.test(uri)) {
        remote.push(uri);
      } else {
        local.push(uri);
      }
    });

    const uploaded = await this.uploadImages(local);
    return [...remote, ...uploaded];
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
  async getCategories(): Promise<ApiResponse<GadgetCategory[]>> {
    try {
      const response = await api.get('/gadgets/categories');
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async getSellerDashboard(): Promise<ApiResponse<SellerDashboard>> {
    try {
      const response = await api.get('/seller/dashboard');
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async getSellerKyb(): Promise<ApiResponse<SellerKybStatus>> {
    try {
      const response = await api.get('/seller/kyb');
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async submitSellerKyb(
    data: SubmitSellerKybData
  ): Promise<ApiResponse<SellerKybStatus>> {
    try {
      const response = await api.post('/seller/kyb', data);
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
