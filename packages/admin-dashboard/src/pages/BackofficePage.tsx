import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  PackageCheck,
  PackageOpen,
  RefreshCcw,
  Truck,
} from 'lucide-react';
import { adminApi } from '@/api';
import {
  Badge,
  Empty,
  ErrorAlert,
  PageHeader,
  Panel,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatAddress, label, money, when } from '@/lib/format';
import { mediaUrl } from '@/lib/media';

type QueueStatus =
  | 'sent_to_backoffice'
  | 'received_by_backoffice'
  | 'shipped'
  | 'delivered';

type Queue = {
  status: QueueStatus;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  empty: string;
};

const queues: Queue[] = [
  {
    status: 'sent_to_backoffice',
    title: 'Seller sent to us',
    description: 'Items sellers have handed over or dispatched to backoffice.',
    icon: <PackageOpen className="size-5" />,
    color: 'text-amber-700 dark:text-amber-400',
    empty: 'No inbound seller deliveries.',
  },
  {
    status: 'received_by_backoffice',
    title: 'Ready to ship',
    description: 'Items received by backoffice and ready for buyer delivery.',
    icon: <PackageCheck className="size-5" />,
    color: 'text-sky-700 dark:text-sky-400',
    empty: 'No items waiting for shipping.',
  },
  {
    status: 'shipped',
    title: 'Out for delivery',
    description: 'Items shipped by backoffice to buyers.',
    icon: <Truck className="size-5" />,
    color: 'text-violet-700 dark:text-violet-400',
    empty: 'No active outbound deliveries.',
  },
  {
    status: 'delivered',
    title: 'Delivered',
    description: 'Completed deliveries now eligible for payout handling.',
    icon: <CheckCircle2 className="size-5" />,
    color: 'text-emerald-700 dark:text-emerald-400',
    empty: 'No delivered orders yet.',
  },
];

const nextAction: Partial<
  Record<
    QueueStatus,
    {
      label: string;
      nextStatus: QueueStatus;
      requiresTracking?: boolean;
    }
  >
> = {
  sent_to_backoffice: {
    label: 'Mark received',
    nextStatus: 'received_by_backoffice',
  },
  received_by_backoffice: {
    label: 'Ship to buyer',
    nextStatus: 'shipped',
    requiresTracking: true,
  },
  shipped: {
    label: 'Mark delivered',
    nextStatus: 'delivered',
  },
};

