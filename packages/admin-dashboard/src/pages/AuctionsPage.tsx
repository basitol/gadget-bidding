import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/api';
import { mediaUrl } from '@/lib/media';
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

export function AuctionsPage() {
  const { confirm } = useConfirmDialog();
  const [status, setStatus] = useState('all');
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
    () => ({ status, search: appliedSearch, page, limit }),
    [status, appliedSearch, page, limit]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.auctions(query);
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

  const cancelAuction = async (auction: any) => {
    const hasBids = Number(auction.total_bids || 0) > 0;
    const msg = hasBids
      ? `Force-cancel "${auction.gadget?.title || 'this auction'}"? It has ${auction.total_bids} bid(s).`
      : `Cancel "${auction.gadget?.title || 'this auction'}"?`;
    if (
      !(await confirm({
        title: 'Cancel auction',
        description: msg,
        danger: true,
        confirmLabel: 'Cancel auction',
      }))
    )
      return;

    setBusyId(auction.id);
    setError('');
    try {
      await adminApi.cancelAuction(auction.id, hasBids);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel auction');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Auctions"
        description="Live, scheduled, and ended auctions across the marketplace."
      />

      <ErrorAlert>{error}</ErrorAlert>

      <Toolbar>
        <SelectField
          value={status}
          onValueChange={v => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'active', label: 'Active' },
            { value: 'scheduled', label: 'Scheduled' },
            { value: 'ended', label: 'Ended' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
        />
        <SearchInput
          placeholder="Gadget or seller…"
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
          <Empty>Loading auctions…</Empty>
        ) : items.length === 0 ? (
          <Empty>No auctions found.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Auction</TableHead>
                <TableHead>Seller / winner</TableHead>
                <TableHead>Pricing</TableHead>
                <TableHead>Timing</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(a => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {a.gadget?.image ? (
                        <img
                          className="size-14 rounded-lg object-cover ring-1 ring-border"
                          src={mediaUrl(a.gadget.image)}
                          alt=""
                        />
                      ) : (
                        <div className="size-14 rounded-lg bg-muted" />
                      )}
                      <div>
                        <div className="font-medium">
                          {a.gadget?.title || 'Auction'}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {a.total_bids} bids
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{a.seller?.full_name || '—'}</div>
                    <div className="text-sm text-muted-foreground">
                      {a.seller?.phone_number}
                    </div>
                    {a.winner ? (
                      <div className="mt-2">
                        Winner: {a.winner.full_name}
                        <div className="text-sm text-muted-foreground">
                          {a.winner.phone_number}
                        </div>
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-primary">
                      Current {money(a.current_price)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Start {money(a.starting_price)}
                    </div>
                    {a.buy_now_price ? (
                      <div className="text-sm text-muted-foreground">
                        Buy now {money(a.buy_now_price)}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {when(a.start_time)}
                    <br />→ {when(a.end_time)}
                  </TableCell>
                  <TableCell>
                    <Badge tone={statusTone(a.status)}>{label(a.status)}</Badge>
                    {a.order ? (
                      <div className="mt-1.5 text-sm text-muted-foreground">
                        Order {a.order.order_number}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {a.status === 'scheduled' || a.status === 'active' ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busyId === a.id}
                        onClick={() => cancelAuction(a)}
                      >
                        {busyId === a.id ? 'Cancelling…' : 'Cancel'}
                      </Button>
                    ) : null}
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
