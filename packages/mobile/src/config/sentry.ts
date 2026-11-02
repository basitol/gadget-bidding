import * as Sentry from '@sentry/react-native';
import { SENTRY_DSN } from '../constants/config';

export function initSentry(): void {
  if (__DEV__ || !SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.2,
  });
}

export { Sentry };
