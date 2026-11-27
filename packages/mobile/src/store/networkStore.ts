import { create } from 'zustand';
import { API_BASE_URL } from '../constants/config';

/**
 * "You're offline" without a native network module: an API call that gets no response at all
 * marks us offline, and a cheap health ping every few seconds brings us back.
 */
interface NetworkState {
  offline: boolean;
  checking: boolean;
  markOffline: () => void;
  markOnline: () => void;
  check: () => Promise<boolean>;
}

let timer: ReturnType<typeof setInterval> | null = null;

const ping = async () => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
};

export const useNetworkStore = create<NetworkState>((set, get) => ({
  offline: false,
  checking: false,
  markOffline: () => {
    if (get().offline) return;
    set({ offline: true });
    if (!timer) timer = setInterval(() => get().check(), 5000);
  },
  markOnline: () => {
    if (timer) clearInterval(timer);
    timer = null;
    if (get().offline) set({ offline: false });
  },
  check: async () => {
    set({ checking: true });
    const ok = await ping();
    set({ checking: false });
    if (ok) get().markOnline();
    return ok;
  },
}));
