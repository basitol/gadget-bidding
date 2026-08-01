import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/api';
import { label, when } from '@/lib/format';
import {
  Empty,
  ErrorAlert,
  PageHeader,
  Pagination,
  Panel,
  Toolbar,
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
import { Badge } from '@/components/ui/badge';

export function AuditPage() {
  const [items, setItems] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetcher = useCallback(
    (params: { page: number; limit: number }) => adminApi.auditLogs(params),
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetcher({ page, limit });
      setItems(res.data || []);
      setTotal(res.pagination?.total || 0);
      setTotalPages(
        res.pagination?.totalPages || res.pagination?.total_pages || 1
      );
    } catch (err: any) {
      setError(err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }, [fetcher, page, limit]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Admin actions across listings, users, and disputes."
      />

      <ErrorAlert>{error}</ErrorAlert>

      <Toolbar>
        <Badge variant="secondary" className="bg-primary/15 text-primary">
          {total} events
        </Badge>
        <Button variant="secondary" onClick={load} disabled={loading}>
          Refresh
        </Button>
      </Toolbar>

      <Panel>
        {loading && items.length === 0 ? (
          <Empty>Loading audit log…</Empty>
        ) : items.length === 0 ? (
          <Empty>No audit events yet.</Empty>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="bg-primary/5 hover:bg-primary/5">
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Changes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(l => (
                  <TableRow key={l.id}>
                    <TableCell className="text-muted-foreground">
                      {when(l.created_at)}
                    </TableCell>
                    <TableCell>
                      <div>{l.actor?.full_name || 'System'}</div>
                      <div className="text-sm text-muted-foreground">
                        {l.actor?.phone_number}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-sky-500/15 text-sky-700 hover:bg-sky-500/15">
                        {label(l.action)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {label(l.resource_type)}
                      <br />
                      {l.resource_id?.slice(0, 8) || ''}
                    </TableCell>
                    <TableCell>
                      <pre className="max-w-xs overflow-x-auto rounded-md border border-primary/10 bg-primary/5 p-2 text-xs">
                        {l.changes ? JSON.stringify(l.changes, null, 2) : '—'}
                      </pre>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
          </>
        )}
      </Panel>
    </>
  );
}
