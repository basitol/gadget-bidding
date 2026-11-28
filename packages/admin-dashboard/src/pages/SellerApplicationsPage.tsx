import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import {
  sellerApplicationsApi,
  type SellerApplicationCounts,
  type SellerApplicationFilter,
  type SellerApplicationRow,
} from '@/api';
import { BusinessInitials, STATUS_CHIP, SellerApplicationPanel } from '@/components/SellerApplicationPanel';
import { Icon3d } from '@/components/shell/Icon3d';
import { PageLoadError, usePageStatus } from '@/components/states';
import { UnderlineIndicator, useTabIndicator } from '@/components/tabs';
import { ErrorAlert, PageHeader, Pagination } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { refreshQueues } from '@/hooks/useQueues';
import { ago, dueLabel } from '@/lib/format';
import { cn } from '@/lib/utils';

const TABS: { key: SellerApplicationFilter; label: string; meta: (n: number) => string; empty: string }[] = [
  {
    key: 'in_review',
    label: 'Waiting for review',
    meta: n => `${n} waiting · due soonest first`,
    empty: 'No applications waiting. Every business that applied has been checked.',
  },
  {
    key: 'needs_info',
    label: 'Needs info',
    meta: n => `${n} with the seller`,
    empty: 'Nothing is with the sellers right now.',
  },
  { key: 'approved', label: 'Approved', meta: n => `${n} approved`, empty: 'No approved sellers yet.' },
  { key: 'rejected', label: 'Turned down', meta: n => `${n} turned down`, empty: 'No applications turned down.' },
  { key: 'all', label: 'All', meta: n => `${n} in total`, empty: 'No applications yet.' },
];
const isTab = (v: string | null): v is SellerApplicationFilter => TABS.some(t => t.key === v);

const tabCount = (counts: SellerApplicationCounts | null, key: SellerApplicationFilter) =>
  !counts
    ? null
    : key === 'all'
      ? counts.in_review + counts.needs_info + counts.approved + counts.rejected
      : counts[key];

const TONE_TEXT = {
  ok: 'text-[#2E9E5E]',
  warn: 'text-[#DB7A2E]',
  danger: 'text-[#D9536A]',
  info: 'text-blue-press',
  neutral: 'text-slate',
} as const;
const DUE_TEXT = { red: 'text-[#D9536A]', amber: 'text-[#DB7A2E]', ink: 'text-slate' } as const;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Space under the page inside the shell: its bottom padding (32), the panel border (1) and the outer gap (12). */
const SHELL_BOTTOM = 45;
/** Below this the workspace stops shrinking and the window scrolls a little instead. */
const MIN_WORKSPACE = 560;

/**
 * On wide screens the queue and the application sit in a workspace that fills the rest of the
 * window and never changes size: each side scrolls on its own, so opening another application,
 * loading, or a preview arriving never makes the page grow or shrink. Null on narrow screens,
 * where the two stack and the page scrolls as usual.
 */
function useWorkspaceHeight(top: React.RefObject<HTMLElement | null>, workspace: React.RefObject<HTMLElement | null>) {
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = workspace.current;
      if (!el || window.innerWidth < 1024) return setHeight(null);
      const offset = el.getBoundingClientRect().top + window.scrollY;
      setHeight(Math.max(MIN_WORKSPACE, Math.floor(window.innerHeight - offset - SHELL_BOTTOM)));
    };
    measure();
    window.addEventListener('resize', measure);
    // The header above can change height (an error showing, the description wrapping).
    const ro = typeof ResizeObserver !== 'undefined' && top.current ? new ResizeObserver(measure) : null;
    if (ro && top.current) ro.observe(top.current);
    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [top, workspace]);
  return height;
}

/** "All 5 checks passed" (green), "3 checks need a look" (amber), "1 check failed · 2 need a look" (red). */
function checkLine(r: SellerApplicationRow): { text: string; tone: keyof typeof TONE_TEXT } {
  const { total, review, failed } = r.checks;
  if (failed) {
    const more = review ? ` · ${review} ${review === 1 ? 'needs' : 'need'} a look` : '';
    return { text: `${plural(failed, 'check', 'checks')} failed${more}`, tone: 'danger' };
  }
  if (review) return { text: `${plural(review, 'check needs', 'checks need')} a look`, tone: 'warn' };
  return { text: `All ${total} checks passed`, tone: 'ok' };
}

/** "Due in 3h", "Overdue 2h", "Due today", "Due tomorrow", "Due Dec 1". */
const dueText = (iso: string, now: number) => {
  const due = dueLabel(iso, now);
  return {
    text: /^(Due|Overdue)/.test(due.text)
      ? due.text
      : `Due ${due.text.replace(/^(Today|Tomorrow)$/, m => m.toLowerCase())}`,
    tone: due.tone,
  };
};

