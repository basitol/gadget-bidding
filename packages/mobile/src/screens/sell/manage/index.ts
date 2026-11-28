import type React from 'react';
import { ManageListingScreen } from './ManageListingScreen';
import { EditListingScreen } from './EditListingScreen';
import { EndListingScreen } from './EndListingScreen';
import { EndEarlyScreen } from './EndEarlyScreen';
import { RelistScreen } from './RelistScreen';
import { BidderNoteScreen } from './BidderNoteScreen';

/**
 * Seller manage screens, registered in SellerNavigator. Each takes { auctionId }:
 * ManageListing, EditListing (no bids), EndListing (no bids), EndEarly (bids), Relist (didn't sell),
 * BidderNote (bids; checked by our team first).
 */
export const manageScreens: { name: string; component: React.ComponentType<any> }[] = [
  { name: 'ManageListing', component: ManageListingScreen },
  { name: 'EditListing', component: EditListingScreen },
  { name: 'EndListing', component: EndListingScreen },
  { name: 'EndEarly', component: EndEarlyScreen },
  { name: 'Relist', component: RelistScreen },
  { name: 'BidderNote', component: BidderNoteScreen },
];

export { ManageListingScreen, EditListingScreen, EndListingScreen, EndEarlyScreen, RelistScreen, BidderNoteScreen };
