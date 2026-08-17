import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminApi } from '@/api';
import { label, when } from '@/lib/format';
import {
  connectAdminSocket,
  joinSupportThread,
  leaveSupportThread,
} from '@/lib/socket';
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
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

function mergeMessages(current: any[], incoming: any[]) {
  const map = new Map<string, any>();
  [...current, ...incoming].forEach(m => {
    if (m?.id) map.set(m.id, m);
  });
  return Array.from(map.values()).sort((a, b) =>
    String(a.created_at).localeCompare(String(b.created_at))
  );
}

export function SupportPage() {
  const { confirm } = useConfirmDialog();
  const [status, setStatus] = useState('open');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [msgError, setMsgError] = useState('');
  const selectedIdRef = useRef<string | null>(null);

  const query = useMemo(
    () => ({ status, search: appliedSearch, page, limit }),
    [status, appliedSearch, page, limit]
  );

  const load = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setError('');
      }
      try {
        const res = await adminApi.supportThreads(query);
        setItems(res.data || []);
        setTotal(res.pagination?.total || 0);
        setTotalPages(
          res.pagination?.totalPages || res.pagination?.total_pages || 1
        );
      } catch (err: any) {
        if (!silent) setError(err.message);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [query]
  );

  const refreshSelectedMessages = useCallback(async (threadId: string) => {
    try {
      const res = await adminApi.supportMessages(threadId);
      setMessages(prev => mergeMessages(prev, res.data || []));
    } catch {
      // ignore poll errors
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Socket + polling for live inbox
  useEffect(() => {
    const socket = connectAdminSocket();
    const onMessage = (payload: { thread_id: string; message: any }) => {
      if (!payload?.message?.id) return;
      load(true);
      if (
        selectedIdRef.current &&
        payload.thread_id === selectedIdRef.current
      ) {
        setMessages(prev => mergeMessages(prev, [payload.message]));
      }
    };
    socket?.on('support:message', onMessage);

    const poll = setInterval(() => {
      load(true);
      if (selectedIdRef.current) {
        refreshSelectedMessages(selectedIdRef.current);
      }
    }, 15000);

    return () => {
      socket?.off('support:message', onMessage);
      clearInterval(poll);
    };
  }, [load, refreshSelectedMessages]);

  const openThread = async (thread: any) => {
    if (selectedIdRef.current) {
      leaveSupportThread(selectedIdRef.current);
    }
    selectedIdRef.current = thread.id;
    setSelected(thread);
    setReply('');
    setMsgError('');
    joinSupportThread(thread.id);
    try {
      const res = await adminApi.supportMessages(thread.id);
      setMessages(res.data || []);
      setItems(prev =>
        prev.map(t =>
          t.id === thread.id ? { ...t, admin_unread_count: 0 } : t
        )
      );
    } catch (err: any) {
      setMsgError(err.message);
    }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    setBusy(true);
    setMsgError('');
    try {
      const res = await adminApi.replySupport(selected.id, reply.trim());
      const message = (res as any).data;
      if (message?.id) {
        setMessages(prev => mergeMessages(prev, [message]));
      } else {
        await refreshSelectedMessages(selected.id);
      }
      setReply('');
      await load(true);
    } catch (err: any) {
      setMsgError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const closeThread = async () => {
    if (!selected) return;
    if (!(await confirm('Close this support thread?'))) return;
    setBusy(true);
    try {
      await adminApi.closeSupport(selected.id);
      leaveSupportThread(selected.id);
      selectedIdRef.current = null;
      setSelected(null);
      setMessages([]);
      await load(true);
    } catch (err: any) {
      setMsgError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Support chat"
        description="Reply to sellers who message GadgetBid from the app."
      />

      <ErrorAlert>{error}</ErrorAlert>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
        <div>
          <Toolbar>
            <SelectField
              value={status}
              onValueChange={v => {
                setStatus(v);
                setPage(1);
              }}
              options={[
                { value: 'open', label: 'Open' },
                { value: 'closed', label: 'Closed' },
                { value: 'all', label: 'All' },
              ]}
            />
            <SearchInput
              placeholder="Seller name or phone…"
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
              <Empty>Loading conversations…</Empty>
            ) : items.length === 0 ? (
              <Empty>No support threads yet.</Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Seller</TableHead>
                    <TableHead>Preview</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(t => (
                    <TableRow
                      key={t.id}
                      className={cn(
                        'cursor-pointer',
                        selected?.id === t.id && 'bg-primary/10'
                      )}
                      onClick={() => openThread(t)}
                    >
                      <TableCell>
                        <div className="font-medium">
                          {t.seller?.full_name || 'Seller'}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {t.seller?.phone_number}
                        </div>
                        {t.admin_unread_count > 0 ? (
                          <Badge tone="danger" className="mt-1">
                            {t.admin_unread_count} new
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="line-clamp-2 text-sm">
                          {t.last_message_preview || '—'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {when(t.last_message_at)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge tone={t.status === 'open' ? 'ok' : 'neutral'}>
                          {label(t.status)}
                        </Badge>
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
        </div>

        <Panel className="flex h-[calc(100vh-220px)] min-h-[520px] flex-col overflow-hidden">
          {!selected ? (
            <Empty>Select a conversation to reply.</Empty>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 border-b bg-muted/40 px-4 py-3">
                <div>
                  <div className="font-medium">
                    {selected.seller?.full_name}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {selected.seller?.phone_number}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Badge tone={selected.status === 'open' ? 'ok' : 'neutral'}>
                    {label(selected.status)}
                  </Badge>
                  {selected.status === 'open' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={closeThread}
                    >
                      Close
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                {msgError ? <ErrorAlert>{msgError}</ErrorAlert> : null}
                {messages.length === 0 ? (
                  <Empty>No messages in this thread.</Empty>
                ) : (
                  messages.map(m => {
                    const fromAdmin = m.sender?.role === 'admin';
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          'max-w-[85%] overflow-hidden rounded-xl px-3 py-2 text-sm shadow-toggle',
                          fromAdmin
                            ? 'ml-auto bg-primary text-primary-foreground'
                            : 'bg-muted'
                        )}
                      >
                        <div
                          className={cn(
                            'mb-1 text-xs font-medium',
                            fromAdmin
                              ? 'text-primary-foreground/80'
                              : 'text-primary'
                          )}
                        >
                          {fromAdmin
                            ? 'You (Support)'
                            : m.sender?.full_name || 'Seller'}
                        </div>
                        <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words pr-1">
                          {m.body}
                        </div>
                        <div
                          className={cn(
                            'mt-1 text-[10px]',
                            fromAdmin
                              ? 'text-primary-foreground/70'
                              : 'text-muted-foreground'
                          )}
                        >
                          {when(m.created_at)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {selected.status === 'open' ? (
                <div className="space-y-2 border-t p-4">
                  <Textarea
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    placeholder="Write a reply to the seller…"
                    rows={3}
                  />
                  <div className="flex justify-end">
                    <Button
                      disabled={busy || !reply.trim()}
                      onClick={sendReply}
                    >
                      {busy ? 'Sending…' : 'Send reply'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="border-t p-4 text-sm text-muted-foreground">
                  This thread is closed.
                </div>
              )}
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
