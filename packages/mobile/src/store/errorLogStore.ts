import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ErrorLogEntry {
  id: string;
  message: string;
  /** Screen or subsystem where the error surfaced, e.g. "WalletScreen". */
  source: string;
  statusCode?: number;
  /** Request path for API errors, e.g. "/wallet/balance". */
  path?: string;
  timestamp: number;
}

const STORAGE_KEY = '@gadgetbid/error_log';
const MAX_ENTRIES = 50;

interface ErrorLogState {
  errors: ErrorLogEntry[];
  hydrated: boolean;
  logError: (entry: {
    message: string;
    source: string;
    statusCode?: number;
    path?: string;
  }) => void;
  clear: () => void;
  hydrate: () => Promise<void>;
}

const persist = async (errors: ErrorLogEntry[]) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(errors));
  } catch {
    // Storage failures must never mask the original error.
  }
};

export const useErrorLogStore = create<ErrorLogState>((set, get) => ({
  errors: [],
  hydrated: false,

  logError: entry => {
    const next: ErrorLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      message: entry.message,
      source: entry.source,
      statusCode: entry.statusCode,
      path: entry.path,
      timestamp: Date.now(),
    };
    const errors = [next, ...get().errors].slice(0, MAX_ENTRIES);
    set({ errors });
    persist(errors);
  },

  clear: () => {
    set({ errors: [] });
    persist([]);
  },

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const errors: ErrorLogEntry[] = raw ? JSON.parse(raw) : [];
      set({ errors, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
}));
