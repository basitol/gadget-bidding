import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../hooks';
import { TabIcon } from './TabIcon';
import { tabBarStyles as styles } from './tabStyles';

import { HomeScreen } from '../screens/home';
import { AuctionDetailScreen } from '../screens/auction';
import { WalletScreen } from '../screens/wallet';
import {
  ProfileScreen,
  OrdersScreen,
  MyBidsScreen,
  OrderDetailScreen,
  SettingsScreen,
  ShippingAddressScreen,
  PolicyScreen,
} from '../screens/profile';
import { NotificationsScreen } from '../screens/notifications';
import { SearchScreen } from '../screens/search';
import { CategoryScreen } from '../screens/category';
import { PaymentScreen } from '../screens/payment';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

const stackScreenOptions = {
  headerShown: false,
  animation: 'slide_from_right' as const,
  gestureEnabled: true,
};

/** Bottom tabs only — each destination is a standalone root screen. */
const BuyerTabs: React.FC = () => {
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
        name="Home"
        component={HomeScreen as any}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="home-outline" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Search"
        component={SearchScreen as any}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="search-outline" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Wallet"
        component={WalletScreen as any}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="wallet-outline" focused={focused} />
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

/** Secondary screens sit above tabs so they are full-screen (no tab bar). */
export const BuyerNavigator: React.FC = () => {
  return (
    <RootStack.Navigator screenOptions={stackScreenOptions}>
      <RootStack.Screen name="MainTabs" component={BuyerTabs as any} />
      <RootStack.Screen
        name="AuctionDetail"
        component={AuctionDetailScreen as any}
      />
      <RootStack.Screen
        name="Notifications"
        component={NotificationsScreen as any}
      />
      <RootStack.Screen name="Category" component={CategoryScreen as any} />
      <RootStack.Screen name="Orders" component={OrdersScreen as any} />
      <RootStack.Screen
        name="OrderDetail"
        component={OrderDetailScreen as any}
      />
      <RootStack.Screen name="MyBids" component={MyBidsScreen as any} />
      <RootStack.Screen name="Payment" component={PaymentScreen as any} />
      <RootStack.Screen
        name="ShippingAddress"
        component={ShippingAddressScreen as any}
      />
      <RootStack.Screen name="Settings" component={SettingsScreen as any} />
      <RootStack.Screen name="Policy" component={PolicyScreen as any} />
      {/* Also available above tabs so detail flows can open wallet full-screen */}
      <RootStack.Screen name="Wallet" component={WalletScreen as any} />
    </RootStack.Navigator>
  );
};
