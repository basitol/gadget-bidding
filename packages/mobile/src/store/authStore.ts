import { create } from 'zustand';
import { User } from '../types';
import { authService } from '../services';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  setUser: (user: User | null) => void;
  login: (phone_number: string, password: string) => Promise<void>;
  register: (data: {
    phone_number: string;
    full_name: string;
    password: string;
    email?: string;
  }) => Promise<string>;
  verifyOtp: (verification_id: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>(set => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  setUser: user => set({ user, isAuthenticated: !!user }),

  login: async (phone_number, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.login({ phone_number, password });
      set({
        user: response.data.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Login failed',
        isLoading: false,
      });
      throw error;
    }
  },

  register: async data => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.register(data);
      set({ isLoading: false });
      return response.data.verification_id;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Registration failed',
        isLoading: false,
      });
      throw error;
    }
  },

  verifyOtp: async (verification_id, otp) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.verifyOtp({ verification_id, otp });
      set({
        user: response.data.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : 'OTP verification failed',
        isLoading: false,
      });
      throw error;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await authService.logout();
    } finally {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const isAuth = await authService.isAuthenticated();
      if (isAuth) {
        const user = await authService.getCurrentUser();
        set({ user, isAuthenticated: !!user, isLoading: false });
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    } catch (error) {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
