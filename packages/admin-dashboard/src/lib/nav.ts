import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  Box,
  CircleCheck,
  FileText,
  Flag,
  ShieldAlert,
  Gavel,
  IdCard,
  KeyRound,
  LayoutGrid,
  ListChecks,
  Camera,
  ScrollText,
  Settings,
  Users,
  Wallet,
} from 'lucide-react';
import type { QueueCounts } from '@/api';

/**
 * One map for the rail, the sidebar, the header breadcrumb and the pill sub-nav,
 * so every existing page stays one click away.
 */

export type Tint = 'blue' | 'violet' | 'amber' | 'red' | 'teal' | 'green';

export const TINTS: Record<Tint, { bg: string; fg: string; solid: string }> = {
  blue: { bg: '#F1F5FF', fg: '#3E6AF0', solid: '#4F7BFF' },
  violet: { bg: '#F5F2FF', fg: '#7C68E8', solid: '#9B87F5' },
  amber: { bg: '#FFF6EE', fg: '#DB7A2E', solid: '#F2A15A' },
  red: { bg: '#FDF0F2', fg: '#D9536A', solid: '#EE7A8E' },
  teal: { bg: '#E6F7F7', fg: '#0E8B8A', solid: '#3DB8B6' },
  green: { bg: '#EEF9F2', fg: '#2E9E5E', solid: '#4CC07D' },
};

export type NavItem = {
  key: string;
  label: string;
  to: string;
  icon: LucideIcon;
  /** Paths that light this item up. */
  match: string[];
  count?: keyof QueueCounts | 'tasks';
  tint?: Tint;
  group: 'main' | 'queues' | 'settings';
};

export const NAV: NavItem[] = [
  { key: 'overview', label: 'Overview', to: '/', icon: LayoutGrid, match: ['/'], group: 'main' },
  { key: 'updates', label: 'Updates', to: '/notifications', icon: FileText, match: ['/notifications'], count: 'unread_notifications', group: 'main' },
  { key: 'tasks', label: 'My tasks', to: '/tasks', icon: CircleCheck, match: ['/tasks'], count: 'tasks', group: 'main' },
  { key: 'users', label: 'Users', to: '/buyers', icon: Users, match: ['/buyers', '/sellers'], group: 'main' },

  { key: 'kyb', label: 'Seller KYB', to: '/sellers/applications', icon: IdCard, match: ['/sellers/applications'], count: 'kyb', tint: 'violet', group: 'queues' },
  { key: 'listings', label: 'Listing review', to: '/gadgets?status=pending', icon: Camera, match: ['/gadgets'], count: 'listing_review', tint: 'blue', group: 'queues' },
  { key: 'hub', label: 'Inspection hub', to: '/backoffice', icon: Box, match: ['/backoffice'], count: 'inspection_hub', tint: 'amber', group: 'queues' },
  { key: 'disputes', label: 'Disputes', to: '/disputes', icon: Flag, match: ['/disputes', '/support'], count: 'disputes', tint: 'red', group: 'queues' },
  { key: 'reports', label: 'Listing reports', to: '/reports', icon: ShieldAlert, match: ['/reports'], count: 'listing_reports', tint: 'red', group: 'queues' },
  { key: 'auctions', label: 'Live auctions', to: '/auctions', icon: Gavel, match: ['/auctions'], tint: 'teal', group: 'queues' },
  { key: 'money', label: 'Payouts & escrow', to: '/payouts', icon: Wallet, match: ['/payouts', '/payments', '/orders'], tint: 'green', group: 'queues' },

  { key: 'rules', label: 'Fees & rules', to: '/rules', icon: ListChecks, match: ['/rules'], group: 'settings' },
  { key: 'audit', label: 'Audit logs', to: '/audit', icon: ScrollText, match: ['/audit'], group: 'settings' },
  { key: 'roles', label: 'Roles & permissions', to: '/admins', icon: KeyRound, match: ['/admins'], group: 'settings' },
  { key: 'settings', label: 'Settings', to: '/settings', icon: Settings, match: ['/settings'], group: 'settings' },
];

export const NOTIFICATIONS_ICON = Bell;

/** Sibling pages reached with pills under the header (design guide: Money and Team areas). */
export const SUB_NAV: { match: string[]; items: { label: string; to: string }[] }[] = [
  {
    match: ['/buyers', '/sellers'],
    items: [
      { label: 'Buyers', to: '/buyers' },
      { label: 'Sellers', to: '/sellers' },
    ],
  },
  {
    match: ['/payouts', '/payments', '/orders'],
    items: [
      { label: 'Payouts', to: '/payouts' },
      { label: 'Payments', to: '/payments' },
      { label: 'Orders', to: '/orders' },
    ],
  },
  {
    match: ['/disputes', '/support'],
    items: [
      { label: 'Disputes', to: '/disputes' },
      { label: 'Support chats', to: '/support' },
    ],
  },
];

const GROUP_LABEL: Record<NavItem['group'], string | null> = {
  main: null,
  queues: 'Queues',
  settings: 'Settings',
};

/** The nav item for a path, with the KYB queue (seller applications) winning over Users › Sellers. */
export function activeItem(pathname: string, search: string): NavItem | undefined {
  if (
    pathname === '/sellers/applications' ||
    (pathname === '/sellers' && new URLSearchParams(search).get('kyb') === 'pending')
  ) {
    return NAV.find(n => n.key === 'kyb');
  }
  if (pathname === '/') return NAV[0];
  return NAV.find(n => n.match.some(m => m !== '/' && (pathname === m || pathname.startsWith(`${m}/`))));
}

const PAGE_TITLES: Record<string, string> = {
  '/buyers': 'Buyers',
  '/sellers': 'Sellers',
  '/payments': 'Payments',
  '/orders': 'Orders',
  '/support': 'Support chats',
  '/gadgets': 'Listings',
};

/** Breadcrumb for the panel header: group › section › page. */
export function crumbsFor(pathname: string, search: string): string[] {
  const item = activeItem(pathname, search);
  if (!item) return ['Not found'];
  const crumbs: string[] = [];
  const group = GROUP_LABEL[item.group];
  if (group) crumbs.push(group);
  crumbs.push(item.label);
  const page = PAGE_TITLES[pathname];
  if (page && page !== item.label && !(item.key === 'kyb' && pathname === '/sellers')) crumbs.push(page);
  return crumbs;
}
