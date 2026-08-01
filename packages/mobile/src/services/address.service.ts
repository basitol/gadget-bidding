import api, { getErrorMessage } from './api';
import { ApiResponse, ShippingAddress, UserAddress } from '../types';

export type SaveAddressData = ShippingAddress & {
  label?: string;
  is_default?: boolean;
};

class AddressService {
  async listAddresses(): Promise<ApiResponse<UserAddress[]>> {
    try {
      const response = await api.get('/addresses');
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async createAddress(
    data: SaveAddressData
  ): Promise<ApiResponse<UserAddress>> {
    try {
      const response = await api.post('/addresses', data);
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async updateAddress(
    id: string,
    data: SaveAddressData
  ): Promise<ApiResponse<UserAddress>> {
    try {
      const response = await api.put(`/addresses/${id}`, data);
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async setDefaultAddress(id: string): Promise<ApiResponse<UserAddress>> {
    try {
      const response = await api.put(`/addresses/${id}/default`);
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async deleteAddress(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    try {
      const response = await api.delete(`/addresses/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }
}

export const addressService = new AddressService();
