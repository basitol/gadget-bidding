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
import { BrandMark } from '@/components/BrandMark';
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
              className="h-11 rounded-xl px-3 text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-active:bg-primary/10 data-active:font-medium data-active:text-primary"
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
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-muted/60">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-5">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <BrandMark size="md" className="group-data-[collapsible=icon]:size-8" />
          <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
              GadgetBid
            </span>
            <span className="text-xs text-muted-foreground">
              Operations console
            </span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-3">
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="mb-1 text-muted-foreground">
            Monitor
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <NavItems items={monitor} />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="mb-1 text-muted-foreground">
            Marketplace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <NavItems items={marketplace} />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="mb-1 text-muted-foreground">
            Risk & money
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <NavItems items={risk} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-3 border-t border-sidebar-border p-4">
        <div className="rounded-2xl border border-sidebar-border bg-background/70 p-3 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-1.5">
          <div className="flex items-center gap-3">
            <Avatar className="size-10 ring-1 ring-sidebar-border">
              <AvatarFallback className="bg-slate-950 text-xs font-bold text-white">
                {initials(user?.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <div className="truncate text-sm font-semibold text-sidebar-foreground">
                {user?.full_name}
              </div>
              <div className="truncate text-xs text-muted-foreground">
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
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-sidebar-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0"
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
