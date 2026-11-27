import api, { getErrorMessage } from './api';
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../constants';
import { User, LoginResponse, ApiResponse } from '../types';
import { AppInterfaceType } from '../utils/roles';
import { deviceFields } from '../utils/deviceId';
import type { TwoFactorMethod } from '@gadget-bidding/shared';

export type { TwoFactorMethod };

/** GET /auth/2fa */
export interface TwoFactorStatus {
  enabled: boolean;
  method: TwoFactorMethod | null;
  email_hint: string | null;
  sms_phone_hint: string | null;
}

/** The signed-in user as the server returns it, with the 2-step fields. */
export type UserWithTwoFactor = User & { two_factor_enabled?: boolean; two_factor_method?: TwoFactorMethod | null };

export interface RegisterData {
  phone_number: string;
  full_name: string;
  password: string;
  email?: string;
  account_type: AppInterfaceType;
  accepted_terms?: boolean;
}

export interface LoginData {
  identifier: string;
  password: string;
  account_type: AppInterfaceType;
}

export interface SocialLoginData {
  provider: 'google' | 'apple';
  id_token: string;
  account_type: AppInterfaceType;
  accepted_terms?: boolean;
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

  async persistInterfaceType(interfaceType: AppInterfaceType): Promise<void> {
    await SecureStore.setItemAsync(STORAGE_KEYS.INTERFACE_TYPE, interfaceType);
  }

  async getInterfaceType(): Promise<AppInterfaceType | null> {
    try {
      const value = await SecureStore.getItemAsync(STORAGE_KEYS.INTERFACE_TYPE);
      return value === 'buyer' || value === 'seller' ? value : null;
    } catch {
      return null;
    }
  }

  async clearInterfaceType(): Promise<void> {
    await SecureStore.deleteItemAsync(STORAGE_KEYS.INTERFACE_TYPE);
  }

  // Login
  async login(data: LoginData): Promise<LoginResponse> {
    try {
      // The device id lets 2-step sign-in skip the code on a phone that already passed it.
      const response = await api.post('/auth/login', { ...data, ...(await deviceFields()) });
      // 2-step sign-in: no tokens yet, the caller asks for the code.
      if (response.data.data?.two_factor_required) return response.data;
      const { access_token, refresh_token, user } = response.data.data;

      // Store tokens securely
      await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, access_token);
      await SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, refresh_token);
      await SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(user));
      await this.persistInterfaceType(data.account_type);

      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Social login (Google / Apple)
  async socialLogin(data: SocialLoginData): Promise<LoginResponse> {
    try {
      const response = await api.post('/auth/social', data);
      const { access_token, refresh_token, user } = response.data.data;

      // Store tokens securely
      await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, access_token);
      await SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, refresh_token);
      await SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(user));
      await this.persistInterfaceType(data.account_type);

      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  /** Finish a 2-step sign-in with the emailed, texted or authenticator code. This phone is then trusted. */
  async loginTwoFactor(
    verification_id: string,
    otp: string,
    account_type: AppInterfaceType
  ): Promise<LoginResponse> {
    try {
      const response = await api.post('/auth/login/2fa', {
        verification_id,
        otp,
        account_type,
        ...(await deviceFields()),
      });
      const { access_token, refresh_token, user } = response.data.data;
      await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, access_token);
      await SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, refresh_token);
      await SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(user));
      await this.persistInterfaceType(account_type);
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  /* ---------- 2-step sign-in set-up (authenticator app or text message) ---------- */

  async getTwoFactor(): Promise<TwoFactorStatus> {
    try {
      const response = await api.get('/auth/2fa');
      return response.data.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  /** A new authenticator key; nothing changes until a code from the app confirms it. */
  async setupAuthenticator(): Promise<{ secret: string; otpauth_uri: string }> {
    try {
      const response = await api.post('/auth/2fa/setup', { method: 'totp' });
      return response.data.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  /** Texts a 6-digit code to the business phone. */
  async sendTwoFactorSetupCode(): Promise<{ verification_id: string; phone_hint: string }> {
    try {
      const response = await api.post('/auth/2fa/setup', { method: 'sms' });
      return response.data.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  /** Turns 2-step sign-in on with that method; saves and returns the updated user. */
  async confirmTwoFactor(
    method: 'totp' | 'sms',
    code: string,
    verification_id?: string
  ): Promise<UserWithTwoFactor> {
    let user: UserWithTwoFactor;
    try {
      const response = await api.post('/auth/2fa/confirm', { method, code, verification_id });
      user = response.data.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
    await this.persistUser(user).catch(() => undefined);
    return user;
  }

  /* ---------- Email-first buyer sign-up ---------- */

  async signupStart(email: string): Promise<{ verification_id: string; expires_in: number }> {
    try {
      const response = await api.post('/auth/signup/email', { email });
      return response.data.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async signupVerify(verification_id: string, otp: string): Promise<void> {
    try {
      await api.post('/auth/signup/verify', { verification_id, otp });
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async signupResend(verification_id: string): Promise<{ expires_in: number }> {
    try {
      const response = await api.post('/auth/signup/resend', { verification_id });
      return response.data.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  /* ---- Password reset: forgot → verify → reset ---- */

  async passwordForgot(email: string): Promise<{ verification_id: string; expires_in: number }> {
    try {
      const response = await api.post('/auth/password/forgot', { email });
      return response.data.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async passwordVerify(verification_id: string, otp: string): Promise<void> {
    try {
      await api.post('/auth/password/verify', { verification_id, otp });
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async passwordResend(verification_id: string): Promise<void> {
    try {
      await api.post('/auth/password/resend', { verification_id });
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async passwordReset(verification_id: string, password: string): Promise<{ email: string }> {
    try {
      const response = await api.post('/auth/password/reset', { verification_id, password });
      return response.data.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async usernameAvailable(username: string): Promise<boolean> {
    try {
      const response = await api.get('/auth/username-available', { params: { username } });
      return !!response.data.data?.available;
    } catch {
      return true; // let the final step decide if the check itself fails
    }
  }

  /** Creates the account and saves the session. The caller decides when to enter the app. */
  async signupComplete(data: {
    verification_id: string;
    password: string;
    first_name: string;
    last_name: string;
    username: string;
    interests: { categories: string[]; budget: string | null };
  }): Promise<LoginResponse['data']['user']> {
    let session: { access_token: string; refresh_token: string; user: LoginResponse['data']['user'] };
    try {
      const response = await api.post('/auth/signup/complete', { ...data, accepted_terms: true });
      session = response.data.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
    try {
      await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, session.access_token);
      await SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, session.refresh_token);
      await SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(session.user));
      await this.persistInterfaceType('buyer');
    } catch {
      // The account exists; only this phone couldn't keep the session.
      throw new Error("Your account is ready, but we couldn't keep you signed in on this phone. Log in to continue.");
    }
    return session.user;
  }

  // Resend OTP — identifier can be a phone number or an email, same as login
  async resendOtp(identifier: string): Promise<
    ApiResponse<{ verification_id: string; phone_number: string; email?: string }>
  > {
    try {
      const response = await api.post('/auth/resend-otp', { identifier });
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
      await SecureStore.deleteItemAsync(STORAGE_KEYS.INTERFACE_TYPE);
    }
  }

  // Persist an updated user object (e.g. after an in-place profile edit)
  // so the next cold start's checkAuth() picks it up instead of stale data.
  async persistUser(user: User): Promise<void> {
    await SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(user));
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
      const response = await api.put('/me/profile', data);
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
