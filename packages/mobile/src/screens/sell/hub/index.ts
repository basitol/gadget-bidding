import type React from 'react';
import { SoldScreen } from './SoldScreen';
import { SendToHubScreen } from './SendToHubScreen';
import { BookRiderScreen } from './BookRiderScreen';
import { DropoffCodeScreen } from './DropoffCodeScreen';
import { InspectionScreen } from './InspectionScreen';
import { CollectFromHubScreen } from './CollectFromHubScreen';

/**
 * Seller hub screens, registered in SellerNavigator. Each takes { orderId }:
 * 'SellerSold' · 'SendToHub' · 'BookRider' · 'HubDropoffCode' · 'HubInspection' · 'HubCollect'.
 */
export const hubScreens: { name: string; component: React.ComponentType<any> }[] = [
  { name: 'SellerSold', component: SoldScreen },
  { name: 'SendToHub', component: SendToHubScreen },
  { name: 'BookRider', component: BookRiderScreen },
  { name: 'HubDropoffCode', component: DropoffCodeScreen },
  { name: 'HubInspection', component: InspectionScreen },
  { name: 'HubCollect', component: CollectFromHubScreen },
];
