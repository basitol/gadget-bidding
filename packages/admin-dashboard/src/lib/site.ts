/** Canonical production origin for the admin dashboard. */
export const SITE_URL = (
  import.meta.env.VITE_SITE_URL || 'https://admin.gadgetsbidding.com'
).replace(/\/$/, '');

export const SITE_NAME = 'GadgetBid Ops';
export const SITE_TAGLINE = 'Operations console for Nigerian gadget auctions';
export const ORG_NAME = 'GadgetBid';
export const ORG_EMAIL = 'support@gadgetbid.ng';
export const ORG_LOCALITY = 'Lagos';
export const ORG_REGION = 'LA';
export const ORG_COUNTRY = 'NG';

export type PageSeo = {
  path: string;
  title: string;
  description: string;
  crumb: string;
  noindex?: boolean;
};

export const PAGES: Record<string, PageSeo> = {
  '/login': {
    path: '/login',
    title: 'Sign in',
    description:
      'Sign in to GadgetBid Ops to manage listings, auctions, orders, and payouts.',
    crumb: 'Sign in',
  },
  '/': {
    path: '/',
    title: 'Overview',
    description:
      'Live snapshot of GadgetBid marketplace health: listings, auctions, money movement, and risk.',
    crumb: 'Overview',
    noindex: true,
  },
  '/gadgets': {
    path: '/gadgets',
    title: 'Gadgets',
    description: 'Review and manage gadget listings awaiting approval or live on GadgetBid.',
    crumb: 'Gadgets',
    noindex: true,
  },
  '/auctions': {
    path: '/auctions',
    title: 'Auctions',
    description: 'Monitor live and scheduled auctions across the GadgetBid marketplace.',
    crumb: 'Auctions',
    noindex: true,
  },
  '/orders': {
    path: '/orders',
    title: 'Orders',
    description: 'Track buyer orders, payment status, and fulfillment for GadgetBid auctions.',
    crumb: 'Orders',
    noindex: true,
  },
  '/backoffice': {
    path: '/backoffice',
    title: 'Backoffice',
    description: 'Shipping and fulfillment queue for won auctions on GadgetBid.',
    crumb: 'Backoffice',
    noindex: true,
  },
  '/buyers': {
    path: '/buyers',
    title: 'Buyers',
    description: 'Manage buyer accounts on the GadgetBid marketplace.',
    crumb: 'Buyers',
    noindex: true,
  },
  '/sellers': {
    path: '/sellers',
    title: 'Sellers',
    description: 'Manage seller accounts and KYB status on GadgetBid.',
    crumb: 'Sellers',
    noindex: true,
  },
  '/admins': {
    path: '/admins',
    title: 'Admins',
    description: 'Manage GadgetBid operations staff accounts and access.',
    crumb: 'Admins',
    noindex: true,
  },
  '/support': {
    path: '/support',
    title: 'Support',
    description: 'Respond to seller and buyer support threads in GadgetBid Ops.',
    crumb: 'Support',
    noindex: true,
  },
  '/disputes': {
    path: '/disputes',
    title: 'Disputes',
    description: 'Investigate and resolve order disputes on GadgetBid.',
    crumb: 'Disputes',
    noindex: true,
  },
  '/payments': {
    path: '/payments',
    title: 'Payments',
    description: 'Review payment activity and wallet funding on GadgetBid.',
    crumb: 'Payments',
    noindex: true,
  },
  '/payouts': {
    path: '/payouts',
    title: 'Payouts',
    description: 'Approve and track seller payouts from GadgetBid escrow.',
    crumb: 'Payouts',
    noindex: true,
  },
  '/notifications': {
    path: '/notifications',
    title: 'Notifications',
    description: 'Backoffice notifications for GadgetBid operations staff.',
    crumb: 'Notifications',
    noindex: true,
  },
  '/audit': {
    path: '/audit',
    title: 'Audit log',
    description: 'Immutable audit trail of admin actions in GadgetBid Ops.',
    crumb: 'Audit log',
    noindex: true,
  },
  '/404': {
    path: '/404',
    title: 'Page not found',
    description: 'This page does not exist in GadgetBid Ops.',
    crumb: 'Not found',
  },
};

export function absoluteUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function documentTitle(pageTitle: string): string {
  return pageTitle === SITE_NAME ? pageTitle : `${pageTitle} · ${SITE_NAME}`;
}
