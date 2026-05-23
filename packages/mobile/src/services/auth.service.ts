import api, { getErrorMessage } from './api';
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../constants';
import { User, LoginResponse, ApiResponse } from '../types';

export interface RegisterData {
  phone_number: string;
  full_name: string;
  password: string;
  email?: string;
}

export interface LoginData {
  phone_number: string;
  password: string;
}

export interface VerifyOtpData {
  verification_id: string;
  otp: string;
}

class AuthService {
  // Register new user
  async register(
    data: RegisterData
  ): Promise<ApiResponse<{ verification_id: string; message: string }>> {
    try {
      const response = await api.post('/auth/register', data);
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Verify OTP
  async verifyOtp(data: VerifyOtpData): Promise<LoginResponse> {
    try {
      const response = await api.post('/auth/verify-otp', data);
      const { access_token, refresh_token, user } = response.data.data;

      // Store tokens securely
      await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, access_token);
      await SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, refresh_token);
      await SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(user));

      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Login
  async login(data: LoginData): Promise<LoginResponse> {
    try {
      const response = await api.post('/auth/login', data);
      const { access_token, refresh_token, user } = response.data.data;

      // Store tokens securely
      await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, access_token);
      await SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, refresh_token);
      await SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(user));

      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Resend OTP
  async resendOtp(
    phone_number: string
  ): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await api.post('/auth/resend-otp', { phone_number });
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Logout
  async logout(): Promise<void> {
    try {
      const refreshToken = await SecureStore.getItemAsync(
        STORAGE_KEYS.REFRESH_TOKEN
      );
      if (refreshToken) {
        await api.post('/auth/logout', { refresh_token: refreshToken });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear stored data
      await SecureStore.deleteItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
      await SecureStore.deleteItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
      await SecureStore.deleteItemAsync(STORAGE_KEYS.USER);
    }
  }

  // Get current user from storage
  async getCurrentUser(): Promise<User | null> {
    try {
      const userStr = await SecureStore.getItemAsync(STORAGE_KEYS.USER);
      if (userStr) {
        return JSON.parse(userStr);
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  // Check if user is authenticated
  async isAuthenticated(): Promise<boolean> {
    try {
      const token = await SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
      return !!token;
    } catch (error) {
      return false;
    }
  }

  // Get user profile from API
  async getProfile(): Promise<ApiResponse<User>> {
    try {
      const response = await api.get('/auth/me');
      // Update stored user
      await SecureStore.setItemAsync(
        STORAGE_KEYS.USER,
        JSON.stringify(response.data.data)
      );
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Update profile
  async updateProfile(data: Partial<User>): Promise<ApiResponse<User>> {
    try {
      const response = await api.put('/auth/profile', data);
      // Update stored user
      await SecureStore.setItemAsync(
        STORAGE_KEYS.USER,
        JSON.stringify(response.data.data)
      );
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }
}

export const authService = new AuthService();
