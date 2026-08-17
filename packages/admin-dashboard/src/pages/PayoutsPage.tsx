import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/api';
import { label, money, when } from '@/lib/format';
import { useConfirmDialog } from '@/components/ConfirmDialogProvider';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function PayoutsPage() {
  const { confirm, prompt } = useConfirmDialog();
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
      setTotalPages(
        res.pagination?.totalPages || res.pagination?.total_pages || 1
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const updatePayout = async (
    order: any,
    payoutStatus: 'ready' | 'held' | 'paid'
  ) => {
    const reference =
      payoutStatus === 'paid'
        ? await prompt(
            'Payout reference',
            order.payout_reference || `MANUAL-${order.order_number}`,
            { title: 'Mark payout paid', required: true }
          )
        : order.payout_reference;

    if (payoutStatus === 'paid' && !reference) return;
    if (
      payoutStatus === 'held' &&
      !(await confirm({
        title: 'Hold payout',
        description: `Hold payout for ${order.seller?.full_name || 'seller'}?`,
      }))
    ) {
      return;
    }

    setBusyId(order.id);
    setError('');
    try {
      await adminApi.updateOrder(order.id, {
        payout_status: payoutStatus,
        payout_reference: reference || null,
      });
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to update payout');
    } finally {
      setBusyId(null);
    }
  };

  const summary = useMemo(() => {
    const amount = items.reduce(
      (sum, order) => sum + Number(order.seller_payout || 0),
      0
    );
    return {
      count: items.length,
      amount,
    };
  }, [items]);

  return (
    <>
      <PageHeader
        title="Payouts"
        description="Release seller earnings after orders are paid, delivered, and cleared."
      />

      <ErrorAlert>{error}</ErrorAlert>

      <div className="mb-4 rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm text-muted-foreground">Current queue</div>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight">
              {money(summary.amount)}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {summary.count} payout{summary.count === 1 ? '' : 's'} visible in
              this filter.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {['ready', 'held', 'paid'].map(item => (
              <Button
                key={item}
                variant={status === item ? 'default' : 'secondary'}
                onClick={() => {
                  setStatus(item);
                  setPage(1);
                }}
              >
                {item === 'ready' ? 'Ready' : item === 'held' ? 'Held' : 'Paid'}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <Toolbar>
        <SelectField
          value={status}
          onValueChange={value => {
            setStatus(value);
            setPage(1);
          }}
          options={[
            { value: 'ready', label: 'Ready payouts' },
            { value: 'held', label: 'Held payouts' },
            { value: 'paid', label: 'Paid payouts' },
          ]}
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
      </Toolbar>

      <Panel>
        {loading ? (
          <Empty>Loading payouts…</Empty>
        ) : items.length === 0 ? (
          <Empty>No payouts in this queue.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Order</TableHead>
                <TableHead>Seller</TableHead>
                <TableHead>Payout</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>When</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(order => (
                <TableRow key={order.id}>
                  <TableCell>
                    <div className="font-medium text-primary">
                      {order.order_number}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {order.gadget_title || 'Gadget'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{order.seller?.full_name || '—'}</div>
                    <div className="text-sm text-muted-foreground">
                      {order.seller?.phone_number}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-lg font-semibold">
                      {money(order.seller_payout)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Fee {money(order.platform_fee)} · Total{' '}
                      {money(order.total_amount)}
                    </div>
                    {order.payout_reference ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {order.payout_reference}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={statusTone(order.payout_status)}>
                        {label(order.payout_status)}
                      </Badge>
                      {order.open_dispute ? (
                        <Badge tone="danger">Open dispute</Badge>
                      ) : (
                        <Badge tone="ok">Clear</Badge>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {label(order.payment_status)} ·{' '}
                      {label(order.fulfillment_status)}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {order.payout_paid_at
                      ? `Paid ${when(order.payout_paid_at)}`
                      : when(order.updated_at || order.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-2">
                      {order.payout_status !== 'held' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === order.id}
                          onClick={() => updatePayout(order, 'held')}
                        >
                          Hold
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === order.id}
                          onClick={() => updatePayout(order, 'ready')}
                        >
                          Mark ready
                        </Button>
                      )}
                      {order.payout_status !== 'paid' ? (
                        <Button
                          size="sm"
                          disabled={busyId === order.id || order.open_dispute}
                          onClick={() => updatePayout(order, 'paid')}
                        >
                          Mark paid
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
