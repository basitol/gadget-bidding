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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const ACTION_ANY = '__any__';

const KNOWN_ACTIONS = [
  'admin_mutation_attempt',
  'gadget_approve',
  'gadget_reject',
  'order_update',
  'auction_cancel',
  'user_update',
  'user_reactivate_after_penalty',
  'second_place_offer',
  'dispute_update',
  'support_reply',
  'support_close',
  'seller_kyb_approve',
  'seller_kyb_reject',
  'auth_login_failed',
  'auth_otp_failed',
  'auth_login_failure_burst',
  'auth_otp_failure_burst',
  'payment_verification_failed',
  'bid_failed',
  'buy_now_failed',
  'rate_limit_hit',
];

const RESOURCE_TYPES = [
  'gadget',
  'auction',
  'order',
  'user',
  'dispute',
  'support_thread',
  'wallet',
  'payment',
  'auth',
];

type Filters = {
  action: string;
  resource_type: string;
  user_id: string;
  from: string;
  to: string;
};

const EMPTY_FILTERS: Filters = {
  action: ACTION_ANY,
  resource_type: ACTION_ANY,
  user_id: '',
  from: '',
  to: '',
};

const hasFilters = (f: Filters) =>
  f.action !== ACTION_ANY ||
  f.resource_type !== ACTION_ANY ||
  f.user_id.trim() !== '' ||
  f.from !== '' ||
  f.to !== '';

export function AuditPage() {
  const [items, setItems] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string | number> = { page, limit };
      if (applied.action !== ACTION_ANY) params.action = applied.action;
      if (applied.resource_type !== ACTION_ANY)
        params.resource_type = applied.resource_type;
      if (applied.user_id.trim()) params.user_id = applied.user_id.trim();
      if (applied.from) params.from = applied.from;
      if (applied.to) params.to = applied.to;

      const res = await adminApi.auditLogs(params);
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
  }, [page, limit, applied]);

  useEffect(() => {
    load();
  }, [load]);

  const applyFilters = () => {
    setPage(1);
    setApplied(filters);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
    setApplied(EMPTY_FILTERS);
  };

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

      <Panel className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted-foreground">
              Action
            </span>
            <Select
              value={filters.action}
              onValueChange={value =>
                setFilters(f => ({ ...f, action: value }))
              }
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ACTION_ANY}>All actions</SelectItem>
                {KNOWN_ACTIONS.map(a => (
                  <SelectItem key={a} value={a}>
                    {label(a)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted-foreground">
              Resource type
            </span>
            <Select
              value={filters.resource_type}
              onValueChange={value =>
                setFilters(f => ({ ...f, resource_type: value }))
              }
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ACTION_ANY}>All types</SelectItem>
                {RESOURCE_TYPES.map(t => (
                  <SelectItem key={t} value={t}>
                    {label(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted-foreground">
              Actor user ID
            </span>
            <Input
              placeholder="User UUID"
              className="w-64"
              value={filters.user_id}
              onChange={e =>
                setFilters(f => ({ ...f, user_id: e.target.value }))
              }
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted-foreground">
              From
            </span>
            <Input
              type="date"
              className="w-40"
              value={filters.from}
              onChange={e =>
                setFilters(f => ({ ...f, from: e.target.value }))
              }
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted-foreground">
              To
            </span>
            <Input
              type="date"
              className="w-40"
              value={filters.to}
              onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
            />
          </div>

          <Button onClick={applyFilters} disabled={loading}>
            Apply filters
          </Button>
          {hasFilters(applied) && (
            <Button variant="ghost" onClick={clearFilters} disabled={loading}>
              Clear
            </Button>
          )}
        </div>
      </Panel>

      <Panel>
        {loading && items.length === 0 ? (
          <Empty>Loading audit log…</Empty>
        ) : items.length === 0 ? (
          <Empty>No audit events match these filters.</Empty>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
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
