import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { adminApi, sellerPayoutsApi, type SellerPayoutFilter, type SellerPayoutRow } from '@/api';
import { SectionCard } from '@/components/attention';
import { PageLoadError, usePageStatus } from '@/components/states';
import { useConfirmDialog } from '@/components/ConfirmDialogProvider';
import { Icon3d, type Icon3dName } from '@/components/shell/Icon3d';
import {
  Badge,
  Empty,
  ErrorAlert,
  PageHeader,
  Pagination,
  Panel,
  SearchButton,
  SearchInput,
  SelectField,
  Toolbar,
  statusTone,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { refreshQueues } from '@/hooks/useQueues';
import { dueLabel, friendlyTime, label, money } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Payouts: the 6 pm seller payouts (one transfer per seller for the orders ready by then) and,
 * under "Order escrow", the per-order view for holding or releasing an order before the run.
 */

type Tab = 'sending' | 'paid' | 'failed' | 'escrow';

const TABS: { key: Tab; label: string }[] = [
  { key: 'sending', label: 'To send' },
  { key: 'paid', label: 'Paid' },
  { key: 'failed', label: "Didn't go through" },
  { key: 'escrow', label: 'Order escrow' },
];

/** Status chips: tint + dark text. */
const STATUS_CHIP: Record<SellerPayoutRow['status'], { label: string; className: string }> = {
  sending: { label: 'Sending', className: 'bg-[#F1F5FF] text-[#3E6AF0]' },
  paid: { label: 'Paid', className: 'bg-[#EEF9F2] text-[#2E9E5E]' },
  failed: { label: "Didn't go through", className: 'bg-[#FDF0F2] text-[#D9536A]' },
};

/** "Today, 6:00 pm" / "Tomorrow, 6:00 pm" / "Nov 29, 6:00 pm" */
function runLabel(iso: string) {
  const d = dueLabel(iso);
  const time = new Date(iso)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' })
    .toLowerCase();
  if (d.text === 'Today' || d.text === 'Tomorrow') return `${d.text}, ${time}`;
  return friendlyTime(iso).replace(' · ', ', ');
}

export function PayoutsPage() {
  const [tab, setTab] = useState<Tab>('sending');
  const [counts, setCounts] = useState<Record<'sending' | 'paid' | 'failed', number> | null>(null);
  const [meta, setMeta] = useState<{ sending_amount: number; automatic: boolean; next_run_at: string } | null>(null);
  /** The first load failed: nothing to show yet, so the whole page becomes the error. */
  const [failure, setFailure] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  usePageStatus(!counts && !failure && tab !== 'escrow' ? 'Loading' : null);

  if (failure && !counts) {
    return (
      <div className="pb-16 pt-1">
        <PageLoadError
          area="PAY"
          title="We couldn’t load payouts"
          reassurance="No money has moved — nothing was paid twice."
          error={failure}
          onRetry={() => {
            setFailure(null);
            setAttempt(a => a + 1);
          }}
        />
      </div>
    );
  }

  return (
    <div className="pb-16">
      <PageHeader
        title="Payouts"
        description="Sellers are paid at 6:00 pm each day: one transfer per seller for the orders that were ready by then. The platform fee is already taken off."
        path="/payouts"
      />

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <Stat
          icon="wallet"
          label={meta?.automatic ? 'Sending now' : 'To send by hand'}
          value={meta ? money(meta.sending_amount) : '—'}
          caption={
            counts
              ? `${counts.sending} payout${counts.sending === 1 ? '' : 's'} ${meta?.automatic ? 'with Paystack' : 'waiting for our team'}`
              : 'Loading…'
          }
        />
        <Stat
          icon="bell"
          label="Next run"
          value={meta ? runLabel(meta.next_run_at) : '—'}
          caption={meta?.automatic ? 'Paystack sends each payout by itself' : 'Payouts aren’t automatic yet: send each one, then mark it paid'}
        />
        <Stat
          icon="shield"
          label="Didn't go through"
          value={counts ? String(counts.failed) : '—'}
          caption="Their orders go in the next 6 pm payout"
        />
      </div>

      <div role="tablist" aria-label="Payouts" className="mb-4 flex flex-wrap gap-2">
        {TABS.map(t => {
          const n = t.key !== 'escrow' && counts ? counts[t.key] : null;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'h-9 rounded-full px-4 text-[14px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-blue-brand',
                tab === t.key ? 'bg-ink text-white' : 'bg-white text-slate ring-1 ring-line hover:text-ink'
              )}
            >
              {t.label}
              {n ? <span className={cn('ml-1.5 tabular-nums', tab === t.key ? 'text-white/70' : 'text-hint')}>{n}</span> : null}
            </button>
          );
        })}
      </div>

      {tab === 'escrow' ? (
        <OrderEscrow />
      ) : (
        <SellerPayouts
          key={`${tab}:${attempt}`}
          status={tab}
          onMeta={(c, m) => {
            setCounts(c);
            setMeta(m);
          }}
          onFailure={setFailure}
        />
      )}
    </div>
  );
}

