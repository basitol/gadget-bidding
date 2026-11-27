import { create } from 'zustand';
import Constants from 'expo-constants';
import { API_BASE_URL } from '../constants/config';

/**
 * App-wide gates from GET /app-config (checked at launch, on every return to the foreground and
 * now and then while open), and from bid requests the server refuses:
 * - "Time to update": installed version below the server's minimum (426 APP_UPDATE_REQUIRED);
 * - "We're doing some maintenance": bidding paused for everyone (503 MAINTENANCE).
 */

export type Maintenance = {
  active: boolean;
  started_at: string | null;
  back_by: string | null;
  message: string | null;
};

export type AppConfig = {
  min_version: string;
  latest_version: string;
  store_urls: { ios: string | null; android: string | null };
  whats_new: string[];
  maintenance: Maintenance;
};

/** The version in this build (app.json "version"; native builds embed the same value). */
export const INSTALLED_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';

/** -1 / 0 / 1, comparing "2.1.0" style versions part by part. */
export const compareVersions = (a: string, b: string): number => {
  const pa = String(a).trim().split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).trim().split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
};

export const GATE_CODES = { MAINTENANCE: 'MAINTENANCE', APP_UPDATE_REQUIRED: 'APP_UPDATE_REQUIRED' } as const;

interface AppGateState {
  config: AppConfig | null;
  updateRequired: boolean;
  /** Set only while maintenance is on. */
  maintenance: Maintenance | null;
  checking: boolean;
  /** Fetch /app-config. `fresh` skips any HTTP cache ("Try again"). Resolves false if unreachable. */
  refresh: (opts?: { fresh?: boolean }) => Promise<boolean>;
  /** A bid request came back with a gate code: show the matching screen straight away. */
  applyServerGate: (code: string, data: any) => void;
}

const isUpdateRequired = (min?: string | null) => !!min && compareVersions(INSTALLED_VERSION, min) < 0;

export const useAppGateStore = create<AppGateState>((set, get) => ({
  config: null,
  updateRequired: false,
  maintenance: null,
  checking: false,

  refresh: async ({ fresh = false } = {}) => {
    set({ checking: true });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const url = `${API_BASE_URL}/app-config${fresh ? `?t=${Date.now()}` : ''}`;
      const res = await fetch(url, {
        headers: { 'X-App-Version': INSTALLED_VERSION, ...(fresh && { 'Cache-Control': 'no-cache' }) },
        signal: controller.signal,
      });
      if (!res.ok) return false;
      const json = await res.json();
      const config = json?.data as AppConfig | undefined;
      if (!config?.min_version) return false;
      set({
        config,
        updateRequired: isUpdateRequired(config.min_version),
        maintenance: config.maintenance?.active ? config.maintenance : null,
      });
      return true;
    } catch {
      // Offline or timed out: keep whatever we last knew (the offline screen covers this case).
      return false;
    } finally {
      clearTimeout(timer);
      set({ checking: false });
    }
  },

  applyServerGate: (code, data) => {
    if (code === GATE_CODES.MAINTENANCE) {
      const m = data?.maintenance as Maintenance | undefined;
      set({ maintenance: { active: true, started_at: m?.started_at ?? null, back_by: m?.back_by ?? null, message: m?.message ?? null } });
      return;
    }
    if (code === GATE_CODES.APP_UPDATE_REQUIRED) {
      const prev = get().config;
      const config: AppConfig = {
        min_version: data?.min_version ?? prev?.min_version ?? INSTALLED_VERSION,
        latest_version: data?.latest_version ?? prev?.latest_version ?? data?.min_version ?? INSTALLED_VERSION,
        store_urls: data?.store_urls ?? prev?.store_urls ?? { ios: null, android: null },
        whats_new: data?.whats_new ?? prev?.whats_new ?? [],
        maintenance: prev?.maintenance ?? { active: false, started_at: null, back_by: null, message: null },
      };
      set({ config, updateRequired: true });
    }
  },
}));
