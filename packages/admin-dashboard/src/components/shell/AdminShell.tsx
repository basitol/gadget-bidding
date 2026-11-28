import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, ChevronRight, LogOut, Menu, Search, SearchX, Settings, Users } from 'lucide-react';
import { clearSession, getStoredUser } from '@/api';
import { useQueues } from '@/hooks/useQueues';
import { NAV, SUB_NAV, TINTS, activeItem, crumbsFor, type NavItem } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { Icon3d, LogoMark, type Icon3dName } from '@/components/shell/Icon3d';
import { SearchDialog } from '@/components/shell/SearchDialog';
import { OfflineBanner, PageCrumbProvider, PageStatusProvider, useNetState, type PageStatus } from '@/components/states';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Admin layout from the design guide: blue rail (3D icons with counts) → sidebar
 * (Main, Queues, Settings) → white panel (radius 28) with breadcrumb and Team · Settings · Search.
 */

const initials = (name?: string) =>
  (name || 'Admin')
    .split(/\s+/)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? '')
    .join('');

const signOut = () => {
  clearSession();
  window.location.href = '/login';
};

const countLabel = (n?: number | null) => (n == null ? null : n > 999 ? '999+' : String(n));

/* ---------------- Rail ---------------- */

const RAIL: { key: string; label: string; to: string; icon: Icon3dName; count?: 'live_auctions' | 'kyb' | 'listing_review' | 'inspection_hub' | 'unread_notifications' }[] = [
  { key: 'auctions', label: 'Live auctions', to: '/auctions', icon: 'gavel', count: 'live_auctions' },
  { key: 'kyb', label: 'Seller KYB', to: '/sellers/applications', icon: 'idcard', count: 'kyb' },
  { key: 'listings', label: 'Listing review', to: '/gadgets?status=pending', icon: 'camera', count: 'listing_review' },
  { key: 'hub', label: 'Inspection hub', to: '/backoffice', icon: 'box', count: 'inspection_hub' },
  { key: 'money', label: 'Payouts & escrow', to: '/payouts', icon: 'wallet' },
  { key: 'rules', label: 'Fees & rules', to: '/rules', icon: 'tag' },
  { key: 'updates', label: 'Updates', to: '/notifications', icon: 'bell', count: 'unread_notifications' },
];

