import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AdminNotification, adminApi } from '@/api';
import { label, when } from '@/lib/format';
import {
  Empty,
  ErrorAlert,
  PageHeader,
  Pagination,
  Panel,
  Toolbar,
} from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { connectAdminSocket } from '@/lib/socket';

function notificationData(notification: AdminNotification) {
  if (!notification.data) return {};
  if (typeof notification.data !== 'string') return notification.data;
  try {
    return JSON.parse(notification.data);
  } catch {
    return {};
  }
}

function notificationRoute(notification: AdminNotification): string {
  const data = notificationData(notification);
  return data.route || (data.orderId || data.order_id ? '/backoffice' : '');
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.notifications({ page, limit });
      setItems(res.data || []);
      setUnreadCount(res.unread_count || 0);
      setTotal(res.pagination?.total || 0);
      setTotalPages(
        res.pagination?.totalPages || res.pagination?.total_pages || 1
      );
    } catch (err: any) {
      setError(err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }, [page, limit]);

  useEffect(() => {
    load();
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

    const route = notificationRoute(notification);
    if (route) navigate(route);
  };

  const markAllRead = async () => {
    await adminApi.markAllNotificationsRead().catch(() => null);
    setItems(prev => prev.map(item => ({ ...item, is_read: true })));
    setUnreadCount(0);
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Operational alerts from seller listings, support messages, orders, payouts, and disputes."
        actions={
          <>
            <Button variant="secondary" onClick={load} disabled={loading}>
              Refresh
            </Button>
            <Button onClick={markAllRead} disabled={unreadCount === 0}>
              <CheckCheck className="mr-2 size-4" />
              Mark all read
            </Button>
          </>
        }
      />

      <ErrorAlert>{error}</ErrorAlert>

      <Toolbar>
        <Badge variant="secondary" className="bg-primary/15 text-primary">
          {total} notifications
        </Badge>
        <Badge variant="secondary" className="bg-blue-500/15 text-blue-700">
          {unreadCount} unread
        </Badge>
      </Toolbar>

      <Panel>
        {loading && items.length === 0 ? (
          <Empty>Loading notifications…</Empty>
        ) : items.length === 0 ? (
          <Empty>No notifications yet.</Empty>
        ) : (
          <>
            <div className="divide-y divide-slate-200">
              {items.map(item => {
                const type = item.notification_type || item.type || 'system';
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openNotification(item)}
                    className="flex w-full gap-4 px-4 py-4 text-left transition-colors hover:bg-slate-50"
                  >
                    <span
                      className={`mt-1 grid size-10 shrink-0 place-items-center rounded-2xl ${
                        item.is_read
                          ? 'bg-slate-100 text-slate-400'
                          : 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                      }`}
                    >
                      <Bell className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-950">
                          {item.title}
                        </span>
                        {!item.is_read ? (
                          <Badge className="bg-blue-600 hover:bg-blue-600">
                            New
                          </Badge>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-slate-600">
                        {item.message}
                      </span>
                      <span className="mt-2 flex flex-wrap gap-3 text-xs font-medium text-slate-400">
                        <span>{label(type)}</span>
                        <span>{when(item.created_at)}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={limit}
              onChange={setPage}
              onLimitChange={value => {
                setLimit(value);
                setPage(1);
              }}
            />
          </>
        )}
      </Panel>
    </>
  );
}
