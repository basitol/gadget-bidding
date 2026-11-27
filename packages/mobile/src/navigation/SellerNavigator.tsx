import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks';
import { TabIcon } from './TabIcon';
import { tabBarStyles as styles } from './tabStyles';

import {
  SellScreen,
  CreateGadgetScreen,
  TwoStepSetupScreen,
  PayoutAccountScreen,
} from '../screens/sell';
import { SellerSignUpScreen } from '../screens/sell/onboarding/SellerSignUpScreen';
import { SellerStatusScreen } from '../screens/sell/onboarding/SellerStatusScreen';
import { sellerApplicationService } from '../services/sellerApplication.service';
import { useAuthStore } from '../store';
import {
  ProfileScreen,
  OrdersScreen,
  MyAuctionsScreen,
  OrderDetailScreen,
  SettingsScreen,
  ShippingAddressScreen,
  PolicyScreen,
  ErrorHistoryScreen,
} from '../screens/profile';
import { AuctionDetailScreen } from '../screens/auction';
import { WalletScreen } from '../screens/wallet';
import { PaymentScreen } from '../screens/payment';
import { SupportChatScreen } from '../screens/support';
import { NotificationsScreen } from '../screens/notifications';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

const stackScreenOptions = {
  headerShown: false,
  animation: 'slide_from_right' as const,
  gestureEnabled: true,
};

/** Placeholder — the + tab only triggers CreateGadget. */
const SellTabPlaceholder = () => <View style={{ flex: 1 }} />;

/** Bottom tabs only — each destination is a standalone root screen. */
const SellerTabs: React.FC = () => {
  const { colors: themeColors, mode } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: [
          styles.tabBar,
          {
            backgroundColor:
              mode === 'dark'
                ? themeColors.surface
                : themeColors.backgroundLight,
            borderColor: themeColors.border,
          },
        ],
        tabBarActiveTintColor: themeColors.primary,
        tabBarInactiveTintColor: themeColors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="Listings"
        component={SellScreen as any}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="storefront-outline" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Auctions"
        component={MyAuctionsScreen as any}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="pricetag-outline" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Sell"
        component={SellTabPlaceholder}
        listeners={({ navigation }) => ({
          tabPress: e => {
            e.preventDefault();
            navigation.getParent()?.navigate('CreateGadget');
          },
        })}
        options={{
          tabBarIcon: () => (
            <View
              style={[
                styles.sellButton,
                {
                  backgroundColor: themeColors.primary,
                  shadowColor: themeColors.primary,
                },
              ]}
            >
              <Ionicons name="add" size={28} color="#FFFFFF" />
            </View>
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tab.Screen
        name="Sales"
        component={OrdersScreen as any}
        initialParams={{ initialTab: 'sales' }}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="bag-outline" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen as any}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="person-outline" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

/**
 * Where a seller lands: their application until it's sent, then where it stands
 * (Under review, Needs more info, Not approved, or "You're approved!" once), then the seller home.
 */
const useInitialRoute = () => {
  const { user, setUser } = useAuthStore();
  const [initial, setInitial] = useState<string | null>(user?.role === 'admin' ? 'MainTabs' : null);
  useEffect(() => {
    if (initial) return;
    let alive = true;
    (async () => {
      try {
        const [app, fresh] = await Promise.all([
          sellerApplicationService.get(),
          sellerApplicationService.account().catch(() => null),
        ]);
        if (fresh) setUser(fresh);
        if (!alive) return;
        setInitial(
          app.status === 'draft'
            ? 'SellerApply'
            : app.status === 'approved' && app.approval_seen
              ? 'MainTabs'
              : 'SellerStatus'
        );
      } catch {
        // Offline: go by what this phone last knew.
        const s = user?.seller_kyb_status;
        if (alive) setInitial(s === 'approved' ? 'MainTabs' : s === 'not_started' ? 'SellerApply' : 'SellerStatus');
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return initial;
};

/** Secondary screens sit above tabs so they are full-screen (no tab bar). */
export const SellerNavigator: React.FC = () => {
  const initial = useInitialRoute();
  if (!initial) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FB' }}>
        <ActivityIndicator color="#4F7BFF" />
      </View>
    );
  }
  return (
    <RootStack.Navigator screenOptions={stackScreenOptions} initialRouteName={initial}>
      <RootStack.Screen name="MainTabs" component={SellerTabs as any} />
      <RootStack.Screen
        name="SellerApply"
        component={SellerSignUpScreen as any}
        initialParams={{ resume: true }}
        options={{ gestureEnabled: false }}
      />
      <RootStack.Screen name="SellerStatus" component={SellerStatusScreen as any} options={{ gestureEnabled: false }} />
      <RootStack.Screen name="TwoStepSetup" component={TwoStepSetupScreen as any} />
      <RootStack.Screen name="PayoutAccount" component={PayoutAccountScreen as any} />
      <RootStack.Screen
        name="CreateGadget"
        component={CreateGadgetScreen as any}
      />
      <RootStack.Screen
        name="AuctionDetail"
        component={AuctionDetailScreen as any}
      />
      <RootStack.Screen
        name="OrderDetail"
        component={OrderDetailScreen as any}
      />
      <RootStack.Screen name="Payment" component={PaymentScreen as any} />
      <RootStack.Screen
        name="ShippingAddress"
        component={ShippingAddressScreen as any}
      />
      <RootStack.Screen name="Wallet" component={WalletScreen as any} />
      <RootStack.Screen
        name="Notifications"
        component={NotificationsScreen as any}
      />
      <RootStack.Screen name="Settings" component={SettingsScreen as any} />
      <RootStack.Screen name="Policy" component={PolicyScreen as any} />
      <RootStack.Screen
        name="ErrorHistory"
        component={ErrorHistoryScreen as any}
      />
      <RootStack.Screen
        name="SupportChat"
        component={SupportChatScreen as any}
      />
    </RootStack.Navigator>
  );
};
