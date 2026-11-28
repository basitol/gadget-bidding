import type React from 'react';
import { StoreDetailsScreen } from './StoreDetailsScreen';
import { StoreReviewsScreen } from './StoreReviewsScreen';
import { StoreStaffScreen } from './StoreStaffScreen';
import { SalesInsightsScreen } from './SalesInsightsScreen';
import { BusinessDocumentsScreen } from './BusinessDocumentsScreen';
import { SellerNotificationSettingsScreen } from './SellerNotificationSettingsScreen';
import { SellerHelpScreen } from './SellerHelpScreen';
import { SellerAgreementScreen } from './SellerAgreementScreen';

export {
  StoreDetailsScreen,
  StoreReviewsScreen,
  StoreStaffScreen,
  SalesInsightsScreen,
  BusinessDocumentsScreen,
  SellerNotificationSettingsScreen,
  SellerHelpScreen,
  SellerAgreementScreen,
};

/** The screens under the seller's Store tab, for the seller navigator's root stack. */
export const storeScreens: { name: string; component: React.ComponentType<any> }[] = [
  { name: 'StoreDetails', component: StoreDetailsScreen },
  { name: 'StoreReviews', component: StoreReviewsScreen },
  { name: 'StoreStaff', component: StoreStaffScreen },
  { name: 'SalesInsights', component: SalesInsightsScreen },
  { name: 'BusinessDocuments', component: BusinessDocumentsScreen },
  { name: 'SellerNotificationSettings', component: SellerNotificationSettingsScreen },
  { name: 'SellerHelp', component: SellerHelpScreen },
  { name: 'SellerAgreement', component: SellerAgreementScreen },
];
