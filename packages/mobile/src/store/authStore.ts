import { create } from 'zustand';
import { User } from '../types';
import { authService } from '../services';
import { unregisterPush } from '../services/pushNotifications';
import { useWatchStore } from './watchStore';
import { AppInterfaceType, validateInterfaceAccess } from '../utils/roles';
import type { TwoFactorMethod } from '../services/auth.service';

/** Password accepted; the account asks for a code. email_hint / phone_hint say where it went. */
export interface TwoFactorChallenge {
  verification_id: string;
  method: TwoFactorMethod;
  email_hint?: string;
  phone_hint?: string;
}

interface AuthState {
  user: User | null;
  interfaceType: AppInterfaceType | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  setUser: (user: User | null) => void;
  setInterfaceType: (interfaceType: AppInterfaceType | null) => void;
  /** Resolves with a challenge when the account has 2-step sign-in on. */
  login: (
    identifier: string,
    password: string,
    interfaceType: AppInterfaceType
  ) => Promise<TwoFactorChallenge | void>;
  completeTwoFactor: (
    verificationId: string,
    otp: string,
    interfaceType: AppInterfaceType
  ) => Promise<void>;
  socialLogin: (
    provider: 'google' | 'apple',
    idToken: string,
    interfaceType: AppInterfaceType,
    acceptedTerms?: boolean
  ) => Promise<void>;
  register: (
    data: {
      phone_number: string;
      full_name: string;
      password: string;
      email?: string;
      accepted_terms?: boolean;
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

  login: async (identifier, password, interfaceType) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.login({
        identifier,
        password,
        account_type: interfaceType,
      });
      const challenge = response.data as unknown as Partial<TwoFactorChallenge> & { two_factor_required?: boolean };
      if (challenge?.two_factor_required && challenge.verification_id) {
        set({ isLoading: false });
        return {
          verification_id: challenge.verification_id,
          // Servers from before methods existed only emailed the code.
          method: challenge.method ?? 'email',
          email_hint: challenge.email_hint,
          phone_hint: challenge.phone_hint,
        };
      }
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

  completeTwoFactor: async (verificationId, otp, interfaceType) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.loginTwoFactor(verificationId, otp, interfaceType);
      const accessError = validateInterfaceAccess(interfaceType, response.data.user.role);
      if (accessError) {
        await authService.logout();
        throw new Error(accessError);
      }
      set({ user: response.data.user, interfaceType, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  socialLogin: async (provider, idToken, interfaceType, acceptedTerms) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.socialLogin({
        provider,
        id_token: idToken,
        account_type: interfaceType,
        accepted_terms: acceptedTerms,
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
        error: error instanceof Error ? error.message : 'Social login failed',
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
      // While still signed in, so the backend accepts it: stop alerts to this phone.
      await unregisterPush();
      useWatchStore.getState().clear();
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
