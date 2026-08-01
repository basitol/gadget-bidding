import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Bell, CheckCheck, Command, Inbox, Search } from 'lucide-react';
import { AdminNotification, adminApi, getStoredUser } from './api';
import { AppSidebar } from './components/AppSidebar';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { GadgetsPage } from './pages/GadgetsPage';
import { OrdersPage } from './pages/OrdersPage';
import { BackofficePage } from './pages/BackofficePage';
import { AdminsPage, BuyersPage, SellersPage } from './pages/UsersPage';
import { AuctionsPage } from './pages/AuctionsPage';
import { DisputesPage } from './pages/DisputesPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { PayoutsPage } from './pages/PayoutsPage';
import { AuditPage } from './pages/AuditPage';
import { SupportPage } from './pages/SupportPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { connectAdminSocket } from '@/lib/socket';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { label, when } from '@/lib/format';

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = getStoredUser();
  const token = localStorage.getItem('gb_admin_token');
  if (!token || !user || user.role !== 'admin') {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const user = getStoredUser();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-transparent">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200/70 bg-white/75 px-4 backdrop-blur-xl">
          <SidebarTrigger className="-ml-1 rounded-xl border border-slate-200 bg-white shadow-sm" />
          <Separator orientation="vertical" className="mr-1 h-5" />
          <div className="hidden min-w-0 flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-500 shadow-inner shadow-slate-950/[0.02] md:flex">
            <Search className="size-4 text-slate-400" />
            <span className="flex-1">Search orders, sellers, disputes…</span>
            <kbd className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-400">
              ⌘K
            </kbd>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="grid size-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:text-slate-900">
              <Command className="size-4" />
            </button>
            <AdminNotifications />
            <div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm sm:flex">
              <div className="grid size-7 place-items-center rounded-xl bg-slate-950 text-[10px] font-bold text-white">
                {user?.full_name
                  ?.split(/\s+/)
                  .slice(0, 2)
                  .map(part => part[0]?.toUpperCase())
                  .join('') || 'AD'}
              </div>
              <div className="leading-tight">
                <div className="text-xs font-semibold text-slate-900">
                  {user?.full_name || 'Admin'}
                </div>
                <div className="text-[11px] text-slate-500">Operations</div>
              </div>
            </div>
          </div>
        </header>
        <div className="relative flex-1 overflow-auto p-4 md:p-6">
          <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_0%,rgba(37,99,235,0.1),transparent_28%),radial-gradient(circle_at_90%_12%,rgba(14,165,233,0.09),transparent_26%),linear-gradient(180deg,#f8fbff_0%,#f5f7fb_46%,#f8fafc_100%)]" />
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function notificationData(notification: AdminNotification) {
  if (!notification.data) return {};
  if (typeof notification.data !== 'string') return notification.data;
  try {
    return JSON.parse(notification.data);
  } catch {
    return {};
  }
}

function AdminNotifications() {
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.notifications({ page: 1, limit: 8 });
      setItems(res.data || []);
      setUnreadCount(res.unread_count || 0);
    } catch {
      setItems([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const socket = connectAdminSocket();
    if (!socket) return;

    socket.on('notification', load);
    socket.on('support:message', load);

    return () => {
      socket.off('notification', load);
      socket.off('support:message', load);
    };
  }, [load]);

  const openNotification = async (notification: AdminNotification) => {
    if (!notification.is_read) {
      await adminApi.markNotificationRead(notification.id).catch(() => null);
      setItems(prev =>
        prev.map(item =>
          item.id === notification.id ? { ...item, is_read: true } : item
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    }

    const data = notificationData(notification);
    const route =
      data.route || (data.orderId || data.order_id ? '/backoffice' : '');
    if (route) {
      window.location.href = route;
    }
  };

  const markAllRead = async () => {
    await adminApi.markAllNotificationsRead().catch(() => null);
    setItems(prev => prev.map(item => ({ ...item, is_read: true })));
    setUnreadCount(0);
  };

  return (
    <DropdownMenu onOpenChange={open => open && load()}>
      <DropdownMenuTrigger asChild>
        <button className="relative grid size-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:text-slate-900">
          <Bell className="size-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white ring-2 ring-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[360px] rounded-2xl border-slate-200 bg-white p-2 shadow-2xl shadow-slate-950/10"
      >
        <div className="flex items-center justify-between px-2 py-2">
          <div>
            <div className="text-sm font-semibold text-slate-950">
              Backoffice notifications
            </div>
            <div className="text-xs text-slate-500">
              {unreadCount ? `${unreadCount} unread` : 'All caught up'}
            </div>
          </div>
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
          >
            <CheckCheck className="size-3.5" />
            Read all
          </button>
        </div>
        <DropdownMenuSeparator />
        <ScrollArea className="max-h-[420px]">
          {loading && items.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-slate-500">
              Loading notifications…
            </div>
          ) : items.length === 0 ? (
            <div className="grid place-items-center gap-2 px-3 py-8 text-center text-sm text-slate-500">
              <Inbox className="size-8 text-slate-300" />
              No backoffice notifications yet.
            </div>
          ) : (
            items.map(item => {
              const type = item.notification_type || item.type || 'system';
              return (
                <DropdownMenuItem
                  key={item.id}
                  onSelect={() => openNotification(item)}
                  className="cursor-pointer items-start gap-3 rounded-xl p-3 focus:bg-slate-50"
                >
                  <span
                    className={`mt-1 size-2.5 shrink-0 rounded-full ${
                      item.is_read ? 'bg-slate-300' : 'bg-blue-600'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-950">
                      {item.title}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-500">
                      {item.message}
                    </span>
                    <span className="mt-2 flex items-center justify-between text-[11px] font-medium text-slate-400">
                      <span>{label(type)}</span>
                      <span>{when(item.created_at)}</span>
                    </span>
                  </span>
                </DropdownMenuItem>
              );
            })
          )}
        </ScrollArea>
        <DropdownMenuSeparator />
        <Link
          to="/notifications"
          className="block rounded-xl px-3 py-2 text-center text-sm font-semibold text-blue-700 hover:bg-blue-50"
        >
          View all notifications
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Guard({ children }: { children: React.ReactNode }) {
  return (
    <RequireAdmin>
      <Shell>{children}</Shell>
    </RequireAdmin>
  );
}

export function App() {
  return (
    <TooltipProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <Guard>
              <DashboardPage />
            </Guard>
          }
        />
        <Route
          path="/gadgets"
          element={
            <Guard>
              <GadgetsPage />
            </Guard>
          }
        />
        <Route
          path="/auctions"
          element={
            <Guard>
              <AuctionsPage />
            </Guard>
          }
        />
        <Route
          path="/orders"
          element={
            <Guard>
              <OrdersPage />
            </Guard>
          }
        />
        <Route
          path="/backoffice"
          element={
            <Guard>
              <BackofficePage />
            </Guard>
          }
        />
        <Route
          path="/buyers"
          element={
            <Guard>
              <BuyersPage />
            </Guard>
          }
        />
        <Route
          path="/sellers"
          element={
            <Guard>
              <SellersPage />
            </Guard>
          }
        />
        <Route
          path="/admins"
          element={
            <Guard>
              <AdminsPage />
            </Guard>
          }
        />
        <Route path="/users" element={<Navigate to="/buyers" replace />} />
        <Route
          path="/support"
          element={
            <Guard>
              <SupportPage />
            </Guard>
          }
        />
        <Route
          path="/disputes"
          element={
            <Guard>
              <DisputesPage />
            </Guard>
          }
        />
        <Route
          path="/payments"
          element={
            <Guard>
              <PaymentsPage />
            </Guard>
          }
        />
        <Route
          path="/payouts"
          element={
            <Guard>
              <PayoutsPage />
            </Guard>
          }
        />
        <Route
          path="/notifications"
          element={
            <Guard>
              <NotificationsPage />
            </Guard>
          }
        />
        <Route
          path="/audit"
          element={
            <Guard>
              <AuditPage />
            </Guard>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </TooltipProvider>
  );
}
