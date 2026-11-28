import type React from 'react';
import { SellerOrderScreen } from './SellerOrderScreen';
import { PayoutDetailScreen } from './PayoutDetailScreen';

/** Seller money screens: one order ('SellerOrder', { orderId }) and one payout ('PayoutDetail', { payoutId }). */
export const moneyScreens: { name: string; component: React.ComponentType<any> }[] = [
  { name: 'SellerOrder', component: SellerOrderScreen },
  { name: 'PayoutDetail', component: PayoutDetailScreen },
];

export { SellerOrderScreen, PayoutDetailScreen };