export function BackofficePage() {
  const [ordersByStatus, setOrdersByStatus] = useState<Record<string, any[]>>(
    {}
  );
  const [trackingByOrder, setTrackingByOrder] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const results = await Promise.all(
        queues.map(queue =>
          adminApi.orders({
            payment_status: 'paid',
            fulfillment_status: queue.status,
            page: 1,
            limit: 50,
          })
        )
      );

      setOrdersByStatus(
        queues.reduce<Record<string, any[]>>((next, queue, index) => {
          next[queue.status] = results[index]?.data || [];
          return next;
        }, {})
      );
    } catch (err: any) {
      setError(err.message || 'Failed to load backoffice queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(
    () =>
      queues.reduce<Record<string, number>>((next, queue) => {
        next[queue.status] = ordersByStatus[queue.status]?.length || 0;
        return next;
      }, {}),
    [ordersByStatus]
  );

  const updateFulfillment = async (order: any, queue: Queue) => {
    const action = nextAction[queue.status];
    if (!action) return;

    const trackingNumber = trackingByOrder[order.id]?.trim();
    if (action.requiresTracking && !trackingNumber) {
      setError('Add a tracking number before shipping to buyer.');
      return;
    }

    setBusyId(order.id);
    setError('');
    try {
      await adminApi.updateOrder(order.id, {
        fulfillment_status: action.nextStatus,
        ...(action.requiresTracking ? { tracking_number: trackingNumber } : {}),
      });
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to update order');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Backoffice intake"
        description="Track items from seller handoff to backoffice receipt, buyer shipping, delivery, and payout readiness."
        actions={
          <Button variant="secondary" onClick={load} disabled={loading}>
            <RefreshCcw className="size-4" />
            Refresh
          </Button>
        }
      />

      <ErrorAlert>{error}</ErrorAlert>

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        {queues.map(queue => (
          <div
            key={queue.status}
            className="rounded-xl border bg-card p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                {queue.title}
              </span>
              <span className={queue.color}>{queue.icon}</span>
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-tight">
              {totals[queue.status] || 0}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Paid orders in this stage
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        {queues.map(queue => {
          const orders = ordersByStatus[queue.status] || [];
          const action = nextAction[queue.status];

          return (
            <Panel key={queue.status} className="overflow-hidden">
              <div className="border-b bg-muted/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold tracking-tight">
                      {queue.title}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {queue.description}
                    </p>
                  </div>
                  <span
                    className={`grid size-10 shrink-0 place-items-center rounded-lg bg-background ${queue.color}`}
                  >
                    {queue.icon}
                  </span>
                </div>
              </div>

              <div className="space-y-3 p-3">
                {loading ? (
                  <Empty>Loading…</Empty>
                ) : orders.length === 0 ? (
                  <Empty>{queue.empty}</Empty>
                ) : (
                  orders.map(order => (
                    <BackofficeOrderCard
                      key={order.id}
                      order={order}
                      action={action}
                      busy={busyId === order.id}
                      trackingValue={
                        trackingByOrder[order.id] || order.tracking_number || ''
                      }
                      onTrackingChange={value =>
                        setTrackingByOrder(prev => ({
                          ...prev,
                          [order.id]: value,
                        }))
                      }
                      onAction={() => updateFulfillment(order, queue)}
                    />
                  ))
                )}
              </div>
            </Panel>
          );
        })}
      </div>
    </>
  );
}

function BackofficeOrderCard({
  order,
  action,
  busy,
  trackingValue,
  onTrackingChange,
  onAction,
}: {
  order: any;
  action?: {
    label: string;
    nextStatus: QueueStatus;
    requiresTracking?: boolean;
  };
  busy: boolean;
  trackingValue: string;
  onTrackingChange: (value: string) => void;
  onAction: () => void;
}) {
  return (
    <article className="rounded-2xl border bg-card p-3 shadow-sm">
      <div className="flex gap-3">
        {order.gadget_image ? (
          <img
            src={mediaUrl(order.gadget_image)}
            alt={order.gadget_title || 'Order item'}
            className="size-14 rounded-xl object-cover"
          />
        ) : (
          <div className="grid size-14 place-items-center rounded-xl bg-primary/10 text-primary">
            <PackageCheck className="size-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-primary">
            {order.order_number}
          </div>
          <div className="truncate text-sm font-medium">
            {order.gadget_title || 'Gadget'}
          </div>
          <div className="text-xs text-muted-foreground">
            {when(order.updated_at || order.created_at)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        <Badge tone="ok">{label(order.payment_status)}</Badge>
        <Badge tone="info">{label(order.fulfillment_status)}</Badge>
        {order.open_dispute ? <Badge tone="danger">Open Dispute</Badge> : null}
      </div>

      <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
        <div>
          <span className="font-medium text-foreground">Seller:</span>{' '}
          {order.seller?.full_name || '—'}
          {order.seller?.phone_number ? ` · ${order.seller.phone_number}` : ''}
        </div>
        <div>
          <span className="font-medium text-foreground">Buyer:</span>{' '}
          {order.buyer?.full_name || '—'}
          {order.buyer?.phone_number ? ` · ${order.buyer.phone_number}` : ''}
        </div>
        <div>
          <span className="font-medium text-foreground">Payout:</span>{' '}
          {money(order.seller_payout)}
        </div>
      </div>

      {order.has_shipping ? (
        <div className="mt-3 rounded-xl bg-muted/50 p-2 text-xs">
          <div className="mb-1 font-medium">Buyer delivery address</div>
          <div className="whitespace-pre-line text-muted-foreground">
            {formatAddress(order.shipping_address)}
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <Badge tone="danger">Missing Shipping Address</Badge>
        </div>
      )}

      {action?.requiresTracking ? (
        <Input
          className="mt-3"
          value={trackingValue}
          onChange={event => onTrackingChange(event.target.value)}
          placeholder="Courier tracking number"
        />
      ) : order.tracking_number ? (
        <div className="mt-3 rounded-xl bg-muted/50 p-2 text-xs">
          <span className="font-medium">Tracking:</span> {order.tracking_number}
        </div>
      ) : null}

      {action ? (
        <Button
          className="mt-3 w-full"
          disabled={busy || order.open_dispute}
          onClick={onAction}
        >
          {busy ? 'Updating…' : action.label}
        </Button>
      ) : (
        <div className="mt-3 rounded-xl bg-emerald-500/10 p-2 text-center text-sm font-medium text-emerald-700">
          Delivery complete
        </div>
      )}
    </article>
  );
}
