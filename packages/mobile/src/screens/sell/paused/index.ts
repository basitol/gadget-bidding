import type React from 'react';
import { ListingsPausedScreen } from './ListingsPausedScreen';

/** Seller paused screens, registered in SellerNavigator: 'ListingsPaused' (no params). */
export const pausedScreens: { name: string; component: React.ComponentType<any> }[] = [
  { name: 'ListingsPaused', component: ListingsPausedScreen },
];

export { ListingsPausedScreen };
