import { useCallback, useEffect, useMemo, useState } from 'react';
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

export function PaymentsPage() {
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const query = useMemo(() => ({ status, page, limit }), [status, page, limit]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.payments(query);
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

  return (
    <>
      <PageHeader
        title="Payments"
        description="Gateway transactions for wallet top-ups and order payments."
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
            { value: 'success', label: 'Success' },
            { value: 'pending', label: 'Pending' },
            { value: 'failed', label: 'Failed' },
          ]}
        />
        <Button variant="secondary" onClick={load} disabled={loading}>
          Refresh
        </Button>
      </Toolbar>

      <Panel>
        {loading ? (
          <Empty>Loading payments…</Empty>
        ) : items.length === 0 ? (
          <Empty>No payment transactions found.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Reference</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Gateway</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(p => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium text-primary">
                      {p.reference || p.id.slice(0, 8)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {p.payment_method || '—'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{p.user?.full_name || '—'}</div>
                    <div className="text-sm text-muted-foreground">
                      {p.user?.phone_number}
                    </div>
                  </TableCell>
                  <TableCell>{p.gateway}</TableCell>
                  <TableCell className="font-medium">
                    {money(p.amount)}
                  </TableCell>
                  <TableCell>
                    <Badge tone={statusTone(p.status)}>{label(p.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {when(p.created_at)}
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
