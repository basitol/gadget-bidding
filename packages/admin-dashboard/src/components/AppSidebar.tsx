import { NavLink, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Gavel,
  LayoutDashboard,
  LogOut,
  Package,
  Scale,
  ShieldCheck,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Wallet,
  ClipboardList,
  MessageCircle,
  BadgeDollarSign,
  Bell,
} from 'lucide-react';
import { clearSession, getStoredUser } from '@/api';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';

const monitor = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
];

const marketplace = [
  { to: '/gadgets', label: 'Gadgets', icon: Package },
  { to: '/auctions', label: 'Auctions', icon: Gavel },
  { to: '/orders', label: 'Orders', icon: ShoppingCart },
  { to: '/backoffice', label: 'Backoffice', icon: Truck },
];

const risk = [
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/support', label: 'Support', icon: MessageCircle },
  { to: '/disputes', label: 'Disputes', icon: Scale },
  { to: '/payments', label: 'Payments', icon: Wallet },
  { to: '/payouts', label: 'Payouts', icon: BadgeDollarSign },
  { to: '/buyers', label: 'Buyers', icon: Users },
  { to: '/sellers', label: 'Sellers', icon: Store },
  { to: '/admins', label: 'Admins', icon: ShieldCheck },
  { to: '/audit', label: 'Audit log', icon: ClipboardList },
];

function NavItems({
  items,
}: {
  items: { to: string; label: string; icon: LucideIcon; end?: boolean }[];
}) {
  const location = useLocation();

  return (
    <SidebarMenu className="gap-2">
      {items.map(item => {
        const isActive = item.end
          ? location.pathname === item.to
          : location.pathname === item.to ||
            location.pathname.startsWith(`${item.to}/`);

        return (
          <SidebarMenuItem key={item.to}>
            <SidebarMenuButton
              asChild
              isActive={isActive}
              className="h-10 rounded-xl px-3 text-sidebar-foreground/75 transition-all hover:bg-white/8 hover:text-white data-active:bg-white data-active:text-slate-950 data-active:shadow-sm"
            >
              <NavLink to={item.to} end={item.end}>
                <item.icon />
                <span>{item.label}</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function initials(name?: string) {
  if (!name) return 'AD';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() || '')
    .join('');
}

export function AppSidebar() {
  const user = getStoredUser();

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-slate-900/10 bg-slate-950"
    >
      <SidebarHeader className="border-b border-white/10 px-4 py-4">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-sky-400 text-sm font-black text-white shadow-lg shadow-blue-500/25">
            GB
          </div>
          <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
            <span className="text-base font-semibold tracking-tight text-white">
              GadgetBid
            </span>
            <span className="text-xs text-slate-400">Operations console</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-3 bg-slate-950">
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="mb-1 text-slate-500">
            Monitor
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <NavItems items={monitor} />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="mb-1 text-slate-500">
            Marketplace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <NavItems items={marketplace} />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="mb-1 text-slate-500">
            Risk & money
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <NavItems items={risk} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-3 border-t border-white/10 bg-slate-950 p-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-2.5 shadow-inner shadow-white/[0.03] group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-1.5">
          <div className="flex items-center gap-3">
            <Avatar className="size-9 ring-1 ring-white/15">
              <AvatarFallback className="bg-white text-xs font-bold text-slate-950">
                {initials(user?.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <div className="truncate text-sm font-semibold text-white">
                {user?.full_name}
              </div>
              <div className="truncate text-xs text-slate-400">
                {user?.phone_number}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              clearSession();
              window.location.href = '/login';
            }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0"
          >
            <LogOut className="size-4 shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">
              Sign out
            </span>
          </button>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
