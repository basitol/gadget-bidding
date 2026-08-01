import { create } from 'zustand';
import { User } from '../types';
import { authService } from '../services';
import { AppInterfaceType, validateInterfaceAccess } from '../utils/roles';

interface AuthState {
  user: User | null;
  interfaceType: AppInterfaceType | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  setUser: (user: User | null) => void;
  setInterfaceType: (interfaceType: AppInterfaceType | null) => void;
  login: (
    phone_number: string,
    password: string,
    interfaceType: AppInterfaceType
  ) => Promise<void>;
  register: (
    data: {
      phone_number: string;
      full_name: string;
      password: string;
      email?: string;
    },
    interfaceType: AppInterfaceType
  ) => Promise<string>;
  verifyOtp: (
    verification_id: string,
    otp: string,
    interfaceType: AppInterfaceType
  ) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>(set => ({
  user: null,
  interfaceType: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  setUser: user => set({ user, isAuthenticated: !!user }),

  setInterfaceType: interfaceType => set({ interfaceType }),

  login: async (phone_number, password, interfaceType) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.login({
        phone_number,
        password,
        account_type: interfaceType,
      });
      const accessError = validateInterfaceAccess(
        interfaceType,
        response.data.user.role
      );
      if (accessError) {
        await authService.logout();
        throw new Error(accessError);
      }
      set({
        user: response.data.user,
        interfaceType,
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

  register: async (data, interfaceType) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.register({
        ...data,
        account_type: interfaceType,
      });
      set({ isLoading: false, interfaceType });
      return response.data.verification_id;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Registration failed',
        isLoading: false,
      });
      throw error;
    }
  },

  verifyOtp: async (verification_id, otp, interfaceType) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.verifyOtp({ verification_id, otp });
      const accessError = validateInterfaceAccess(
        interfaceType,
        response.data.user.role
      );
      if (accessError) {
        await authService.logout();
        throw new Error(accessError);
      }
      await authService.persistInterfaceType(interfaceType);
      set({
        user: response.data.user,
        interfaceType,
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
      set({
        user: null,
        interfaceType: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const isAuth = await authService.isAuthenticated();
      if (isAuth) {
        const [user, interfaceType] = await Promise.all([
          authService.getCurrentUser(),
          authService.getInterfaceType(),
        ]);
        set({
          user,
          interfaceType,
          isAuthenticated: !!user,
          isLoading: false,
        });
      } else {
        set({
          user: null,
          interfaceType: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    } catch {
      set({
        user: null,
        interfaceType: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  clearError: () => set({ error: null }),
}));
