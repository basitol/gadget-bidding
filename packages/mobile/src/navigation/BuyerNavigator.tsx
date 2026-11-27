import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GlassTabBar } from './GlassTabBar';
import {
  BuyerHomeScreen,
  ExploreScreen,
  WatchlistScreen,
  BidsScreen,
  BuyerProfileScreen,
  AlertsScreen,
  PaymentMethodsScreen,
  PersonalDetailsScreen,
  SecurityScreen,
  BuyerNotificationsScreen,
  AuctionScreen,
  PlaceBidScreen,
  BidPlacedScreen,
  OutbidScreen,
  AutoBidScreen,
  StoreScreen,
  YouWonScreen,
  CheckoutScreen,
  CheckoutAddressScreen,
  CheckoutPaymentScreen,
  PaidScreen,
  MyOrdersScreen,
  OrderTrackScreen,
  BankTransferScreen,
  UssdScreen,
  PaymentFailedScreen,
  MissedPaymentScreen,
  SecondChanceScreen,
  ReportProblemScreen,
  CaseScreen,
  CaseReturnScreen,
  AccountPausedScreen,
  NotificationSettingsScreen,
  DeliveryAddressesScreen,
  AddressFormScreen,
  HelpScreen,
  HelpCategoryScreen,
  HelpArticleScreen,
  ContactSupportScreen,
  TermsSummaryScreen,
  TermsOfUseScreen,
  PrivacyPolicyScreen,
  PrivacyDataScreen,
  AuctionResultScreen,
  CategoryBrowseScreen,
  ChangeContactScreen,
  ProfilePhotoScreen,
  ReportListingScreen,
  SupportScreen,
} from '../screens/buyer';
import { WalletScreen } from '../screens/wallet';
import {
  SettingsScreen,
  PolicyScreen,
  ErrorHistoryScreen,
} from '../screens/profile';
import { PaymentScreen } from '../screens/payment';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

const stackScreenOptions = {
  headerShown: false,
  animation: 'slide_from_right' as const,
  gestureEnabled: true,
};

/** Bottom tabs only — each destination is a standalone root screen. */
const BuyerTabs: React.FC = () => (
  <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={props => <GlassTabBar {...props} />}>
    <Tab.Screen name="Home" component={BuyerHomeScreen as any} />
    <Tab.Screen name="Explore" component={ExploreScreen as any} />
    <Tab.Screen name="Watchlist" component={WatchlistScreen as any} />
    <Tab.Screen name="Bids" component={BidsScreen as any} />
    <Tab.Screen name="Profile" component={BuyerProfileScreen as any} />
  </Tab.Navigator>
);

/** Secondary screens sit above tabs so they are full-screen (no tab bar). */
export const BuyerNavigator: React.FC = () => {
  return (
    <RootStack.Navigator screenOptions={stackScreenOptions}>
      <RootStack.Screen name="MainTabs" component={BuyerTabs as any} />
      <RootStack.Screen name="AuctionDetail" component={AuctionScreen as any} />
      <RootStack.Screen name="PlaceBid" component={PlaceBidScreen as any} />
      <RootStack.Screen name="BidPlaced" component={BidPlacedScreen as any} />
      <RootStack.Screen name="Outbid" component={OutbidScreen as any} />
      <RootStack.Screen name="AutoBid" component={AutoBidScreen as any} />
      <RootStack.Screen name="Store" component={StoreScreen as any} />
      <RootStack.Screen name="YouWon" component={YouWonScreen as any} />
      <RootStack.Screen name="Checkout" component={CheckoutScreen as any} />
      <RootStack.Screen name="CheckoutAddress" component={CheckoutAddressScreen as any} />
      <RootStack.Screen name="CheckoutPayment" component={CheckoutPaymentScreen as any} />
      <RootStack.Screen name="Paid" component={PaidScreen as any} options={{ gestureEnabled: false }} />
      <RootStack.Screen
        name="Notifications"
        component={BuyerNotificationsScreen as any}
      />
      <RootStack.Screen name="Category" component={CategoryBrowseScreen as any} />
      <RootStack.Screen name="Orders" component={MyOrdersScreen as any} />
      <RootStack.Screen name="OrderDetail" component={OrderTrackScreen as any} />
      <RootStack.Screen name="BankTransfer" component={BankTransferScreen as any} />
      <RootStack.Screen name="Ussd" component={UssdScreen as any} />
      <RootStack.Screen name="PaymentFailed" component={PaymentFailedScreen as any} />
      <RootStack.Screen name="MissedPayment" component={MissedPaymentScreen as any} />
      <RootStack.Screen name="SecondChance" component={SecondChanceScreen as any} />
      <RootStack.Screen name="ReportProblem" component={ReportProblemScreen as any} />
      <RootStack.Screen name="Case" component={CaseScreen as any} />
      <RootStack.Screen name="CaseReturn" component={CaseReturnScreen as any} />
      <RootStack.Screen name="AccountPaused" component={AccountPausedScreen as any} />
      {/* Same name as the seller app's chat, so "Support replied" alerts open it on either side. */}
      <RootStack.Screen name="SupportChat" component={SupportScreen as any} />
      <RootStack.Screen name="MyBids" component={BidsScreen as any} />
      <RootStack.Screen name="Search" component={ExploreScreen as any} />
      <RootStack.Screen name="Alerts" component={AlertsScreen as any} />
      <RootStack.Screen name="PaymentMethods" component={PaymentMethodsScreen as any} />
      <RootStack.Screen name="PersonalDetails" component={PersonalDetailsScreen as any} />
      <RootStack.Screen name="ChangeContact" component={ChangeContactScreen as any} />
      <RootStack.Screen name="ProfilePhoto" component={ProfilePhotoScreen as any} />
      <RootStack.Screen name="Security" component={SecurityScreen as any} />
      <RootStack.Screen name="NotificationSettings" component={NotificationSettingsScreen as any} />
      <RootStack.Screen name="Payment" component={PaymentScreen as any} />
      <RootStack.Screen name="AuctionResult" component={AuctionResultScreen as any} />
      <RootStack.Screen name="ReportListing" component={ReportListingScreen as any} />
      <RootStack.Screen name="DeliveryAddresses" component={DeliveryAddressesScreen as any} />
      <RootStack.Screen name="AddressForm" component={AddressFormScreen as any} />
      {/* Older links to the address screen land on the address book. */}
      <RootStack.Screen name="ShippingAddress" component={DeliveryAddressesScreen as any} />
      {/* Help centre, contact support, terms and privacy */}
      <RootStack.Screen name="Help" component={HelpScreen as any} />
      <RootStack.Screen name="HelpCategory" component={HelpCategoryScreen as any} />
      <RootStack.Screen name="HelpArticle" component={HelpArticleScreen as any} />
      <RootStack.Screen name="ContactSupport" component={ContactSupportScreen as any} />
      <RootStack.Screen name="Terms" component={TermsSummaryScreen as any} />
      <RootStack.Screen name="TermsOfUse" component={TermsOfUseScreen as any} />
      <RootStack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen as any} />
      <RootStack.Screen name="PrivacyData" component={PrivacyDataScreen as any} />
      <RootStack.Screen name="Settings" component={SettingsScreen as any} />
      <RootStack.Screen name="Policy" component={PolicyScreen as any} />
      <RootStack.Screen
        name="ErrorHistory"
        component={ErrorHistoryScreen as any}
      />
      {/* Also available above tabs so detail flows can open wallet full-screen */}
      <RootStack.Screen name="Wallet" component={WalletScreen as any} />
    </RootStack.Navigator>
  );
};