function Rail({ active }: { active?: NavItem }) {
  const { counts } = useQueues();
  return (
    <nav
      aria-label="Shortcuts"
      className="sticky top-3 hidden h-[calc(100svh-24px)] w-[76px] shrink-0 flex-col items-center gap-3 rounded-[28px] bg-[linear-gradient(180deg,#9FB3FF_0%,#7F9BFF_55%,#8E86F2_100%)] py-3 md:flex"
    >
      <Link
        to="/"
        aria-label="Gadgets Bidding overview"
        className="grid size-[58px] place-items-center rounded-[18px] bg-white shadow-[0_6px_16px_rgba(20,28,60,0.12)] focus-visible:outline-2 focus-visible:outline-white"
      >
        <LogoMark size={38} />
      </Link>
      {RAIL.map(item => {
        const n = item.count ? counts?.[item.count] : undefined;
        const on = active?.key === item.key;
        return (
          <Tooltip key={item.key}>
            <TooltipTrigger asChild>
              <Link
                to={item.to}
                aria-label={n ? `${item.label}, ${n}` : item.label}
                className={cn(
                  'relative grid size-[52px] place-items-center rounded-[16px] border border-white/70 bg-white/45 transition-[background-color,transform] duration-150 ease-out hover:bg-white/75 focus-visible:outline-2 focus-visible:outline-white',
                  on && 'bg-white shadow-[0_6px_16px_rgba(20,28,60,0.12)]'
                )}
              >
                <Icon3d name={item.icon} size={32} />
                {n ? (
                  <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-[#F0456B] px-1.5 py-px text-center text-[11px] font-medium leading-4 text-white ring-2 ring-[#8EA4FF]">
                    {countLabel(n)}
                  </span>
                ) : null}
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}

/* ---------------- Sidebar ---------------- */

function NavRow({ item, active, count, onNavigate }: { item: NavItem; active: boolean; count?: number | null; onNavigate?: () => void }) {
  const tint = item.tint ? TINTS[item.tint] : null;
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-11 items-center gap-3 rounded-[14px] px-3 text-[15px] text-ink transition-colors duration-150 hover:bg-white/60 focus-visible:outline-2 focus-visible:outline-blue-brand',
        active && 'gb-elev bg-white'
      )}
    >
      {tint ? (
        <span className="grid size-6 shrink-0 place-items-center rounded-[8px]" style={{ backgroundColor: tint.solid }}>
          <item.icon className="size-3.5 text-white" strokeWidth={2.2} />
        </span>
      ) : (
        <item.icon className="size-[18px] shrink-0 text-slate" strokeWidth={1.8} />
      )}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {count ? (
        tint ? (
          <span className="text-[13px] font-medium tabular-nums" style={{ color: TINTS.amber.fg }}>
            {countLabel(count)}
          </span>
        ) : (
          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-white px-1.5 text-[12px] font-medium tabular-nums text-slate ring-1 ring-line">
            {countLabel(count)}
          </span>
        )
      ) : null}
    </NavLink>
  );
}

function SidebarBody({ active, onNavigate }: { active?: NavItem; onNavigate?: () => void }) {
  const { counts, tasks } = useQueues();
  const user = getStoredUser();
  const [queuesOpen, setQueuesOpen] = useState(true);
  const countOf = (item: NavItem) => (item.count === 'tasks' ? tasks : item.count ? counts?.[item.count] : undefined);
  const row = (item: NavItem) => (
    <NavRow key={item.key} item={item} active={active?.key === item.key} count={countOf(item)} onNavigate={onNavigate} />
  );

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="gb-elev flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-[16px] bg-white px-2.5 text-left focus-visible:outline-2 focus-visible:outline-blue-brand"
            >
              <LogoMark size={28} className="rounded-[8px]" />
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">Gadgets Bidding</span>
              <ChevronDown className="size-4 shrink-0 text-slate" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60 rounded-xl">
            <DropdownMenuLabel className="font-normal">
              <div className="text-sm font-medium text-ink">Gadgets Bidding</div>
              <div className="text-xs text-slate">Lagos · Computer Village hub</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={signOut}>
              <LogOut className="size-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Link
          to="/notifications"
          onClick={onNavigate}
          aria-label={counts?.unread_notifications ? `Updates, ${counts.unread_notifications} unread` : 'Updates'}
          className="relative grid size-11 shrink-0 place-items-center rounded-[14px] text-slate hover:bg-white/60 focus-visible:outline-2 focus-visible:outline-blue-brand"
        >
          <Bell className="size-[18px]" strokeWidth={1.8} />
          {counts?.unread_notifications ? (
            <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-[#F0456B] ring-2 ring-[#E9EDFB]" />
          ) : null}
        </Link>
      </div>

      <div className="mt-2 flex flex-col gap-1">{NAV.filter(n => n.group === 'main').map(row)}</div>

      <div className="mt-4 flex items-center justify-between px-3">
        <button
          type="button"
          onClick={() => setQueuesOpen(o => !o)}
          aria-expanded={queuesOpen}
          className="flex items-center gap-1 rounded-md text-[13px] font-medium text-slate focus-visible:outline-2 focus-visible:outline-blue-brand"
        >
          Queues
          <ChevronDown className={cn('size-3.5 transition-transform duration-150', !queuesOpen && '-rotate-90')} />
        </button>
      </div>
      {queuesOpen ? <div className="flex flex-col gap-1">{NAV.filter(n => n.group === 'queues').map(row)}</div> : null}

      <div className="min-h-6 flex-1" />

      <div className="flex flex-col gap-1">{NAV.filter(n => n.group === 'settings').map(row)}</div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="gb-elev mt-2 flex h-14 items-center gap-3 rounded-[16px] bg-white px-3 text-left focus-visible:outline-2 focus-visible:outline-blue-brand"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-blue-tint text-[13px] font-medium text-blue-press">
              {initials(user?.full_name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-ink">{user?.full_name?.split(' ')[0] || 'Admin'}</span>
              <span className="block truncate text-[13px] text-slate">Admin</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-slate" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" className="w-56 rounded-xl">
          <DropdownMenuLabel className="font-normal">
            <div className="truncate text-sm font-medium text-ink">{user?.full_name}</div>
            <div className="text-xs text-slate">Admin</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/settings">Your account</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={signOut}>
            <LogOut className="size-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/* ---------------- Panel header + sub-nav ---------------- */

function HeaderButton({ label, onClick, to, children }: { label: string; onClick?: () => void; to?: string; children: ReactNode }) {
  const cls =
    'gb-elev grid size-10 place-items-center rounded-[12px] bg-white text-ink transition-colors duration-150 hover:bg-fill focus-visible:outline-2 focus-visible:outline-blue-brand';
  return to ? (
    <Link to={to} aria-label={label} title={label} className={cls}>
      {children}
    </Link>
  ) : (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

function SubNav({ pathname, search }: { pathname: string; search: string }) {
  const group = SUB_NAV.find(g => g.match.includes(pathname));
  if (!group || (pathname === '/sellers' && search.includes('kyb=pending'))) return null;
  return (
    <nav aria-label="Pages in this area" className="mb-6 flex flex-wrap gap-2">
      {group.items.map(i => (
        <NavLink
          key={i.to}
          to={i.to}
          className={({ isActive }) =>
            cn(
              'h-9 rounded-full px-4 text-[14px] font-medium leading-9 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-blue-brand',
              isActive ? 'bg-ink text-white' : 'bg-white text-slate ring-1 ring-line hover:text-ink'
            )
          }
        >
          {i.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const matched = useMemo(() => activeItem(location.pathname, location.search), [location.pathname, location.search]);
  const net = useNetState();
  const [pageStatus, setPageStatus] = useState<PageStatus>(null);
  const [pageCrumb, setPageCrumb] = useState<string | null>(null);
  // Bumped when the connection comes back: the page mounts again and loads fresh data.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey(k => k + 1), []);
  const notFound = pageStatus === 'Not found';
  // An unknown address (an old /orders/… link, say) can start like a real page: don't light that page up.
  const active = notFound ? undefined : matched;
  const status = net.down ? 'Offline' : notFound ? null : pageStatus;
  const crumbs = notFound
    ? ['Not found', ...(status ? [status] : [])]
    : [
        ...crumbsFor(location.pathname, location.search),
        ...(pageCrumb ? [pageCrumb] : []),
        ...(status ? [status] : []),
      ];
  const ActiveIcon = active?.icon;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="gb-canvas flex min-h-svh gap-3 p-3">
      <Rail active={active} />
      <aside className="sticky top-3 hidden h-[calc(100svh-24px)] w-[240px] shrink-0 overflow-y-auto px-1 py-1 lg:block">
        <SidebarBody active={active} />
      </aside>

      <main className="gb-elev flex min-w-0 flex-1 flex-col rounded-[28px] border border-white/80 bg-white/80 backdrop-blur-xl">
        <header className="flex h-[76px] shrink-0 items-center gap-3 px-6">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="grid size-10 place-items-center rounded-[12px] text-ink hover:bg-fill lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          {ActiveIcon ? (
            <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-blue-brand">
              <ActiveIcon className="size-4 text-white" strokeWidth={2} />
            </span>
          ) : (
            <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-slate">
              <SearchX className="size-4 text-white" strokeWidth={2} />
            </span>
          )}
          <nav aria-label="Breadcrumb" className="min-w-0">
            <ol className="flex items-center gap-1.5 text-[18px]">
              {crumbs.map((c, i) => (
                <li key={`${c}-${i}`} className="flex min-w-0 items-center gap-1.5">
                  {i > 0 ? <ChevronRight aria-hidden className="size-4 text-faint" /> : null}
                  <span
                    className={cn('truncate', i === crumbs.length - 1 ? 'font-medium text-ink' : 'text-slate')}
                    aria-current={i === crumbs.length - 1 ? 'page' : undefined}
                  >
                    {c}
                  </span>
                </li>
              ))}
            </ol>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <HeaderButton label="Team" to="/admins">
              <Users className="size-[18px]" strokeWidth={1.8} />
            </HeaderButton>
            <HeaderButton label="Settings" to="/settings">
              <Settings className="size-[18px]" strokeWidth={1.8} />
            </HeaderButton>
            <HeaderButton label="Search (⌘K)" onClick={() => setSearchOpen(true)}>
              <Search className="size-[18px]" strokeWidth={1.8} />
            </HeaderButton>
          </div>
        </header>
        <div className="flex-1 px-6 pb-8">
          <OfflineBanner onBack={reload} />
          {notFound ? null : <SubNav pathname={location.pathname} search={location.search} />}
          <PageStatusProvider value={setPageStatus}>
            <PageCrumbProvider value={setPageCrumb}>
              <Fragment key={reloadKey}>{children}</Fragment>
            </PageCrumbProvider>
          </PageStatusProvider>
        </div>
      </main>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="gb-canvas p-4 data-[side=left]:w-[288px]">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SidebarBody active={active} onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} onGo={to => navigate(to)} />
    </div>
  );
}
