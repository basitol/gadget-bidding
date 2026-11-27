import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import { navigationRef } from './navigationRef';
import { registerForPush, routeForNotification } from '../services/pushNotifications';
import { AuthNavigator } from './AuthNavigator';
import { BuyerNavigator } from './BuyerNavigator';
import { SellerNavigator } from './SellerNavigator';
import { useAuthStore } from '../store';
import { colors } from '../constants';
import { isSellerRole } from '../utils/roles';

const linking: LinkingOptions<Record<string, object | undefined>> = {
  prefixes: ['gadgetbid://'],
  config: {
    screens: {
      // Payment callback page redirects to gadgetbid://wallet/verify?reference=...
      Wallet: 'wallet/verify',
      // Shared auction links: gadgetbid://auction/<id>. A gone or bad id shows "We can't find that auction".
      AuctionDetail: 'auction/:auctionId',
    },
  },
};

export { navigationRef };

type PendingRoute = { name: string; params?: Record<string, unknown> };

export const RootNavigator: React.FC = () => {
  const { isAuthenticated, interfaceType, user, checkAuth } = useAuthStore();
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  // A tapped alert may arrive before we're signed in or the navigator is mounted.
  const pendingRoute = useRef<PendingRoute | null>(null);

  const openPending = useCallback(() => {
    const route = pendingRoute.current;
    if (!route || !useAuthStore.getState().isAuthenticated || !navigationRef.isReady()) return;
    pendingRoute.current = null;
    navigationRef.navigate(route.name, route.params as object | undefined);
  }, []);

  const handleResponse = useCallback(
    (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      pendingRoute.current = routeForNotification(
        response.notification.request.content.data as Record<string, unknown>
      );
      openPending();
    },
    [openPending]
  );

  // Alert tapped while the app is running, and the one that launched it from closed.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    Notifications.getLastNotificationResponseAsync().then(handleResponse).catch(() => {});
    return () => sub.remove();
  }, [handleResponse]);

  // Signed in: refresh this device's push token (it can change), without prompting.
  useEffect(() => {
    if (!isAuthenticated) return;
    registerForPush({ ask: false });
    openPending();
  }, [isAuthenticated, openPending]);

  useEffect(() => {
    const initAuth = async () => {
      await checkAuth();
      setInitialCheckDone(true);
    };
    initAuth();
  }, []);

  // Only block on the initial auth check. Per-action loading (login/register)
  // is handled by the buttons themselves — gating here would unmount the
  // navigator and reset the stack back to the initial route.
  if (!initialCheckDone) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const resolvedInterface =
    interfaceType ?? (user && isSellerRole(user.role) ? 'seller' : 'buyer');

  return (
    <NavigationContainer ref={navigationRef} linking={linking} onReady={openPending}>
      {isAuthenticated ? (
        resolvedInterface === 'seller' ? (
          <SellerNavigator />
        ) : (
          <BuyerNavigator />
        )
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 16,
  },
});
