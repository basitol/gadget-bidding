import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SENTRY_DSN } from '../constants/config';

/**
 * Privacy & your data › "Help improve the app" (anonymous usage stats and crash reports).
 * The server keeps the switch; this device remembers it so the next launch honours it
 * before anyone signs in. Missing = on (the default).
 */
const USAGE_STATS_KEY = 'privacy.usage_stats';

let active = false;

const start = () => {
  if (active) return;
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.2,
  });
  active = true;
};

export function initSentry(): void {
  if (__DEV__ || !SENTRY_DSN) {
    return;
  }
  AsyncStorage.getItem(USAGE_STATS_KEY)
    .then(value => {
      if (value !== 'off') start();
    })
    .catch(start);
}

/** Called when the switch changes or the server value loads: stops or starts crash reports. */
export async function setUsageStatsEnabled(on: boolean): Promise<void> {
  await AsyncStorage.setItem(USAGE_STATS_KEY, on ? 'on' : 'off').catch(() => {});
  if (__DEV__ || !SENTRY_DSN) return;
  if (on) {
    start();
  } else if (active) {
    active = false;
    await Sentry.close().catch(() => {});
  }
}

export { Sentry };
