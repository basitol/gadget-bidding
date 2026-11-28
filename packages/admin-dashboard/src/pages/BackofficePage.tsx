import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi, type InspectionCheck, type OrderInspection } from '@/api';
import { SectionCard } from '@/components/attention';
import { Badge, ErrorAlert, PageHeader } from '@/components/shared';
import { Icon3d, type Icon3dName } from '@/components/shell/Icon3d';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { refreshQueues } from '@/hooks/useQueues';
import { formatAddress, friendlyTime, money } from '@/lib/format';
import { mediaUrl } from '@/lib/media';
import { TINTS, type Tint } from '@/lib/nav';
import { cn } from '@/lib/utils';

type QueueStatus = 'sent_to_backoffice' | 'received_by_backoffice' | 'shipped' | 'delivered';

type Queue = {
  status: QueueStatus;
  title: string;
  description: (checks: number) => string;
  icon: Icon3dName;
  tint: Tint;
  empty: string;
};

const queues: Queue[] = [
  {
    status: 'sent_to_backoffice',
    title: 'Seller sent to us',
    description: () => "The seller says it's on the way. Mark it received once it's at the hub.",
    icon: 'box',
    tint: 'amber',
    empty: 'Nothing on its way to the hub.',
  },
  {
    status: 'received_by_backoffice',
    title: 'At the hub',
    description: n => `Run the ${n || 7}-point check. It leaves the hub only when every check passes.`,
    icon: 'phonecheck',
    tint: 'blue',
    empty: 'Nothing waiting for the check.',
  },
  {
    status: 'shipped',
    title: 'Out for delivery',
    description: () => 'On its way to the buyer, or waiting at the hub for pickup.',
    icon: 'truck',
    tint: 'blue',
    empty: 'Nothing out for delivery.',
  },
  {
    status: 'delivered',
    title: 'Delivered',
    description: () => 'Delivered or collected. The payout follows once the buyer confirms.',
    icon: 'wallet',
    tint: 'green',
    empty: 'No deliveries yet.',
  },
];

const isPickup = (order: any) => order.delivery_method === 'pickup';

/** +2348030000000 → "0803 000 0000" */
/** A seller's staff member who can drop off and collect (seller app › Store staff). */
type StaffMember = { full_name: string; phone: string; id_type?: string | null; pickup_code?: string | null };
const STAFF_ID_LABEL: Record<string, string> = {
  nin_slip: 'NIN slip',
  drivers_licence: "Driver's licence",
  passport: 'Passport',
  voters_card: "Voter's card",
};

const localPhone = (p: string) =>
  p.startsWith('+234') ? `0${p.slice(4, 7)} ${p.slice(7, 10)} ${p.slice(10)}` : p;

/** Every check on the list was recorded and passed. */
const inspectionPassed = (inspection: OrderInspection | null | undefined, checks: InspectionCheck[]) =>
  !!inspection &&
  (checks.length ? checks : inspection.checks).every(c => inspection.checks.some(x => x.key === c.key && x.passed));

type Move = { label: string; next: QueueStatus; tracking?: boolean };

/** The next step for an order, or why there isn't one yet. */
const nextMove = (order: any, checks: InspectionCheck[]): Move | null => {
  switch (order.fulfillment_status as QueueStatus) {
    case 'sent_to_backoffice':
      return { label: 'Mark received at hub', next: 'received_by_backoffice' };
    case 'received_by_backoffice':
      if (!inspectionPassed(order.inspection, checks)) return null;
      return isPickup(order)
        ? { label: 'Mark ready to collect', next: 'shipped' }
        : { label: 'Ship to buyer', next: 'shipped', tracking: true };
    case 'shipped':
      return { label: isPickup(order) ? 'Mark collected' : 'Mark delivered', next: 'delivered' };
    default:
      return null;
  }
};