function Stat({ icon, label: title, value, caption }: { icon: Icon3dName; label: string; value: string; caption: string }) {
  return (
    <div className="gb-elev flex flex-col rounded-[20px] border border-white/80 bg-white p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid size-10 place-items-center rounded-[12px] bg-fill">
          <Icon3d name={icon} size={26} />
        </span>
        <span className="text-[14px] font-medium text-slate">{title}</span>
      </div>
      <div className="mt-4 text-[26px] font-medium leading-none tracking-[-0.02em] text-ink tabular-nums">{value}</div>
      <div className="mt-2 text-[13px] text-slate">{caption}</div>
    </div>
  );
}

/* ---------------- Seller payouts (batches) ---------------- */

function SellerPayouts({
  status,
  onMeta,
  onFailure,
}: {
  status: SellerPayoutFilter;
  /** The first load failed (later refreshes that fail keep what's on screen and show a note). */
  onFailure?: (error: unknown) => void;
  onMeta: (
    counts: Record<'sending' | 'paid' | 'failed', number>,
    meta: { sending_amount: number; automatic: boolean; next_run_at: string }
  ) => void;
}) {
  const [rows, setRows] = useState<SellerPayoutRow[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 20;
  const loaded = useRef(false);

  const load = useCallback(() => {
    setError('');
    sellerPayoutsApi
      .list({ status, search: applied, page, limit })
      .then(r => {
        loaded.current = true;
        setRows(r.data);
        setTotal(r.pagination.total);
        setTotalPages(r.pagination.totalPages || 1);
        onMeta(r.counts, { sending_amount: r.sending_amount, automatic: r.automatic, next_run_at: r.next_run_at });
      })
      .catch(err => {
        if (!loaded.current && onFailure) return onFailure(err);
        setRows(prev => prev ?? []);
        setError(err.message || "Couldn't load payouts");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, applied, page]);

  useEffect(() => {
    load();
  }, [load]);

  const title = status === 'sending' ? 'To send' : status === 'paid' ? 'Paid' : "Didn't go through";

  return (
    <>
      <ErrorAlert>{error}</ErrorAlert>
      <Toolbar>
        <SearchInput
          placeholder="PO-…, order GV-…, seller or account name"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              setApplied(search);
              setPage(1);
            }
          }}
        />
        <SearchButton
          onClick={() => {
            setApplied(search);
            setPage(1);
          }}
        />
        <Button variant="secondary" onClick={load}>
          Refresh
        </Button>
      </Toolbar>
      <SectionCard icon={<Icon3d name="wallet" size={24} />} title={title} meta={rows ? `${total}` : undefined}>
        {rows === null ? (
          <Skeleton className="m-6 h-40" />
        ) : rows.length === 0 ? (
          <p className="px-6 py-8 text-[15px] text-slate">
            {status === 'sending'
              ? 'Nothing to send. The next payouts are made at 6:00 pm.'
              : status === 'failed'
                ? 'No payouts failed.'
                : 'No payouts yet.'}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map(r => (
              <PayoutItem
                key={r.id}
                p={r}
                onDone={() => {
                  load();
                  refreshQueues();
                }}
              />
            ))}
          </ul>
        )}
        {rows && total > limit ? (
          <div className="px-6 pb-4">
            <Pagination page={page} totalPages={totalPages} total={total} limit={limit} onChange={setPage} />
          </div>
        ) : null}
      </SectionCard>
    </>
  );
}

