import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { connectAdminSocket } from '@/lib/socket';
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
import { toast } from 'sonner';

export function AuctionsPage() {
  const { confirm } = useConfirmDialog();
  const [status, setStatus] = useState('all');
  // ?search= lets other pages (Listing reports) link straight to one listing.
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [appliedSearch, setAppliedSearch] = useState(params.get('search') ?? '');
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

  // Live auctions on this page: update price/bids in place and flash the row.
  const [flash, setFlash] = useState<Record<string, number>>({});
  const liveIds = useMemo(
    () => items.filter(a => a.status === 'active').map(a => a.id as string),
    [items]
  );
  useEffect(() => {
    if (liveIds.length === 0) return;
    const socket = connectAdminSocket();
    if (!socket) return;

    const join = () => liveIds.forEach(id => socket.emit('auction:join', id));
    if (socket.connected) join();
    socket.on('connect', join);

    const onBid = (data: {
      bid?: { auction_id?: string };
      currentPrice?: number;
      totalBids?: number;
    }) => {
      const id = data.bid?.auction_id;
      if (!id || !liveIds.includes(id)) return;
      setItems(prev =>
        prev.map(a =>
          a.id === id
            ? {
                ...a,
                current_price: data.currentPrice ?? a.current_price,
                total_bids: data.totalBids || Number(a.total_bids || 0) + 1,
              }
            : a
        )
      );
      setFlash(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
    };
    socket.on('bid:placed', onBid);

    return () => {
      socket.off('connect', join);
      socket.off('bid:placed', onBid);
      liveIds.forEach(id => socket.emit('auction:leave', id));
    };
  }, [liveIds]);

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
      toast.success('Auction cancelled');
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel auction');
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
                <TableRow
                  key={`${a.id}:${flash[a.id] || 0}`}
                  className={flash[a.id] ? 'gb-row-flash' : undefined}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {a.gadget?.image ? (
                        <img
                          className="size-14 rounded-lg object-cover ring-1 ring-border"
                          src={mediaUrl(a.gadget.image)}
                          alt={a.gadget?.title || 'Auction item photo'}
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
