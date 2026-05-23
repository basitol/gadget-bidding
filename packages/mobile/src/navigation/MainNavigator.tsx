import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, borderRadius } from '../constants';
import { useAuthStore } from '../store';
import { useTheme } from '../hooks';

// Screens
import { HomeScreen } from '../screens/home';
import { AuctionDetailScreen } from '../screens/auction';
import { WalletScreen } from '../screens/wallet';
import {
  ProfileScreen,
  OrdersScreen,
  MyBidsScreen,
  MyAuctionsScreen,
  OrderDetailScreen,
} from '../screens/profile';
import { NotificationsScreen } from '../screens/notifications';
import { SearchScreen } from '../screens/search';
import {
  SellScreen,
  CreateGadgetScreen,
  CreateAuctionScreen,
} from '../screens/sell';
import { CategoryScreen } from '../screens/category';
import { PaymentScreen } from '../screens/payment';

// Tab Navigator
const Tab = createBottomTabNavigator();

// Stack Navigators
const HomeStack = createNativeStackNavigator();
const WalletStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();
const SellStack = createNativeStackNavigator();

// Home Stack Navigator
const HomeStackNavigator = () => (
  <HomeStack.Navigator screenOptions={{ headerShown: false }}>
    <HomeStack.Screen name="HomeMain" component={HomeScreen} />
    <HomeStack.Screen
      name="AuctionDetail"
      component={AuctionDetailScreen as any}
    />
    <HomeStack.Screen name="SearchScreen" component={SearchScreen} />
    <HomeStack.Screen name="Notifications" component={NotificationsScreen} />
    <HomeStack.Screen name="Category" component={CategoryScreen as any} />
  </HomeStack.Navigator>
);

// Wallet Stack Navigator
const WalletStackNavigator = () => (
  <WalletStack.Navigator screenOptions={{ headerShown: false }}>
    <WalletStack.Screen name="WalletMain" component={WalletScreen} />
  </WalletStack.Navigator>
);

// Profile Stack Navigator
const ProfileStackNavigator = () => (
  <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
    <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} />
    <ProfileStack.Screen name="Orders" component={OrdersScreen} />
    <ProfileStack.Screen name="OrderDetail" component={OrderDetailScreen} />
    <ProfileStack.Screen name="MyBids" component={MyBidsScreen} />
    <ProfileStack.Screen name="MyAuctions" component={MyAuctionsScreen} />
    <ProfileStack.Screen name="Payment" component={PaymentScreen} />
  </ProfileStack.Navigator>
);

// Sell Stack Navigator
const SellStackNavigator = () => (
  <SellStack.Navigator screenOptions={{ headerShown: false }}>
    <SellStack.Screen name="SellMain" component={SellScreen} />
    <SellStack.Screen name="CreateGadget" component={CreateGadgetScreen} />
    <SellStack.Screen name="CreateAuction" component={CreateAuctionScreen} />
  </SellStack.Navigator>
);

type TabIconName =
  | 'home-outline'
  | 'search-outline'
  | 'wallet-outline'
  | 'person-outline';

const TabIcon = ({
  name,
  focused,
}: {
  name: TabIconName;
  focused: boolean;
}) => {
  const { colors: themeColors } = useTheme();

  return (
    <View style={[styles.tabIconContainer, focused && styles.tabIconFocused]}>
      <Ionicons
        name={focused ? `${name.replace('-outline', '')}` as TabIconName : name}
        size={21}
        color={focused ? themeColors.primary : themeColors.textMuted}
      />
    </View>
  );
};

// Main Tab Navigator
export const MainNavigator: React.FC = () => {
  const { colors: themeColors, mode } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: [
          styles.tabBar,
          {
            backgroundColor: themeColors.surface,
            borderColor: themeColors.border,
          },
        ],
        tabBarActiveTintColor: themeColors.primary,
        tabBarInactiveTintColor: themeColors.textMuted,
        tabBarLabelStyle: [
          styles.tabLabel,
          { color: themeColors.textMuted },
        ],
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeStackNavigator}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="home-outline" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Search"
        component={SearchScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="search-outline" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Sell"
        component={SellStackNavigator}
        options={{
          tabBarIcon: ({ focused }) => (
            <View
              style={[
                styles.sellButton,
                { backgroundColor: themeColors.primary, shadowColor: themeColors.primary },
              ]}
            >
              <Ionicons name="add" size={28} color="#FFFFFF" />
            </View>
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tab.Screen
        name="Wallet"
        component={WalletStackNavigator}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="wallet-outline" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStackNavigator}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="person-outline" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabBar: {
    borderTopWidth: 1,
    height: 84,
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    position: 'absolute',
    bottom: spacing.md,
    left: 0,
    right: 0,
    elevation: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
  },
  tabLabel: {
    fontSize: fonts.sizes.xs,
    fontWeight: '600',
    marginTop: 2,
  },
  tabIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabIconFocused: {
    backgroundColor: colors.primary + '14',
  },
  sellButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  placeholder: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  placeholderText: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  placeholderTitle: {
    color: colors.text,
    fontSize: fonts.sizes.xxl,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  placeholderSubtitle: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.md,
    textAlign: 'center',
  },
});