/** One application in the queue: who, which number, when it's due, and how its checks stand. */
function QueueItem({
  row,
  selected,
  now,
  onOpen,
}: {
  row: SellerApplicationRow;
  selected: boolean;
  now: number;
  onOpen: () => void;
}) {
  const waiting = row.status === 'in_review';
  const due = waiting && row.review_due_at ? dueText(row.review_due_at, now) : null;
  const line = waiting ? checkLine(row) : { text: STATUS_CHIP[row.status].text, tone: STATUS_CHIP[row.status].tone };
  const entered = ago(row.queued_at, now);
  const when = !waiting
    ? row.seller_code
    : row.second_review
      ? `Asked again ${entered.toLowerCase()}`
      : row.resubmitted_at
        ? `Fix sent ${entered.toLowerCase()}`
        : `Sent ${entered.toLowerCase()}`;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'flex w-full items-start gap-3 rounded-[18px] border p-4 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-blue-brand',
          selected ? 'border-blue-brand bg-blue-tint' : 'border-line bg-white/90 hover:bg-fill'
        )}
      >
        <BusinessInitials name={row.business_name} />
        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-2">
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">
              {row.business_name || 'Business name not given'}
            </span>
            {due ? (
              <span className={cn('shrink-0 text-[13px] tabular-nums', DUE_TEXT[due.tone])}>{due.text}</span>
            ) : !waiting && row.decided_at ? (
              <span className="shrink-0 text-[13px] text-slate">{ago(row.decided_at, now)}</span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-slate">
            {[row.registration, row.plaza, when].filter(Boolean).join(' · ')}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[13px]">
            <span className={TONE_TEXT[line.tone]}>{line.text}</span>
            {waiting && row.second_review ? <span className="text-[#DB7A2E]">· Second review</span> : null}
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * Seller KYB: the queue on the left (due soonest first), the application on the right with every
 * detail, check, document and the decision. Our verification team checks each business by hand
 * (RC/BN number on the CAC register, three private documents); the same-details check runs on its own.
 * ?application=<id> opens one (admin notifications link here).
 */
export function SellerApplicationsPage() {
  const searchId = useId();
  const [params, setParams] = useSearchParams();
  const status: SellerApplicationFilter = isTab(params.get('status'))
    ? (params.get('status') as SellerApplicationFilter)
    : 'in_review';
  const search = params.get('search') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const openId = params.get('application');
  const legacySeller = params.get('seller');

  const [query, setQuery] = useState(search);
  const [rows, setRows] = useState<SellerApplicationRow[] | null>(null);
  /** Which tab, search and page `rows` came from. Right after switching tab it still holds the old list. */
  const [rowsFor, setRowsFor] = useState('');
  const listKey = `${status}|${search}|${page}`;
  const [counts, setCounts] = useState<SellerApplicationCounts | null>(null);
  const [paging, setPaging] = useState({ total: 0, totalPages: 1 });
  const [error, setError] = useState('');
  /** The first load failed: nothing to show, so the page is the error. */
  const [failure, setFailure] = useState<unknown>(null);
  const [now, setNow] = useState(Date.now());
  const detailRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workspaceHeight = useWorkspaceHeight(topRef, workspaceRef);

  const patch = useCallback(
    (changes: Record<string, string | null>, replace = false) => {
      setParams(
        prev => {
          const next = new URLSearchParams(prev);
          Object.entries(changes).forEach(([k, v]) => (v == null || v === '' ? next.delete(k) : next.set(k, v)));
          return next;
        },
        { replace }
      );
    },
    [setParams]
  );

  const load = useCallback(() => {
    setError('');
    return sellerApplicationsApi
      .list({ status, search, page })
      .then(r => {
        setRows(r.data);
        setRowsFor(`${status}|${search}|${page}`);
        setCounts(r.counts);
        setNow(Date.now());
        setPaging({
          total: r.pagination?.total ?? r.data.length,
          totalPages: r.pagination?.totalPages ?? r.pagination?.total_pages ?? 1,
        });
        return r.data;
      })
      .catch(err => {
        setRows(prev => {
          if (prev === null) setFailure(err);
          return prev ?? [];
        });
        setError(err.message || 'Couldn’t load applications. Refresh the page to try again.');
        return [] as SellerApplicationRow[];
      });
  }, [status, search, page]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  // Due times count down while the page is open.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Search as you type, a moment after the last key.
  useEffect(() => {
    if (query.trim() === search) return;
    const t = window.setTimeout(
      () => patch({ search: query.trim() || null, page: null, application: null }, true),
      300
    );
    return () => window.clearTimeout(t);
  }, [query, search, patch]);

  /** The list on screen belongs to this tab, search and page (not the one we just left). */
  const current = rowsFor === listKey;

  // Old "Seller KYB" links carry the seller's user id; open their application when it's in the list.
  useEffect(() => {
    if (!legacySeller || !rows || !current) return;
    const match = rows.find(r => r.user_id === legacySeller);
    patch({ seller: null, application: match?.id ?? openId }, true);
  }, [legacySeller, rows, current, openId, patch]);

  // Nothing open yet: open the one at the top of this tab (the most urgent while waiting for review).
  useEffect(() => {
    if (openId || legacySeller || !current || !rows?.length) return;
    patch({ application: rows[0].id }, true);
  }, [rows, current, openId, legacySeller, patch]);

  const open = (id: string) => {
    patch({ application: id });
    // Stacked on narrow screens: bring the application into view.
    if (window.innerWidth < 1024)
      window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  // Another application: start at its top.
  useEffect(() => {
    if (workspaceHeight != null) detailRef.current?.scrollTo({ top: 0 });
  }, [openId, workspaceHeight]);

  usePageStatus(rows === null && !failure ? 'Loading' : null);

  const tab = TABS.find(t => t.key === status)!;
  const tabBarRef = useRef<HTMLDivElement>(null);
  useTabIndicator(tabBarRef, status, 'kyb-status');
  const n = tabCount(counts, status);

  if (failure && !counts) {
    return (
      <div className="pb-16 pt-1">
        <PageLoadError
          area="KYB"
          title="We couldn’t load seller applications"
          error={failure}
          onRetry={() => {
            setFailure(null);
            setRows(null);
            load();
          }}
        />
      </div>
    );
  }
  const meta = search ? `${paging.total} found for “${search}”` : n != null ? tab.meta(n) : '';

  return (
    <div className="pb-16 lg:pb-0">
      <div ref={topRef}>
        <PageHeader
          title="Seller applications"
          description="Businesses that want to sell. Look up the RC or BN number on the CAC register and check each document, then approve, send it back for a fix, or turn it down."
          path="/sellers/applications"
        />
        <ErrorAlert>{error}</ErrorAlert>

        <div
          ref={tabBarRef}
          role="tablist"
          aria-label="Applications by status"
          className="relative mb-6 flex flex-wrap gap-x-8 gap-y-2 border-b border-line"
        >
          <UnderlineIndicator />
          {TABS.map(t => {
            const count = tabCount(counts, t.key);
            const on = t.key === status;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => patch({ status: t.key === 'in_review' ? null : t.key, page: null, application: null })}
                className={cn(
                  '-mb-px flex h-11 items-center gap-2 border-b-2 border-transparent text-[15px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-blue-brand',
                  on ? 'text-ink' : 'text-hint hover:text-ink'
                )}
              >
                {t.label}
                {count != null ? (
                  <span
                    className={cn(
                      'rounded-[8px] px-1.5 text-[13px] leading-5 tabular-nums',
                      on ? 'bg-blue-tint text-blue-press' : 'bg-fill text-slate'
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={workspaceRef}
        style={workspaceHeight != null ? { height: workspaceHeight } : undefined}
        className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:grid-rows-1"
      >
        {/* The queue */}
        <aside aria-label={tab.label} className="flex min-h-0 flex-col gap-3 lg:-ml-1 lg:-mt-1 lg:overflow-y-auto lg:pb-2 lg:pl-1 lg:pr-1 lg:pt-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={searchId} className="text-[14px] text-ink">
              Search
            </Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-hint"
                aria-hidden
              />
              <Input
                id={searchId}
                type="search"
                value={query}
                maxLength={100}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e =>
                  e.key === 'Enter' && patch({ search: query.trim() || null, page: null, application: null }, true)
                }
                placeholder="Business, owner, email or RC/BN number"
                className="h-10 rounded-[12px] bg-white pl-9 text-[14px]"
              />
            </div>
          </div>
          {meta ? <p className="text-[13px] text-slate">{meta}</p> : null}

          {rows === null ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-[92px] rounded-[18px]" />
              <Skeleton className="h-[92px] rounded-[18px]" />
              <Skeleton className="h-[92px] rounded-[18px]" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-[18px] border border-line bg-white/90 p-4">
              <p className="text-[14px] text-slate">{search ? `No applications match “${search}”.` : tab.empty}</p>
              {search ? (
                <Button
                  variant="outline"
                  className="h-10 rounded-[10px] text-[14px]"
                  onClick={() => {
                    setQuery('');
                    patch({ search: null, page: null }, true);
                  }}
                >
                  Clear the search
                </Button>
              ) : null}
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map(r => (
                <QueueItem key={r.id} row={r} selected={openId === r.id} now={now} onOpen={() => open(r.id)} />
              ))}
            </ul>
          )}
          {rows && paging.totalPages > 1 ? (
            <Pagination
              page={page}
              totalPages={paging.totalPages}
              total={paging.total}
              limit={30}
              onChange={p => patch({ page: p > 1 ? String(p) : null, application: null })}
            />
          ) : null}
        </aside>

        {/* The application */}
        <div ref={detailRef} className="min-h-0 min-w-0 scroll-mt-3 lg:overflow-y-auto lg:pb-2">
          {openId ? (
            <SellerApplicationPanel
              applicationId={openId}
              onChanged={() => {
                load();
                refreshQueues();
              }}
            />
          ) : rows && rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-[24px] border border-white/80 bg-white/90 px-6 py-16 text-center">
              <Icon3d name="idcard" size={40} />
              <p className="text-[15px] text-slate">{search ? 'Nothing to open for this search.' : tab.empty}</p>
            </div>
          ) : (
            <Skeleton className="h-[480px] rounded-[24px]" />
          )}
        </div>
      </div>
    </div>
  );
}
