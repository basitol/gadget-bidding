import api, { getErrorMessage } from './api';
import {
  Order,
  Dispute,
  DisputeType,
  ShippingAddress,
  ApiResponse,
  PaginatedResponse,
} from '../types';

class OrderService {
  // Get my orders (as buyer)
  async getMyOrders(page = 1, limit = 20): Promise<PaginatedResponse<Order>> {
    try {
      const response = await api.get('/orders/my-purchases', {
        params: { page, limit },
      });
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Get my sales (as seller)
  async getMySales(page = 1, limit = 20): Promise<PaginatedResponse<Order>> {
    try {
      const response = await api.get('/orders/my-sales', {
        params: { page, limit },
      });
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Get order by ID
  async getOrder(id: string): Promise<ApiResponse<Order>> {
    try {
      const response = await api.get(`/orders/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Update shipping address
  async updateShippingAddress(
    orderId: string,
    address: ShippingAddress
  ): Promise<ApiResponse<Order>> {
    try {
      const response = await api.put(
        `/orders/${orderId}/shipping-address`,
        address
      );
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Confirm payment (buyer)
  async confirmPayment(orderId: string): Promise<ApiResponse<Order>> {
    try {
      const response = await api.post(`/orders/${orderId}/confirm-payment`);
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Update fulfillment status (seller)
  async updateFulfillment(
    orderId: string,
    status: string,
    trackingNumber?: string
  ): Promise<ApiResponse<Order>> {
    try {
      const response = await api.put(`/orders/${orderId}/fulfillment`, {
        status,
        tracking_number: trackingNumber,
      });
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Confirm delivery (buyer)
  async confirmDelivery(orderId: string): Promise<ApiResponse<Order>> {
    try {
      const response = await api.post(`/orders/${orderId}/confirm-delivery`);
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Email the buyer a receipt (paid orders)
  async emailReceipt(orderId: string): Promise<{ email: string }> {
    try {
      const response = await api.post(`/orders/${orderId}/receipt`);
      return response.data.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  /* ---- Pay without the web checkout ---- */

  async startBankTransfer(orderId: string): Promise<BankTransferDetails> {
    try {
      return (await api.post(`/orders/${orderId}/payment/bank-transfer`)).data.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async startUssd(orderId: string, bank: UssdBank): Promise<UssdDetails> {
    try {
      return (await api.post(`/orders/${orderId}/payment/ussd`, { bank })).data.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  /** paid · pending (normal until the bank confirms) · failed */
  async paymentStatus(orderId: string, reference: string): Promise<'paid' | 'pending' | 'failed'> {
    try {
      return (await api.get(`/orders/${orderId}/payment/status`, { params: { reference } })).data.data.state;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  /* ---- Second-chance offers ---- */

  async acceptOffer(orderId: string): Promise<void> {
    try {
      await api.post(`/orders/${orderId}/offer/accept`);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async declineOffer(orderId: string): Promise<void> {
    try {
      await api.post(`/orders/${orderId}/offer/decline`);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Open a dispute for an order
  async createDispute(
    orderId: string,
    disputeType: DisputeType,
    description: string,
    evidence?: string[]
  ): Promise<ApiResponse<Dispute>> {
    try {
      const response = await api.post(`/orders/${orderId}/disputes`, {
        dispute_type: disputeType,
        description,
        ...(evidence?.length ? { evidence } : {}),
      });
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Get order stats
  async getOrderStats(): Promise<
    ApiResponse<{
      totalPurchases: number;
      totalSales: number;
      pendingOrders: number;
      completedOrders: number;
    }>
  > {
    try {
      const response = await api.get('/orders/stats');
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Initialize Paystack payment for order
  async initializePayment(
    orderId: string,
    callbackUrl?: string,
    channel?: 'card' | 'bank_transfer' | 'ussd'
  ): Promise<
    ApiResponse<{
      authorization_url: string;
      access_code: string;
      reference: string;
    }>
  > {
    try {
      const response = await api.post(`/orders/${orderId}/payment/initialize`, {
        callback_url: callbackUrl,
        channel,
      });
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Verify Paystack payment for order
  async verifyPayment(
    orderId: string,
    reference: string
  ): Promise<ApiResponse<Order>> {
    try {
      const response = await api.get(`/orders/${orderId}/payment/verify`, {
        params: { reference },
      });
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }
}

/** USSD banks that work: GTBank 737, Zenith 966, UBA 919. */
export type UssdBank = '737' | '966' | '919';

export interface BankTransferDetails {
  reference: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  amount: number;
  expires_at: string;
}

export interface UssdDetails {
  reference: string;
  ussd_code: string;
  bank: string;
  amount: number;
}

export const orderService = new OrderService();

/* ---------------- Seller drop-off deadline ---------------- */

/** Lagos is UTC+1 all year (no daylight saving), so the hub's times are shown in Lagos time. */
const LAGOS_OFFSET_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const lagosDay = (t: number) => Math.floor((t + LAGOS_OFFSET_MS) / DAY_MS);

/**
 * When the seller has to drop the item at the hub (the order's `dropoff_due_at`), in Lagos time:
 * "By tomorrow, 6:00 pm", "By Mon, 6:00 pm", "By Dec 9, 6:00 pm". Null when there's no deadline.
 */
export const dropoffByLabel = (iso?: string | null, now = Date.now()): string | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const l = new Date(t + LAGOS_OFFSET_MS);
  const h = l.getUTCHours();
  const time = `${h % 12 || 12}:${String(l.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  const days = lagosDay(t) - lagosDay(now);
  const day =
    days === 0
      ? 'today'
      : days === 1
        ? 'tomorrow'
        : days === -1
          ? 'yesterday'
          : days > 1 && days < 7
            ? WEEKDAYS[l.getUTCDay()]
            : `${MONTHS[l.getUTCMonth()]} ${l.getUTCDate()}`;
  return `${days < 0 ? 'Due' : 'By'} ${day}, ${time}`;
};
