import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Pull a usable hostname from Expo host / linking URIs.
 * Handles forms like:
 * - 192.168.1.5:8081
 * - exp://192.168.1.5:8081
 * - http://192.168.1.5:8081
 */
function extractHost(uri?: string | null): string | null {
  if (!uri) return null;

  // Already "host:port"
  if (/^[\d.]+(?::\d+)?$/.test(uri) || /^[a-z0-9.-]+(?::\d+)?$/i.test(uri)) {
    const host = uri.split(':')[0];
    return host || null;
  }

  try {
    const normalized = uri.includes('://') ? uri : `http://${uri}`;
    const { hostname } = new URL(normalized);
    if (
      hostname &&
      hostname !== 'exp' &&
      hostname !== 'http' &&
      hostname !== 'https'
    ) {
      return hostname;
    }
  } catch {
    // fall through
  }

  const stripped = uri.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const host = stripped.split('/')[0]?.split(':')[0];
  if (
    host &&
    host !== 'exp' &&
    host !== 'http' &&
    host !== 'https'
  ) {
    return host;
  }

  return null;
}

/**
 * Resolve the dev machine IP/host for API calls.
 * Uses Expo's host URI when available (physical device / Expo Go),
 * otherwise falls back to simulator/emulator defaults.
 */
function getDevApiHost(): string {
  const envHost = process.env.EXPO_PUBLIC_API_HOST;
  if (envHost && envHost.trim()) {
    return envHost.trim();
  }

  // iOS Simulator shares the Mac loopback — localhost is most reliable
  if (Platform.OS === 'ios' && Constants.isDevice === false) {
    return 'localhost';
  }

  // Android emulator maps host machine to 10.0.2.2
  if (Platform.OS === 'android' && Constants.isDevice === false) {
    return '10.0.2.2';
  }

  const legacyManifest = (Constants as { manifest?: Record<string, string> })
    .manifest;

  const candidates = [
    Constants.expoConfig?.hostUri,
    Constants.manifest2?.extra?.expoClient?.hostUri,
    legacyManifest?.debuggerHost,
    legacyManifest?.hostUri,
    Constants.linkingUri,
  ];

  for (const candidate of candidates) {
    const host = extractHost(candidate);
    if (host) {
      return host;
    }
  }

  return 'localhost';
}

const DEV_API_HOST = getDevApiHost();

export const API_BASE_URL = __DEV__
  ? `http://${DEV_API_HOST}:3000/api/v1`
  : 'https://api.gadgetbid.ng/api/v1';

export const SOCKET_URL = __DEV__
  ? `http://${DEV_API_HOST}:3000`
  : 'https://api.gadgetbid.ng';

if (__DEV__) {
  // Helps diagnose "timeout" / Network Error when Wi‑Fi IP changes
  console.log(`[API] base URL → ${API_BASE_URL}`);
}

// App Configuration
export const APP_NAME = 'GadgetBid';
export const CURRENCY = '₦';
export const CURRENCY_CODE = 'NGN';

// Bid Configuration
export const MIN_BID_INCREMENT = 1000; // ₦1,000 minimum increment
export const AUTO_EXTEND_MINUTES = 2; // Extend auction by 2 minutes on last-minute bids

// Pagination
export const DEFAULT_PAGE_SIZE = 20;

// Storage Keys
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  USER: 'user',
  INTERFACE_TYPE: 'interface_type',
  ONBOARDING_COMPLETE: 'onboarding_complete',
};

// Categories
export const GADGET_CATEGORIES = [
  { id: 'smartphones', label: 'Smartphones', icon: 'phone-portrait-outline' },
  { id: 'laptops', label: 'Laptops', icon: 'laptop-outline' },
  { id: 'tablets', label: 'Tablets', icon: 'tablet-portrait-outline' },
  { id: 'smartwatches', label: 'Smartwatches', icon: 'watch-outline' },
  { id: 'headphones', label: 'Headphones', icon: 'headset-outline' },
  { id: 'cameras', label: 'Cameras', icon: 'camera-outline' },
  { id: 'gaming', label: 'Gaming', icon: 'game-controller-outline' },
  { id: 'accessories', label: 'Accessories', icon: 'hardware-chip-outline' },
  { id: 'other', label: 'Other', icon: 'cube-outline' },
];

// Conditions
export const GADGET_CONDITIONS = [
  { id: 'new', label: 'Brand New', color: '#10B981' },
  { id: 'like_new', label: 'Like New', color: '#3B82F6' },
  { id: 'excellent', label: 'Excellent', color: '#8B5CF6' },
  { id: 'good', label: 'Good', color: '#F59E0B' },
  { id: 'fair', label: 'Fair', color: '#EF4444' },
];
