import { createNavigationContainerRef } from '@react-navigation/native';

/**
 * The app's navigation container, for code that lives outside a screen (push notification taps,
 * the error screen's "Contact support"). Kept in its own module so components can import it
 * without pulling in the navigators.
 */
export const navigationRef = createNavigationContainerRef<Record<string, object | undefined>>();