export function BackofficePage() {
  const [ordersByStatus, setOrdersByStatus] = useState<Record<string, any[]>>({});
  const [checks, setChecks] = useState<InspectionCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [params] = useSearchParams();
  const focusId = params.get('order');

  const load = useCallback(async () => {
    setError('');
    try {
      const results = await Promise.all(
        queues.map(queue =>
          adminApi.orders({ payment_status: 'paid', fulfillment_status: queue.status, page: 1, limit: 50 })
        )
      );
      setOrdersByStatus(
        queues.reduce<Record<string, any[]>>((next, queue, index) => {
          next[queue.status] = results[index]?.data || [];
          return next;
        }, {})
      );
    } catch (err: any) {
      setError(err.message || "Couldn't load the hub queues");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    adminApi
      .inspectionChecks()
      .then(r => setChecks(r.data))
      .catch(err => setError(err.message || "Couldn't load the hub checklist"));
  }, [load]);

  // Opened from Overview / Tasks: bring that order into view.
  useEffect(() => {
    if (!loading && focusId) document.getElementById(`order-${focusId}`)?.scrollIntoView({ block: 'center' });
  }, [loading, focusId]);

  const totals = useMemo(
    () =>
      queues.reduce<Record<string, number>>((next, queue) => {
        next[queue.status] = ordersByStatus[queue.status]?.length || 0;
        return next;
      }, {}),
    [ordersByStatus]
  );

  const move = async (order: any, step: Move, trackingNumber?: string) => {
    if (step.tracking && !trackingNumber?.trim()) {
      toast.error('Add the courier tracking number, then ship it.');
      return;
    }
    setBusyId(order.id);
    try {
      await adminApi.updateOrder(order.id, {
        fulfillment_status: step.next,
        ...(step.tracking ? { tracking_number: trackingNumber!.trim() } : {}),
      });
      await load();
      refreshQueues();
      toast.success(`${order.order_number} moved on`);
    } catch (err: any) {
      toast.error(err.message || "Couldn't update the order");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="pb-16">
      <PageHeader
        title="Inspection hub"
        description="Every item comes through our Computer Village hub. Receive it, check it against the listing, then send it to the buyer or hand it over at pickup."
        path="/backoffice"
        actions={
          <Button variant="secondary" onClick={load} disabled={loading}>
            <RefreshCcw className="size-4" />
            Refresh
          </Button>
        }
      />

      <ErrorAlert>{error}</ErrorAlert>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {queues.map(queue => (
          <div key={queue.status} className="gb-elev rounded-[24px] border border-white/80 bg-white/90 p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-[12px]" style={{ backgroundColor: TINTS[queue.tint].bg }}>
                <Icon3d name={queue.icon} size={26} />
              </span>
              <span className="text-[14px] font-medium text-slate">{queue.title}</span>
            </div>
            <div className="mt-3 text-[32px] font-medium leading-none tracking-[-0.02em] text-ink tabular-nums">
              {loading ? '–' : totals[queue.status] || 0}
            </div>
            <div className="mt-2 text-[13px] text-hint">Paid orders at this step</div>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        {queues.map(queue => {
          const orders = ordersByStatus[queue.status] || [];
          return (
            <SectionCard
              key={queue.status}
              icon={<Icon3d name={queue.icon} size={26} />}
              title={queue.title}
              meta={loading ? undefined : String(orders.length)}
            >
              <p className="px-6 pt-4 text-[13px] text-slate">{queue.description(checks.length)}</p>
              <div className="space-y-3 p-4">
                {loading ? (
                  <Skeleton className="h-40 rounded-[18px]" />
                ) : orders.length === 0 ? (
                  <p className="px-2 py-6 text-center text-[14px] text-slate">{queue.empty}</p>
                ) : (
                  orders.map(order => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      checks={checks}
                      focused={order.id === focusId}
                      busy={busyId === order.id}
                      onMove={(step, tracking) => move(order, step, tracking)}
                      onInspected={load}
                    />
                  ))
                )}
              </div>
            </SectionCard>
          );
        })}
      </div>
    </div>
  );
}

function OrderCard({
  order,
  checks,
  focused,
  busy,
  onMove,
  onInspected,
}: {
  order: any;
  checks: InspectionCheck[];
  focused: boolean;
  busy: boolean;
  onMove: (step: Move, tracking?: string) => void;
  onInspected: () => void;
}) {
  const [tracking, setTracking] = useState<string>(order.tracking_number || '');
  const trackingId = useId();
  const step = nextMove(order, checks);
  const pickup = isPickup(order);
  const atHub = order.fulfillment_status === 'received_by_backoffice';
  const onHold = !!order.open_dispute;

  return (
    <article
      id={`order-${order.id}`}
      className={cn('rounded-[18px] border border-line bg-white p-4', focused && 'ring-2 ring-blue-brand')}
    >
      <div className="flex gap-3">
        {order.gadget_image ? (
          <img
            src={mediaUrl(order.gadget_image)}
            alt=""
            className="size-14 shrink-0 rounded-[12px] bg-fill object-cover"
          />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-[12px] bg-fill">
            <Icon3d name="phonecheck" size={28} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium text-ink">{order.gadget_title || 'Gadget'}</div>
          <div className="truncate text-[13px] text-slate">{order.order_number}</div>
          <div className="text-[13px] text-hint">{friendlyTime(order.updated_at || order.created_at)}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge tone="ok">Paid</Badge>
        <Badge tone="neutral">{pickup ? 'Pickup at hub' : 'Delivery'}</Badge>
        {onHold ? <Badge tone="danger">Open dispute</Badge> : null}
      </div>

      <dl className="mt-3 divide-y divide-line text-[13px]">
        <Fact k="Seller">
          {order.seller?.full_name || '—'}
          {order.seller?.phone_number ? ` · ${order.seller.phone_number}` : ''}
        </Fact>
        <Fact k="Buyer">
          {order.buyer?.full_name || '—'}
          {order.buyer?.phone_number ? ` · ${order.buyer.phone_number}` : ''}
        </Fact>
        <Fact k="Payout">{money(order.seller_payout)}</Fact>
        {order.tracking_number && !step?.tracking ? <Fact k="Tracking">{order.tracking_number}</Fact> : null}
      </dl>

      {order.seller?.staff?.length ? (
        <div className="mt-3 rounded-[12px] bg-fill p-3 text-[13px]">
          <div className="font-medium text-ink">Can drop off and collect</div>
          <div className="text-hint">Check their ID and code before you hand anything over.</div>
          <ul className="mt-2 space-y-1.5 text-slate">
            {order.seller.staff.map((p: StaffMember) => (
              <li key={p.phone} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span>
                  {p.full_name} · {localPhone(p.phone)} · {STAFF_ID_LABEL[p.id_type ?? ''] ?? 'ID not given'}
                </span>
                {p.pickup_code ? (
                  <span className="font-medium tabular-nums text-ink">Code {p.pickup_code}</span>
                ) : (
                  <span className="text-hint">No code yet</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {pickup ? (
        <div className="mt-3 rounded-[12px] bg-fill p-3 text-[13px] text-ink">The buyer collects it at the hub.</div>
      ) : order.has_shipping ? (
        <div className="mt-3 rounded-[12px] bg-fill p-3 text-[13px]">
          <div className="font-medium text-ink">
            Deliver to{order.shipping_address?.label ? ` · ${order.shipping_address.label}` : ''}
          </div>
          <div className="mt-1 whitespace-pre-line text-slate">{formatAddress(order.shipping_address)}</div>
        </div>
      ) : (
        <div className="mt-3">
          <Badge tone="danger">No delivery address</Badge>
        </div>
      )}

      {atHub ? <InspectionPanel order={order} checks={checks} disabled={onHold} onSaved={onInspected} /> : null}

      {step ? (
        <div className="mt-4 space-y-3">
          {step.tracking ? (
            <div className="space-y-2">
              <Label htmlFor={trackingId}>Courier tracking number</Label>
              <Input
                id={trackingId}
                value={tracking}
                onChange={e => setTracking(e.target.value)}
                className="h-10 rounded-[12px]"
              />
            </div>
          ) : null}
          <Button
            className="h-10 w-full rounded-[10px]"
            disabled={busy || onHold || (!!step.tracking && !tracking.trim())}
            onClick={() => onMove(step, tracking)}
          >
            {busy ? 'Updating…' : step.label}
          </Button>
          {onHold ? (
            <p className="text-[13px] text-slate">On hold while the dispute is open.</p>
          ) : step.tracking && !tracking.trim() ? (
            <p className="text-[13px] text-slate">Add the tracking number to ship it.</p>
          ) : null}
        </div>
      ) : order.fulfillment_status === 'delivered' ? (
        <div className="mt-4 rounded-[12px] bg-[#EEF9F2] p-3 text-center text-[14px] font-medium text-[#2E9E5E]">
          {pickup ? 'Collected' : 'Delivered'}
        </div>
      ) : null}
    </article>
  );
}

function Fact({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5">
      <dt className="w-16 shrink-0 text-slate">{k}</dt>
      <dd className="min-w-0 flex-1 truncate text-ink">{children}</dd>
    </div>
  );
}

/** The 7-point hub check: tick what passed, add a note for anything that didn't, then save. */
function InspectionPanel({
  order,
  checks,
  disabled,
  onSaved,
}: {
  order: any;
  checks: InspectionCheck[];
  disabled: boolean;
  onSaved: () => void;
}) {
  const recorded: OrderInspection | null = order.inspection ?? null;
  const passed = inspectionPassed(recorded, checks);
  const [editing, setEditing] = useState(false);
  const [ticks, setTicks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries((recorded?.checks ?? []).map(c => [c.key, c.passed]))
  );
  const [note, setNote] = useState(recorded && !passed ? recorded.note ?? '' : '');
  const [busy, setBusy] = useState(false);
  const noteId = useId();

  const ticked = checks.filter(c => ticks[c.key]).length;
  const allTicked = checks.length > 0 && ticked === checks.length;
  const showForm = !recorded || editing;

  const save = async () => {
    setBusy(true);
    try {
      const res = await adminApi.recordInspection(order.id, {
        checks: Object.fromEntries(checks.map(c => [c.key, !!ticks[c.key]])),
        note: note.trim() || undefined,
      });
      toast.success(res.message || (res.data.all_passed ? 'Passed the hub check' : 'Check saved'));
      setEditing(false);
      onSaved();
      refreshQueues();
    } catch (err: any) {
      toast.error(err.message || "Couldn't save the check");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 border-t border-line pt-4">
      {recorded && !showForm ? <InspectionResult inspection={recorded} passed={passed} /> : null}

      {recorded && !showForm ? (
        <Button
          variant="ghost"
          className="mt-2 h-9 rounded-[10px] px-3 text-[14px] text-blue-press"
          disabled={disabled}
          onClick={() => setEditing(true)}
        >
          Check it again
        </Button>
      ) : null}

      {showForm ? (
        <>
          <fieldset disabled={disabled || busy}>
            <legend className="text-[13px] font-medium uppercase tracking-[0.04em] text-slate">
              Hub check · {ticked} of {checks.length}
            </legend>
            {checks.length === 0 ? (
              <Skeleton className="mt-2 h-40 rounded-[12px]" />
            ) : (
              <ul className="mt-2 divide-y divide-line rounded-[12px] border border-line">
                {checks.map(c => (
                  <li key={c.key}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-[14px] text-ink">
                      <Checkbox
                        checked={!!ticks[c.key]}
                        onCheckedChange={v => setTicks(t => ({ ...t, [c.key]: v === true }))}
                      />
                      <span>{c.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 space-y-2">
              <Label htmlFor={noteId}>{allTicked ? 'Note (optional)' : 'Note: what didn’t pass'}</Label>
              <Textarea
                id={noteId}
                value={note}
                maxLength={500}
                onChange={e => setNote(e.target.value)}
                className="min-h-[68px] rounded-[12px]"
              />
            </div>
          </fieldset>

          <div className="mt-3 space-y-2">
            {allTicked ? (
              <Button className="h-10 w-full rounded-[10px]" disabled={disabled || busy} onClick={save}>
                {busy ? 'Saving…' : 'Pass inspection'}
              </Button>
            ) : (
              <Button
                variant="outline"
                className="h-10 w-full rounded-[10px] border-[#D9536A] text-[#D9536A] hover:bg-[#FDF0F2] hover:text-[#D9536A]"
                disabled={disabled || busy || checks.length === 0 || !note.trim()}
                onClick={save}
              >
                {busy ? 'Saving…' : 'Record failed check'}
              </Button>
            )}
            {!allTicked && checks.length > 0 && !note.trim() ? (
              <p className="text-[13px] text-slate">
                Tick every check that passed. If one didn’t, add a note saying what, then record it.
              </p>
            ) : null}
            {recorded && editing ? (
              <Button
                variant="ghost"
                className="h-9 w-full rounded-[10px] text-[14px]"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                Keep the last result
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** A recorded check: score, what failed, the note, and who checked it when. */
function InspectionResult({ inspection, passed }: { inspection: OrderInspection; passed: boolean }) {
  const failed = inspection.checks.filter(c => !c.passed);
  return (
    <div className={cn('rounded-[12px] p-3', passed ? 'bg-[#EEF9F2]' : 'bg-[#FDF0F2]')}>
      <div className={cn('text-[14px] font-medium', passed ? 'text-[#2E9E5E]' : 'text-[#D9536A]')}>
        {passed ? 'Passed' : 'Didn’t pass'} · {inspection.passed} of {inspection.total} checks
      </div>
      {failed.length ? (
        <ul className="mt-1 list-disc pl-5 text-[13px] text-ink">
          {failed.map(c => (
            <li key={c.key}>{c.label}</li>
          ))}
        </ul>
      ) : null}
      {inspection.note ? <p className="mt-1 text-[13px] text-ink">“{inspection.note}”</p> : null}
      <p className="mt-1 text-[13px] text-slate">
        Checked{inspection.by?.name ? ` by ${inspection.by.name}` : ''} · {friendlyTime(inspection.at)}
      </p>
    </div>
  );
}
