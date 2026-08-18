import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL, STORAGE_KEYS } from '../constants';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/** Auth routes that return 401 for bad credentials — never attach/refresh tokens */
const isPublicAuthRequest = (url?: string): boolean => {
  if (!url) return false;
  return [
    '/auth/login',
    '/auth/register',
    '/auth/verify-otp',
    '/auth/resend-otp',
    '/auth/refresh-token',
    '/auth/social',
  ].some(path => url.includes(path));
};

// Request interceptor to add auth token (skip public auth routes)
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Let React Native set multipart boundary for FormData uploads
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      if (config.headers) {
        delete config.headers['Content-Type'];
      }
    }

    if (isPublicAuthRequest(config.url)) {
      return config;
    }
    try {
      const token = await SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Error getting token:', error);
    }
    return config;
  },
  error => Promise.reject(error)
);

// Flag to prevent multiple refresh attempts
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

// Response interceptor for token refresh
api.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isPublicAuthRequest(originalRequest.url)
    ) {
      if (isRefreshing) {
        // If already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(token => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return api(originalRequest);
          })
          .catch(err => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await SecureStore.getItemAsync(
          STORAGE_KEYS.REFRESH_TOKEN
        );

        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        console.log('Refreshing token...');
        const response = await axios.post(
          `${API_BASE_URL}/auth/refresh-token`,
          {
            refresh_token: refreshToken,
          }
        );

        const { access_token, refresh_token: newRefreshToken } =
          response.data.data || {};

        // Validate access token before storing - SecureStore only accepts strings
        if (!access_token || typeof access_token !== 'string') {
          throw new Error('Invalid access token received from server');
        }

        // Store new access token
        await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, access_token);

        // Store new refresh token if provided (token rotation)
        if (newRefreshToken && typeof newRefreshToken === 'string') {
          await SecureStore.setItemAsync(
            STORAGE_KEYS.REFRESH_TOKEN,
            newRefreshToken
          );
        }

        console.log('Token refreshed successfully');

        // Process queued requests
        processQueue(null, access_token);

        // Retry original request with new token
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
        }

        return api(originalRequest);
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        processQueue(refreshError, null);

        // Clear tokens and redirect to login
        await SecureStore.deleteItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
        await SecureStore.deleteItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
        await SecureStore.deleteItemAsync(STORAGE_KEYS.USER);

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;

// Helper to extract error message
export const getErrorMessage = (error: unknown): string => {
  const sanitizeMessage = (message?: string): string | undefined => {
    if (!message) return undefined;

    if (
      message.includes('gadgets_condition_check') ||
      message.includes('violates check constraint')
    ) {
      return 'Please choose a supported gadget condition and try again.';
    }

    return message;
  };

  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | {
          error?: string;
          message?: string;
          errors?: Record<string, string[]>;
        }
      | undefined;

    // Surface the first field-level validation error if present
    if (data?.errors) {
      const firstField = Object.values(data.errors).find(
        messages => Array.isArray(messages) && messages.length > 0
      );
      if (firstField?.[0]) {
        return sanitizeMessage(firstField[0]) || firstField[0];
      }
    }

    // Backend sends { success: false, error: "..." }; keep `message` as fallback
    return (
      sanitizeMessage(data?.error) ||
      sanitizeMessage(data?.message) ||
      sanitizeMessage(error.message) ||
      'An error occurred'
    );
  }
  if (error instanceof Error) {
    return sanitizeMessage(error.message) || error.message;
  }
  return 'An unexpected error occurred';
};
