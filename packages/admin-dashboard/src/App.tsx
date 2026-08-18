import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Bell, CheckCheck, Inbox } from 'lucide-react';
import { AdminNotification, adminApi, getStoredUser } from './api';
import { AppSidebar } from './components/AppSidebar';
import { ConfirmDialogProvider } from './components/ConfirmDialogProvider';
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
      <SidebarInset className="bg-background">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-background px-5">
          <SidebarTrigger className="-ml-1 rounded-xl" />
          <Separator orientation="vertical" className="mr-1 h-6" />
          <div className="ml-auto flex items-center gap-3">
            <AdminNotifications />
            <div className="hidden items-center gap-3 rounded-xl border px-3 py-2 sm:flex">
              <div className="grid size-9 place-items-center rounded-xl bg-slate-950 text-xs font-bold text-white">
                {user?.full_name
                  ?.split(/\s+/)
                  .slice(0, 2)
                  .map(part => part[0]?.toUpperCase())
                  .join('') || 'AD'}
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold text-foreground">
                  {user?.full_name || 'Admin'}
                </div>
                <div className="text-xs text-muted-foreground">Operations</div>
              </div>
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-6 md:p-10">{children}</div>
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
        <button className="relative grid size-11 place-items-center rounded-xl border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Bell className="size-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 grid min-w-4.5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-90 rounded-lg p-2 shadow-lg"
      >
        <div className="flex items-center justify-between px-2 py-2">
          <div>
            <div className="text-sm font-semibold text-foreground">
              Backoffice notifications
            </div>
            <div className="text-xs text-muted-foreground">
              {unreadCount ? `${unreadCount} unread` : 'All caught up'}
            </div>
          </div>
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
          >
            <CheckCheck className="size-3.5" />
            Read all
          </button>
        </div>
        <DropdownMenuSeparator />
        <ScrollArea className="max-h-105">
          {loading && items.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              Loading notifications…
            </div>
          ) : items.length === 0 ? (
            <div className="grid place-items-center gap-2 px-3 py-8 text-center text-sm text-muted-foreground">
              <Inbox className="size-8 text-muted-foreground/40" />
              No backoffice notifications yet.
            </div>
          ) : (
            items.map(item => {
              const type = item.notification_type || item.type || 'system';
              return (
                <DropdownMenuItem
                  key={item.id}
                  onSelect={() => openNotification(item)}
                  className="cursor-pointer items-start gap-3 rounded-md p-3"
                >
                  <span
                    className={`mt-1 size-2 shrink-0 rounded-full ${
                      item.is_read ? 'bg-muted-foreground/30' : 'bg-primary'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {item.title}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                      {item.message}
                    </span>
                    <span className="mt-2 flex items-center justify-between text-[11px] font-medium text-muted-foreground/70">
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
          className="block rounded-md px-3 py-2 text-center text-sm font-semibold text-primary hover:bg-primary/10"
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
      <ConfirmDialogProvider>
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
      </ConfirmDialogProvider>
      <Toaster />
    </TooltipProvider>
  );
}
