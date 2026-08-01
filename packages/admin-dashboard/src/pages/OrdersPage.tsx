import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminApi } from '@/api';
import { mediaUrl } from '@/lib/media';
import { formatAddress, label, money, when } from '@/lib/format';
import {
  Badge,
  Empty,
  ErrorAlert,
  Field,
  Modal,
  PageHeader,
  Pagination,
  Panel,
  FilterChip,
  SearchButton,
  SearchInput,
  SelectField,
  SuccessAlert,
  Toolbar,
  statusTone,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const paymentStatus = params.get('payment_status') || 'all';
  const payoutStatus = params.get('payout_status') || 'all';
  const fulfillmentStatus = params.get('fulfillment_status') || 'all';
  const missingShipping = params.get('missing_shipping') === 'true';
  const [search, setSearch] = useState(params.get('search') || '');
  const [appliedSearch, setAppliedSearch] = useState(
    params.get('search') || ''
  );
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [paymentStatusEdit, setPaymentStatusEdit] = useState('pending');
  const [fulfillmentStatusEdit, setFulfillmentStatusEdit] = useState('pending');
  const [payoutStatusEdit, setPayoutStatusEdit] = useState('pending');
  const [payoutReferenceEdit, setPayoutReferenceEdit] = useState('');
  const [trackingEdit, setTrackingEdit] = useState('');
  const [saving, setSaving] = useState(false);
  const [secondPlaceBusy, setSecondPlaceBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveOk, setSaveOk] = useState('');

  const openOrder = (order: any) => {
    setSelected(order);
    setPaymentStatusEdit(order.payment_status || 'pending');
    setFulfillmentStatusEdit(order.fulfillment_status || 'pending');
    setPayoutStatusEdit(order.payout_status || 'pending');
    setPayoutReferenceEdit(order.payout_reference || '');
    setTrackingEdit(order.tracking_number || '');
    setSaveError('');
    setSaveOk('');
  };

  const createSecondPlaceOffer = async () => {
    if (!selected) return;
    if (
      !window.confirm(
        `Offer order ${selected.order_number} to the second-place bidder?`
      )
    ) {
      return;
    }

    setSecondPlaceBusy(true);
    setSaveError('');
    setSaveOk('');
    try {
      const res = await adminApi.createSecondPlaceOffer(selected.id);
      const updated = (res as any).data?.order;
      if (updated) {
        setSelected({ ...selected, ...updated });
        setItems(prev =>
          prev.map(o => (o.id === selected.id ? { ...o, ...updated } : o))
        );
      }
      setSaveOk('Second-place offer sent');
    } catch (err: any) {
      setSaveError(err.message || 'Failed to create second-place offer');
    } finally {
      setSecondPlaceBusy(false);
    }
  };

  const saveOrder = async () => {
    if (!selected) return;
    setSaving(true);
    setSaveError('');
    setSaveOk('');
    try {
      const res = await adminApi.updateOrder(selected.id, {
        payment_status: paymentStatusEdit,
        fulfillment_status: fulfillmentStatusEdit,
        tracking_number: trackingEdit.trim() || null,
        payout_status: payoutStatusEdit,
        payout_reference: payoutReferenceEdit.trim() || null,
      });
      const updated = (res as any).data || {
        ...selected,
        payment_status: paymentStatusEdit,
        fulfillment_status: fulfillmentStatusEdit,
        tracking_number: trackingEdit.trim() || null,
        payout_status: payoutStatusEdit,
        payout_reference: payoutReferenceEdit.trim() || null,
      };
      setSelected({ ...selected, ...updated });
      setItems(prev =>
        prev.map(o => (o.id === selected.id ? { ...o, ...updated } : o))
      );
      setSaveOk('Order updated');
    } catch (err: any) {
      setSaveError(err.message || 'Failed to update order');
    } finally {
      setSaving(false);
    }
  };

  const query = useMemo(
    () => ({
      payment_status: paymentStatus,
      payout_status: payoutStatus,
      fulfillment_status: fulfillmentStatus,
      missing_shipping: missingShipping || undefined,
      search: appliedSearch,
      page,
      limit,
    }),
    [
      paymentStatus,
      payoutStatus,
      fulfillmentStatus,
      missingShipping,
      appliedSearch,
      page,
      limit,
    ]
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

  const patchParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === 'all' || value === 'false') next.delete(key);
    else next.set(key, value);
    setParams(next);
    setPage(1);
  };

  const showPayoutQueue = () => {
    const next = new URLSearchParams(params);
    next.set('payment_status', 'paid');
    next.set('fulfillment_status', 'delivered');
    next.set('payout_status', 'ready');
    setParams(next);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Orders"
        description="Payments, fulfillment, shipping, disputes, and seller payout release."
      />

      <ErrorAlert>{error}</ErrorAlert>

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <PayoutSummaryCard
          label="Payout queue"
          value={items.filter(o => o.payout_status === 'ready').length}
          detail="Ready on this page"
          accent="from-emerald-500/20 to-sky-500/10"
        />
        <PayoutSummaryCard
          label="Held payouts"
          value={items.filter(o => o.payout_status === 'held').length}
          detail="Needs review"
          accent="from-amber-500/20 to-orange-500/10"
        />
        <PayoutSummaryCard
          label="Paid payouts"
          value={items.filter(o => o.payout_status === 'paid').length}
          detail="Released to sellers"
          accent="from-violet-500/20 to-primary/10"
        />
        <PayoutSummaryCard
          label="Visible payout value"
          value={money(
            items.reduce(
              (sum, o) =>
                ['ready', 'held'].includes(o.payout_status)
                  ? sum + Number(o.seller_payout || 0)
                  : sum,
              0
            )
          )}
          detail="Ready + held"
          accent="from-slate-900/10 to-primary/10"
        />
      </div>

      <Toolbar>
        <SelectField
          value={paymentStatus}
          onValueChange={v => patchParam('payment_status', v)}
          options={[
            { value: 'all', label: 'All payments' },
            { value: 'pending', label: 'Pending payment' },
            { value: 'paid', label: 'Paid' },
            { value: 'refunded', label: 'Refunded' },
          ]}
        />
        <SelectField
          value={payoutStatus}
          onValueChange={v => patchParam('payout_status', v)}
          options={[
            { value: 'all', label: 'All payouts' },
            { value: 'pending', label: 'Payout pending' },
            { value: 'ready', label: 'Ready to pay' },
            { value: 'held', label: 'Held payout' },
            { value: 'paid', label: 'Paid payout' },
          ]}
        />
        <Button variant="secondary" onClick={showPayoutQueue}>
          Payout queue
        </Button>
        <SelectField
          value={fulfillmentStatus}
          onValueChange={v => patchParam('fulfillment_status', v)}
          options={[
            { value: 'all', label: 'All fulfillment' },
            { value: 'pending', label: 'Pending' },
            { value: 'processing', label: 'Processing' },
            { value: 'sent_to_backoffice', label: 'Sent to backoffice' },
            {
              value: 'received_by_backoffice',
              label: 'Received by backoffice',
            },
            { value: 'shipped', label: 'Shipped' },
            { value: 'delivered', label: 'Delivered' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
        />
        <FilterChip
          checked={missingShipping}
          onCheckedChange={checked =>
            patchParam('missing_shipping', checked ? 'true' : 'false')
          }
        >
          Missing shipping only
        </FilterChip>
        <SearchInput
          placeholder="Order #, buyer, seller, gadget…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
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
      </Toolbar>

      <Panel>
        {loading ? (
          <Empty>Loading orders…</Empty>
        ) : items.length === 0 ? (
          <Empty>No orders match these filters.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-primary/5 hover:bg-primary/5">
                <TableHead>Order</TableHead>
                <TableHead>Parties</TableHead>
                <TableHead>Money</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Shipping</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(o => (
                <TableRow
                  key={o.id}
                  className="cursor-pointer"
                  onClick={() => openOrder(o)}
                >
                  <TableCell>
                    <div className="font-medium text-primary">
                      {o.order_number}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {o.gadget_title || 'Gadget'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {when(o.created_at)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      Buyer: {o.buyer?.full_name || '—'}
                      <div className="text-sm text-muted-foreground">
                        {o.buyer?.phone_number}
                      </div>
                    </div>
                    <div className="mt-2">
                      Seller: {o.seller?.full_name || '—'}
                      <div className="text-sm text-muted-foreground">
                        {o.seller?.phone_number}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{money(o.total_amount)}</div>
                    <div className="text-sm text-muted-foreground">
                      Fee {money(o.platform_fee)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Payout {money(o.seller_payout)}
                    </div>
                    <div className="mt-1">
                      <Badge tone={statusTone(o.payout_status)}>
                        {label(o.payout_status || 'pending')} payout
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={statusTone(o.payment_status)}>
                        {label(o.payment_status)}
                      </Badge>
                      <Badge tone={statusTone(o.fulfillment_status)}>
                        {label(o.fulfillment_status)}
                      </Badge>
                    </div>
                    {o.open_dispute ? (
                      <div className="mt-2">
                        <Badge tone="danger">Open dispute</Badge>
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {o.has_shipping ? (
                      <div className="max-w-[220px] whitespace-pre-line text-sm line-clamp-4">
                        {formatAddress(o.shipping_address)}
                      </div>
                    ) : (
                      <Badge tone="danger">No address</Badge>
                    )}
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

      <Modal
        open={Boolean(selected)}
        title={selected ? `Order ${selected.order_number}` : 'Order'}
        onClose={() => setSelected(null)}
        wide
      >
        {selected ? (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              {selected.gadget_image ? (
                <img
                  className="aspect-square w-full rounded-lg object-cover ring-2 ring-primary/20"
                  src={mediaUrl(selected.gadget_image)}
                  alt=""
                />
              ) : (
                <div className="aspect-square w-full rounded-lg bg-gradient-to-br from-primary/20 to-sky-400/20" />
              )}
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Item</dt>
                  <dd className="font-medium">{selected.gadget_title}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    Total / fee / payout
                  </dt>
                  <dd className="font-medium">
                    {money(selected.total_amount)} ·{' '}
                    {money(selected.platform_fee)} ·{' '}
                    {money(selected.seller_payout)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Payout state</dt>
                  <dd className="font-medium">
                    <Badge tone={statusTone(selected.payout_status)}>
                      {label(selected.payout_status || 'pending')}
                    </Badge>
                    {selected.payout_reference ? (
                      <div className="mt-1 text-muted-foreground">
                        {selected.payout_reference}
                      </div>
                    ) : null}
                    {selected.payout_paid_at ? (
                      <div className="text-muted-foreground">
                        Paid {when(selected.payout_paid_at)}
                      </div>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Buyer</dt>
                  <dd className="font-medium">
                    {selected.buyer?.full_name}
                    <div className="text-muted-foreground">
                      {selected.buyer?.phone_number}
                    </div>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Seller</dt>
                  <dd className="font-medium">
                    {selected.seller?.full_name}
                    <div className="text-muted-foreground">
                      {selected.seller?.phone_number}
                    </div>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Shipping address</dt>
                  <dd className="whitespace-pre-line font-medium">
                    {selected.has_shipping
                      ? formatAddress(selected.shipping_address)
                      : 'Not provided'}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Update payment, fulfillment, payout state, or tracking.
                Delivered paid orders enter the payout queue; marking payout
                paid releases funds to the seller wallet.
              </p>
              <ErrorAlert>{saveError}</ErrorAlert>
              <SuccessAlert>{saveOk}</SuccessAlert>
              <Field label="Payment status">
                <SelectField
                  value={paymentStatusEdit}
                  onValueChange={setPaymentStatusEdit}
                  triggerClassName="w-full min-w-0"
                  options={[
                    { value: 'pending', label: 'Pending' },
                    { value: 'paid', label: 'Paid' },
                    { value: 'refunded', label: 'Refunded' },
                  ]}
                />
              </Field>
              <Field label="Fulfillment status">
                <SelectField
                  value={fulfillmentStatusEdit}
                  onValueChange={setFulfillmentStatusEdit}
                  triggerClassName="w-full min-w-0"
                  options={[
                    { value: 'pending', label: 'Pending' },
                    { value: 'processing', label: 'Processing' },
                    {
                      value: 'sent_to_backoffice',
                      label: 'Sent to backoffice',
                    },
                    {
                      value: 'received_by_backoffice',
                      label: 'Received by backoffice',
                    },
                    { value: 'shipped', label: 'Shipped' },
                    { value: 'delivered', label: 'Delivered' },
                    { value: 'cancelled', label: 'Cancelled' },
                  ]}
                />
              </Field>
              <Field label="Seller payout status">
                <SelectField
                  value={payoutStatusEdit}
                  onValueChange={setPayoutStatusEdit}
                  triggerClassName="w-full min-w-0"
                  options={[
                    { value: 'pending', label: 'Pending' },
                    { value: 'ready', label: 'Ready' },
                    { value: 'held', label: 'Held' },
                    { value: 'paid', label: 'Paid' },
                  ]}
                />
              </Field>
              <Field label="Payout reference">
                <Input
                  value={payoutReferenceEdit}
                  onChange={e => setPayoutReferenceEdit(e.target.value)}
                  placeholder="Transfer ref or admin note"
                />
              </Field>
              <Field label="Tracking number">
                <Input
                  value={trackingEdit}
                  onChange={e => setTrackingEdit(e.target.value)}
                  placeholder="Optional courier tracking #"
                />
              </Field>
              <Button disabled={saving} onClick={saveOrder}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
              {selected.payment_status === 'pending' &&
              selected.fulfillment_status === 'cancelled' ? (
                <Button
                  variant="outline"
                  disabled={secondPlaceBusy}
                  onClick={createSecondPlaceOffer}
                >
                  {secondPlaceBusy
                    ? 'Sending offer…'
                    : 'Offer to second-place bidder'}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function PayoutSummaryCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string | number;
  detail: string;
  accent: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-primary/10 bg-gradient-to-br ${accent} p-4 shadow-sm`}
    >
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}
