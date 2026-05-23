import api, { getErrorMessage } from './api';
import {
  Order,
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
      const response = await api.put(`/orders/${orderId}/shipping-address`, {
        shipping_address: address,
      });
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
        fulfillment_status: status,
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

  // Get order stats
  async getOrderStats(): Promise<
    ApiResponse<{
      total_orders: number;
      pending_orders: number;
      completed_orders: number;
      total_spent: number;
      total_earned: number;
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
    callbackUrl?: string
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

export const orderService = new OrderService();
