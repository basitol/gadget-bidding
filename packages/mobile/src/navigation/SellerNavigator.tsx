import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useIsFocused } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GlassTabBar } from './GlassTabBar';
import { OfflineOverlay } from '../components/states';
import { useNetworkStore } from '../store/networkStore';
import { SellerHomeScreen } from '../screens/sell/tabs/SellerHomeScreen';
import { MyListingsScreen } from '../screens/sell/tabs/MyListingsScreen';
import { SellerOrdersScreen } from '../screens/sell/tabs/SellerOrdersScreen';
import { caseScreens } from '../screens/sell/case';
import { storeExtraScreens } from '../screens/sell/store/extra';
import { SellerNotificationsScreen } from '../screens/sell/tabs/SellerNotificationsScreen';
import { PayoutsScreen } from '../screens/sell/tabs/PayoutsScreen';
import { SellerStoreScreen } from '../screens/sell/tabs/SellerStoreScreen';
import { storeScreens } from '../screens/sell/store';
import { moneyScreens } from '../screens/sell/money';
import { manageScreens } from '../screens/sell/manage';
import { hubScreens } from '../screens/sell/hub';
import { pausedScreens } from '../screens/sell/paused';

import {
  SellScreen,
  TwoStepSetupScreen,
  PayoutAccountScreen,
} from '../screens/sell';
import { ListGadgetScreen } from '../screens/sell/listing/ListGadgetScreen';
import { ListingSubmittedScreen } from '../screens/sell/listing/ListingSubmittedScreen';
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
import { SupportScreen } from '../screens/buyer/SupportScreen';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

const stackScreenOptions = {
  headerShown: false,
  animation: 'slide_from_right' as const,
  gestureEnabled: true,
};

/** The glass tab bar, with the offline screen drawn just under it (same as the buyer app). */
const SellerTabBar: React.FC<BottomTabBarProps> = props => {
  const focused = useIsFocused();
  useEffect(() => {
    useNetworkStore.setState({ tabsShowOffline: focused });
    return () => useNetworkStore.setState({ tabsShowOffline: false });
  }, [focused]);
  return (
    <>
      <OfflineOverlay inTabs />
      <GlassTabBar {...props} />
    </>
  );
};

/** Home · Listings · Orders · Payouts · Store */
const SellerTabs: React.FC = () => (
  <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={props => <SellerTabBar {...props} />}>
    <Tab.Screen name="Home" component={SellerHomeScreen as any} />
    <Tab.Screen name="Listings" component={MyListingsScreen as any} />
    <Tab.Screen name="Orders" component={SellerOrdersScreen as any} />
    <Tab.Screen name="Payouts" component={PayoutsScreen as any} />
    <Tab.Screen name="Store" component={SellerStoreScreen as any} />
  </Tab.Navigator>
);

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
      {[...storeScreens, ...storeExtraScreens, ...moneyScreens, ...caseScreens, ...manageScreens, ...hubScreens, ...pausedScreens].map(sc => (
        <RootStack.Screen key={sc.name} name={sc.name} component={sc.component as any} />
      ))}
      <RootStack.Screen name="PayoutAccount" component={PayoutAccountScreen as any} />
      {/* "List a gadget" (also opens a listing that needs changes, with { gadget }). Back steps through it. */}
      <RootStack.Screen name="CreateGadget" component={ListGadgetScreen as any} options={{ gestureEnabled: false }} />
      <RootStack.Screen name="ListingSubmitted" component={ListingSubmittedScreen as any} options={{ gestureEnabled: false }} />
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
      <RootStack.Screen name="Notifications" component={SellerNotificationsScreen as any} />
      <RootStack.Screen name="Settings" component={SettingsScreen as any} />
      <RootStack.Screen name="Policy" component={PolicyScreen as any} />
      <RootStack.Screen
        name="ErrorHistory"
        component={ErrorHistoryScreen as any}
      />
      <RootStack.Screen
        name="SupportChat"
        component={SupportScreen as any}
      />
    </RootStack.Navigator>
  );
};