function PayoutItem({ p, onDone }: { p: SellerPayoutRow; onDone: () => void }) {
  const { prompt } = useConfirmDialog();
  const [busy, setBusy] = useState<'paid' | 'failed' | null>(null);
  const chip = STATUS_CHIP[p.status];
  const account = [p.bank_name, p.account_last4 ? `••••${p.account_last4}` : null].filter(Boolean).join(' ');
  const cases = p.orders.filter(o => o.open_case).length;
  const withPaystack = p.status === 'sending' && (p.transfer_state === 'starting' || p.transfer_state === 'sent');

  const markPaid = async () => {
    const ref = await prompt('Bank reference', '', {
      title: `Mark ${p.reference} paid?`,
      description: `Send ${money(p.amount)} to ${account} (${p.account_name ?? 'no name'}) first. Then enter the bank's reference for that transfer. The seller is told it's paid.`,
      placeholder: 'e.g. 000013251127180512345678',
      confirmLabel: 'Mark paid',
      required: true,
    });
    if (!ref?.trim()) return;
    setBusy('paid');
    try {
      await sellerPayoutsApi.markPaid(p.id, ref);
      toast.success(`${p.reference} marked paid`);
      onDone();
    } catch (err: any) {
      toast.error(err.message || "Couldn't mark it paid");
    } finally {
      setBusy(null);
    }
  };

  const markFailed = async () => {
    const reason = await prompt('What happened', '', {
      title: `Mark ${p.reference} as not gone through?`,
      description: 'Its orders go back to ready and go out in the next 6 pm payout. The seller is told it didn’t go through.',
      placeholder: 'e.g. The bank turned the account down',
      confirmLabel: 'Mark failed',
      required: true,
    });
    if (!reason?.trim()) return;
    setBusy('failed');
    try {
      await sellerPayoutsApi.markFailed(p.id, reason);
      toast.success(`${p.reference} marked as not gone through`);
      onDone();
    } catch (err: any) {
      toast.error(err.message || "Couldn't mark it failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-start md:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded-[8px] px-2 py-0.5 text-[13px] font-medium', chip.className)}>{chip.label}</span>
          <span className="text-[14px] font-medium text-ink tabular-nums">{p.reference}</span>
          <span className="text-[13px] text-hint">
            {p.status === 'paid' && p.paid_at ? `Paid ${friendlyTime(p.paid_at)}` : `6 pm run · ${friendlyTime(p.scheduled_for)}`}
          </span>
          {cases ? (
            <span className="rounded-[8px] bg-[#FDF0F2] px-2 py-0.5 text-[13px] font-medium text-[#D9536A]">
              {cases === 1 ? 'An order has an open case' : `${cases} orders have open cases`}
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 text-[15px] font-medium text-ink">
          {p.seller.business_name || p.seller.name} <span className="font-normal text-slate">· {p.seller.code}</span>
        </p>
        <dl className="mt-2 grid gap-x-6 gap-y-1 text-[14px] sm:grid-cols-[auto_1fr]">
          <dt className="text-slate">Pay to</dt>
          <dd className="text-ink">
            {account || '—'}
            {p.account_name ? <span className="text-slate"> · {p.account_name}</span> : null}
          </dd>
          {p.seller.email || p.seller.phone ? (
            <>
              <dt className="text-slate">Seller</dt>
              <dd className="text-ink">{[p.seller.email, p.seller.phone].filter(Boolean).join(' · ')}</dd>
            </>
          ) : null}
          {p.status === 'paid' ? (
            <>
              <dt className="text-slate">{p.bank_reference ? 'Bank reference' : 'Paystack'}</dt>
              <dd className="text-ink">
                {p.bank_reference || p.transfer_code || '—'}
                {p.marked_by ? <span className="text-slate"> · marked by {p.marked_by.name}</span> : null}
              </dd>
            </>
          ) : null}
          {p.status === 'failed' ? (
            <>
              <dt className="text-slate">Why</dt>
              <dd className="text-[#D9536A]">
                {p.failure_reason || '—'}
                {p.marked_by ? <span className="text-slate"> · marked by {p.marked_by.name}</span> : null}
              </dd>
            </>
          ) : null}
        </dl>
        {p.orders.length ? (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Orders in this payout">
            {p.orders.map(o => (
              <li
                key={o.id}
                className={cn(
                  'rounded-[8px] px-2 py-1 text-[13px]',
                  o.open_case ? 'bg-[#FDF0F2] text-[#D9536A]' : 'bg-fill text-ink'
                )}
                title={o.title ?? undefined}
              >
                <span className="font-medium">{o.order_number}</span> · {money(o.amount)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[13px] text-slate">
            {p.order_count} order{p.order_count === 1 ? '' : 's'} · back to ready for the next 6 pm payout
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-start gap-3 md:items-end">
        <div className="text-right">
          <div className="text-[26px] font-medium leading-none tracking-[-0.02em] text-ink tabular-nums">{money(p.amount)}</div>
          <div className="mt-1 text-[13px] text-slate">
            {p.order_count} order{p.order_count === 1 ? '' : 's'}
          </div>
        </div>
        {p.status === 'sending' ? (
          withPaystack ? (
            <p className="max-w-[240px] text-[13px] text-slate md:text-right">
              Paystack is sending this. It updates by itself when the bank answers.
            </p>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="border-[#D9536A] text-[#D9536A] hover:bg-[#FDF0F2] hover:text-[#D9536A]"
                disabled={!!busy}
                onClick={markFailed}
              >
                {busy === 'failed' ? 'Saving…' : 'Mark failed'}
              </Button>
              <Button disabled={!!busy} onClick={markPaid}>
                {busy === 'paid' ? 'Saving…' : 'Mark paid'}
              </Button>
            </div>
          )
        ) : null}
      </div>
    </li>
  );
}

/* ---------------- Order escrow (per order) ---------------- */

const ESCROW_FILTERS = [
  { value: 'ready', label: 'Ready for the 6 pm run' },
  { value: 'held', label: 'Held' },
  { value: 'sending', label: 'In a payout' },
  { value: 'paid', label: 'Paid out' },
];

/** Paid, delivered orders by payout state. Hold one to keep it out of the next run. */
function OrderEscrow() {
  const { confirm } = useConfirmDialog();
  const [status, setStatus] = useState('ready');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      payment_status: 'paid',
      fulfillment_status: 'delivered',
      payout_status: status,
      search: appliedSearch,
      page,
      limit,
    }),
    [status, appliedSearch, page, limit]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.orders(query);
      setItems(res.data || []);
      setTotal(res.pagination?.total || 0);
      setTotalPages(res.pagination?.totalPages || res.pagination?.total_pages || 1);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const setPayout = async (order: any, next: 'ready' | 'held') => {
    if (
      next === 'held' &&
      !(await confirm({
        title: `Hold the payout for ${order.order_number}?`,
        description: 'It stays out of the 6 pm payouts until you release it.',
        confirmLabel: 'Hold payout',
        danger: true,
      }))
    ) {
      return;
    }
    setBusyId(order.id);
    try {
      await adminApi.updateOrder(order.id, { payout_status: next });
      await load();
      refreshQueues();
      toast.success(next === 'held' ? 'Payout held' : 'Released for the next 6 pm payout');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update payout');
    } finally {
      setBusyId(null);
    }
  };

  const amount = items.reduce((sum, o) => sum + Number(o.seller_payout || 0), 0);

  return (
    <>
      <ErrorAlert>{error}</ErrorAlert>
      <Toolbar>
        <SelectField
          value={status}
          onValueChange={value => {
            setStatus(value);
            setPage(1);
          }}
          options={ESCROW_FILTERS}
        />
        <SearchInput
          placeholder="Order #, seller, buyer, gadget…"
          value={search}
          onChange={event => setSearch(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              setAppliedSearch(search);
              setPage(1);
            }
          }}
        />
        <SearchButton
          disabled={loading}
          onClick={() => {
            setAppliedSearch(search);
            setPage(1);
          }}
        />
        <Button variant="secondary" onClick={load} disabled={loading}>
          Refresh
        </Button>
        <span className="ml-auto text-[14px] text-slate">
          {items.length} shown · <span className="font-medium text-ink tabular-nums">{money(amount)}</span>
        </span>
      </Toolbar>

      <Panel>
        {loading ? (
          <Empty>Loading orders…</Empty>
        ) : items.length === 0 ? (
          <Empty>No orders here.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Order</TableHead>
                <TableHead>Seller</TableHead>
                <TableHead>Payout</TableHead>
                <TableHead>State</TableHead>
                <TableHead>When</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(order => (
                <TableRow key={order.id}>
                  <TableCell>
                    <div className="font-medium text-primary">{order.order_number}</div>
                    <div className="text-sm text-muted-foreground">{order.gadget_title || 'Gadget'}</div>
                  </TableCell>
                  <TableCell>
                    <div>{order.seller?.full_name || '—'}</div>
                    <div className="text-sm text-muted-foreground">{order.seller?.phone_number}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-lg font-semibold tabular-nums">{money(order.seller_payout)}</div>
                    <div className="text-sm text-muted-foreground">
                      Fee {money(order.platform_fee)} · Total {money(order.total_amount)}
                    </div>
                    {order.payout_reference ? (
                      <div className="mt-1 text-xs text-muted-foreground">{order.payout_reference}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={order.payout_status === 'sending' ? 'info' : statusTone(order.payout_status)}>
                        {order.payout_status === 'sending' ? 'In a payout' : label(order.payout_status)}
                      </Badge>
                      {order.open_dispute ? <Badge tone="danger">Open case</Badge> : <Badge tone="ok">Clear</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {order.payout_paid_at ? `Paid ${friendlyTime(order.payout_paid_at)}` : friendlyTime(order.updated_at || order.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-2">
                      {order.payout_status === 'ready' ? (
                        <Button size="sm" variant="outline" disabled={busyId === order.id} onClick={() => setPayout(order, 'held')}>
                          Hold
                        </Button>
                      ) : order.payout_status === 'held' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === order.id || order.open_dispute}
                          title={order.open_dispute ? 'Close the case first' : undefined}
                          onClick={() => setPayout(order, 'ready')}
                        >
                          Release
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
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
      </Panel>
    </>
  );
}
