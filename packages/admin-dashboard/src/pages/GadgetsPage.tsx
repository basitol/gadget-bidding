import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getOrderedSpecEntries } from '@gadget-bidding/shared';
import { adminApi } from '@/api';
import { mediaUrl } from '@/lib/media';
import { label, when } from '@/lib/format';
import {
  Badge,
  Empty,
  ErrorAlert,
  Modal,
  PageHeader,
  Pagination,
  Panel,
  SearchButton,
  SearchInput,
  StatusTabs,
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

const STATUSES = ['pending', 'approved', 'rejected', 'listed', 'sold', 'all'];

export function GadgetsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'pending';
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);

  const query = useMemo(
    () => ({ status, search: appliedSearch, page, limit }),
    [status, appliedSearch, page, limit]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.gadgets(query);
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

  const setStatus = (value: string) => {
    const next = new URLSearchParams(params);
    next.set('status', value);
    setParams(next);
    setPage(1);
  };

  const approve = async (id: string) => {
    setBusyId(id);
    try {
      await adminApi.approveGadget(id);
      setSelected(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: string) => {
    const reason = window.prompt(
      'Rejection reason',
      'Does not meet guidelines'
    );
    if (!reason) return;
    setBusyId(id);
    try {
      await adminApi.rejectGadget(id, reason);
      setSelected(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Gadgets"
        description="Moderate seller listings before they go to auction."
      />

      <ErrorAlert>{error}</ErrorAlert>

      <Toolbar>
        <StatusTabs value={status} onValueChange={setStatus} items={STATUSES} />
        <SearchInput
          placeholder="Search title, brand, seller…"
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
            load();
          }}
        />
      </Toolbar>

      <Panel>
        {loading ? (
          <Empty>Loading gadgets…</Empty>
        ) : items.length === 0 ? (
          <Empty>No gadgets match these filters.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-primary/5 hover:bg-primary/5">
                <TableHead>Listing</TableHead>
                <TableHead>Seller</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(g => (
                <TableRow key={g.id}>
                  <TableCell>
                    <Button
                      variant="ghost"
                      className="h-auto justify-start gap-3 px-0 py-1"
                      onClick={() => setSelected(g)}
                    >
                      {g.images?.[0] ? (
                        <img
                          className="size-14 rounded-lg object-cover ring-2 ring-primary/15"
                          src={mediaUrl(g.images[0])}
                          alt=""
                        />
                      ) : (
                        <div className="size-14 rounded-lg bg-gradient-to-br from-primary/30 to-violet-400/30" />
                      )}
                      <div className="text-left">
                        <div className="font-medium">{g.title}</div>
                        <div className="text-sm font-normal text-muted-foreground">
                          {[g.brand, g.model, g.condition, g.category_name]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>
                    </Button>
                  </TableCell>
                  <TableCell>
                    <div>{g.seller?.full_name || '—'}</div>
                    <div className="text-sm text-muted-foreground">
                      {g.seller?.phone_number}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge tone={statusTone(g.status)}>{label(g.status)}</Badge>
                    {g.auction ? (
                      <div className="mt-1.5 text-sm text-muted-foreground">
                        Auction: {label(g.auction.status)}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {when(g.created_at)}
                  </TableCell>
                  <TableCell>
                    {g.status === 'pending' ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={busyId === g.id}
                          onClick={() => approve(g.id)}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busyId === g.id}
                          onClick={() => reject(g.id)}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelected(g)}
                      >
                        View
                      </Button>
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
        title={selected?.title || 'Gadget'}
        onClose={() => setSelected(null)}
        wide
      >
        {selected ? (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="grid grid-cols-2 gap-2">
              {(selected.images?.length ? selected.images : [null]).map(
                (src: string | null, i: number) =>
                  src ? (
                    <img
                      key={i}
                      src={mediaUrl(src)}
                      alt=""
                      className="aspect-square w-full rounded-lg object-cover ring-2 ring-primary/15"
                    />
                  ) : (
                    <div
                      key={i}
                      className="aspect-square w-full rounded-lg bg-gradient-to-br from-primary/25 to-violet-400/25"
                    />
                  )
              )}
            </div>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge tone={statusTone(selected.status)}>
                  {label(selected.status)}
                </Badge>
                {selected.category_name ? (
                  <Badge tone="info">{selected.category_name}</Badge>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                {selected.description}
              </p>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Brand / model</dt>
                  <dd className="font-medium">
                    {[selected.brand, selected.model]
                      .filter(Boolean)
                      .join(' ') || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Condition</dt>
                  <dd className="font-medium">{selected.condition || '—'}</dd>
                </div>
                {getOrderedSpecEntries(selected.specifications).map(entry => (
                  <div key={entry.key}>
                    <dt className="text-muted-foreground">{entry.label}</dt>
                    <dd className="font-medium">{entry.value}</dd>
                  </div>
                ))}
                <div>
                  <dt className="text-muted-foreground">Seller</dt>
                  <dd className="font-medium">
                    {selected.seller?.full_name}
                    <div className="text-muted-foreground">
                      {selected.seller?.phone_number}
                    </div>
                  </dd>
                </div>
                {selected.rejection_reason ? (
                  <div>
                    <dt className="text-muted-foreground">Rejection reason</dt>
                    <dd className="font-medium">{selected.rejection_reason}</dd>
                  </div>
                ) : null}
              </dl>
              {selected.status === 'pending' ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busyId === selected.id}
                    onClick={() => approve(selected.id)}
                  >
                    Approve listing
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={busyId === selected.id}
                    onClick={() => reject(selected.id)}
                  >
                    Reject
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
