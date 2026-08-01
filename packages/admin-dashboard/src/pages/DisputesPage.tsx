import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminApi } from '@/api';
import { label, money, when } from '@/lib/format';
import {
  Badge,
  Empty,
  ErrorAlert,
  PageHeader,
  Pagination,
  Panel,
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

export function DisputesPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'all';
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useMemo(() => ({ status, page, limit }), [status, page, limit]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.disputes(query);
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

  const update = async (id: string, nextStatus: string) => {
    const resolution =
      nextStatus === 'resolved' || nextStatus === 'closed'
        ? window.prompt('Resolution notes', '') || undefined
        : undefined;
    setBusyId(id);
    try {
      await adminApi.updateDispute(id, { status: nextStatus, resolution });
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
        title="Disputes"
        description="Investigate buyer/seller conflicts and record resolutions."
      />

      <ErrorAlert>{error}</ErrorAlert>

      <Toolbar>
        <SelectField
          value={status}
          onValueChange={v => {
            const next = new URLSearchParams(params);
            next.set('status', v);
            setParams(next);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'All' },
            { value: 'open', label: 'Open' },
            { value: 'investigating', label: 'Investigating' },
            { value: 'resolved', label: 'Resolved' },
            { value: 'closed', label: 'Closed' },
          ]}
        />
        <Button variant="secondary" onClick={load} disabled={loading}>
          Refresh
        </Button>
      </Toolbar>

      <Panel>
        {loading ? (
          <Empty>Loading disputes…</Empty>
        ) : items.length === 0 ? (
          <Empty>No disputes in this queue.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-primary/5 hover:bg-primary/5">
                <TableHead>Dispute</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Raised by</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(d => (
                <TableRow key={d.id}>
                  <TableCell>
                    <div className="font-medium">{label(d.dispute_type)}</div>
                    <div className="max-w-sm text-sm text-muted-foreground">
                      {d.description}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {when(d.created_at)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-primary">
                      {d.order?.order_number || '—'}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {d.order ? money(d.order.total_amount) : ''}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{d.raised_by?.full_name || '—'}</div>
                    <div className="text-sm text-muted-foreground">
                      {d.raised_by?.phone_number}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge tone={statusTone(d.status)}>{label(d.status)}</Badge>
                    {d.resolution ? (
                      <div className="mt-1.5 text-sm text-muted-foreground">
                        {d.resolution}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === d.id}
                        onClick={() => update(d.id, 'investigating')}
                      >
                        Investigate
                      </Button>
                      <Button
                        size="sm"
                        disabled={busyId === d.id}
                        onClick={() => update(d.id, 'resolved')}
                      >
                        Resolve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busyId === d.id}
                        onClick={() => update(d.id, 'closed')}
                      >
                        Close
                      </Button>
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
