import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import {
  NavigationContainer,
  type LinkingOptions,
} from '@react-navigation/native';
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
    },
  },
};

export const RootNavigator: React.FC = () => {
  const { isAuthenticated, interfaceType, user, checkAuth } = useAuthStore();
  const [initialCheckDone, setInitialCheckDone] = useState(false);

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
    <NavigationContainer linking={linking}>
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
