import type React from 'react';
import { DocumentViewerScreen } from './DocumentViewerScreen';
import { CloseStoreScreen } from './CloseStoreScreen';

export { DocumentViewerScreen, CloseStoreScreen };

/**
 * More screens under the seller's Store tab, for the seller navigator's root stack:
 * DocumentViewer ({ kind }) from Business documents, and CloseStore.
 */
export const storeExtraScreens: { name: string; component: React.ComponentType<any> }[] = [
  { name: 'DocumentViewer', component: DocumentViewerScreen },
  { name: 'CloseStore', component: CloseStoreScreen },
];
