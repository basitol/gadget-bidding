import type React from 'react';
import { SellerCaseScreen } from './SellerCaseScreen';
import { CaseReplyScreen } from './CaseReplyScreen';
import { CaseReplySentScreen } from './CaseReplySentScreen';
import { CaseClosedScreen } from './CaseClosedScreen';

export { SellerCaseScreen, CaseReplyScreen, CaseReplySentScreen, CaseClosedScreen };

/**
 * The seller's side of a case, for the seller navigator's root stack.
 * SellerCase { disputeId } shows the case in whatever state it's in (and Case closed once decided).
 */
export const caseScreens: { name: string; component: React.ComponentType<any> }[] = [
  { name: 'SellerCase', component: SellerCaseScreen },
  { name: 'CaseReply', component: CaseReplyScreen },
  { name: 'CaseReplySent', component: CaseReplySentScreen },
  { name: 'CaseClosed', component: CaseClosedScreen },
];
