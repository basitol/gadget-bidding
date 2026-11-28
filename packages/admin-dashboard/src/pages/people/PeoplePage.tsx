import { useCallback, useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { peopleApi, type BuyerRow, type PeopleStats, type RestrictedRow, type SellerRow } from '@/api';
import { SectionCard } from '@/components/attention';
import { Seo } from '@/components/Seo';
import { secondary } from '@/components/SellerApplicationPanel';
import { Pagination } from '@/components/shared';
import { PageLoadError, RowsSkeleton, StatCardSkeleton, usePageCrumb } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  EmptyRows,
  LinkButton,
  LoadingStatus,
  PersonCell,
  RowsError,
  SegmentedTabs,
  StatCard,
  StatusChip,
  dayMonth,
  errorText,
  monthYear,
  num,
  plural,
  rowPrimary,
  rowRed,
  rowSecondary,
  td,
  th,
} from './shared';
import { ApproveDialog, PersonSheets, sheetCrumb, type PersonRef, type SheetAction } from './sheets';

export type PeopleTab = 'buyers' | 'sellers' | 'suspended';

const TABS: Record<
  PeopleTab,
  { label: string; path: string; title: string; description: string; empty: string }
> = {
  buyers: {
    label: 'Buyers',
    path: '/buyers',
    title: 'Buyers',
    description: 'Open someone to see their orders, bids and notes. Suspend stops them bidding or paying.',
    empty: 'No buyers yet. People who sign up to bid show up here.',
  },
  sellers: {
    label: 'Sellers',
    path: '/sellers',
    title: 'Sellers',
    description: 'Open a store to see listings, payouts and KYB. Pausing hides their auctions until you restore them.',
    empty: 'No sellers yet. Businesses show up here once Seller KYB approves them.',
  },
  suspended: {
    label: 'Suspended',
    path: '/users/suspended',
    title: 'Suspended & paused',
    description: 'Everyone who can’t bid or list right now, why, and until when.',
    empty: 'Nobody is suspended or paused. Everyone can bid and list.',
  },
};
const ORDER: PeopleTab[] = ['buyers', 'sellers', 'suspended'];

/** Missed payments in 90 days that pause bidding (the suggestion to suspend). */
const MISSED_LIMIT = 3;

type List =
  | { key: string; tab: 'buyers'; rows: BuyerRow[] }
  | { key: string; tab: 'sellers'; rows: SellerRow[] }
  | { key: string; tab: 'suspended'; rows: RestrictedRow[] };
type Paging = { total: number; totalPages: number; limit: number };

/*
 * What the page last showed, kept between tab switches and visits: a tab or page seen before appears at
 * once and refreshes behind the scenes, instead of dropping back to skeletons.
 */
let statsCache: PeopleStats | null = null;
const listCache = new Map<string, { list: List; paging: Paging }>();
const keyFor = (tab: PeopleTab, search: string, page: number) => `${tab}|${search}|${page}`;
const pagingOf = (r: { data: unknown[]; pagination?: Partial<Paging> }): Paging => ({
  total: r.pagination?.total ?? r.data.length,
  totalPages: r.pagination?.totalPages ?? 1,
  limit: r.pagination?.limit ?? 20,
});

/** "0 missed", "1 missed", "3 missed in 90 days". */
const missedText = (n: number, limit = MISSED_LIMIT) => (n >= limit ? `${num(n)} missed in 90 days` : `${num(n)} missed`);

/** "98% passed · 4.8 ★", "New · KYB verified". */
function Quality({ row }: { row: SellerRow }) {
  if (row.is_new) return <>{row.kyb_verified ? 'New · KYB verified' : 'New'}</>;
  const passed = row.passed_percent != null ? `${Math.round(row.passed_percent)}% passed` : null;
  if (!passed && row.rating == null) return <>—</>;
  return (
    <>
      {passed}
      {passed && row.rating != null ? ' · ' : null}
      {row.rating != null ? (
        <>
          {row.rating.toFixed(1)} <span aria-hidden>★</span>
          <span className="sr-only">stars</span>
        </>
      ) : null}
    </>
  );
}

/** "Missed payments · until Dec 4 · by Ngozi Eze" (parts that aren't known are left out). */
const whyLine = (r: RestrictedRow) =>
  [r.why, r.until ? `until ${dayMonth(r.until)}` : null, r.by ? `by ${r.by}` : null].filter(Boolean).join(' · ');

const personOf = (
  r: { id: string; name: string; email: string | null; status: PersonRef['status'] },
  type: PersonRef['type']
): PersonRef => ({ id: r.id, name: r.name, email: r.email, type, status: r.status });

/** Whole-row click opens the person, unless the click was on a link or button in the row. */
const rowClick = (go: () => void) => (e: MouseEvent<HTMLTableRowElement>) => {
  if ((e.target as HTMLElement).closest('a,button,input,label')) return;
  go();
};

/**
 * Users: buyers, sellers, and everyone suspended or paused. Stat cards, segmented tabs (one address
 * each: /buyers, /sellers, /users/suspended), then the table. Suspend, Pause listings and Restore open
 * a sheet on the right; the breadcrumb follows it ("Users › Suspend Tolu Kareem").
 */
export function PeoplePage({ tab }: { tab: PeopleTab }) {
  const navigate = useNavigate();
  const searchId = useId();
  const [params, setParams] = useSearchParams();
  const search = (params.get('search') ?? '').trim();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const listKey = keyFor(tab, search, page);
  const meta = TABS[tab];

  // The search box follows the tab: switching tabs starts it from that address's search.
  const [query, setQuery] = useState(search);
  const [queryTab, setQueryTab] = useState(tab);
  if (queryTab !== tab) {
    setQueryTab(tab);
    setQuery(search);
  }

  const [stats, setStats] = useState<PeopleStats | null>(statsCache);
  const [statsFailure, setStatsFailure] = useState<unknown>(null);
  const [list, setList] = useState<List | null>(() => listCache.get(listKey)?.list ?? null);
  const [listFailure, setListFailure] = useState<unknown>(null);
  const [paging, setPaging] = useState<Paging>(
    () => listCache.get(listKey)?.paging ?? { total: 0, totalPages: 1, limit: 20 }
  );
  const latest = useRef(listKey);

  const [action, setAction] = useState<SheetAction | null>(null);
  const [approving, setApproving] = useState<RestrictedRow | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  usePageCrumb(action ? sheetCrumb(action) : null);

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

  const loadStats = useCallback(() => {
    peopleApi
      .stats()
      .then(r => {
        statsCache = r.data;
        setStats(r.data);
        setStatsFailure(null);
      })
      .catch(e => setStatsFailure(e));
  }, []);

  const loadList = useCallback(() => {
    const key = keyFor(tab, search, page);
    latest.current = key;
    setListFailure(null);
    peopleApi
      .list<BuyerRow | SellerRow | RestrictedRow>(tab, { search: search || undefined, page })
      .then(r => {
        const next = { list: { key, tab, rows: r.data } as List, paging: pagingOf(r) };
        listCache.set(key, next);
        if (latest.current !== key) return;
        setList(next.list);
        setPaging(next.paging);
      })
      .catch(e => {
        if (latest.current === key) setListFailure(e);
      });
  }, [tab, search, page]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Warm the other tabs' first page so the first switch is instant too.
  useEffect(() => {
    ORDER.forEach(k => {
      const key = keyFor(k, '', 1);
      if (k === tab || listCache.has(key)) return;
      peopleApi
        .list<BuyerRow | SellerRow | RestrictedRow>(k, { page: 1 })
        .then(r => {
          if (!listCache.has(key)) listCache.set(key, { list: { key, tab: k, rows: r.data } as List, paging: pagingOf(r) });
        })
        .catch(() => {});
    });
    // Once, when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search as you type, a moment after the last key.
  useEffect(() => {
    if (query.trim() === search) return;
    const t = window.setTimeout(() => patch({ search: query.trim() || null, page: null }, true), 300);
    return () => window.clearTimeout(t);
  }, [query, search, patch]);

  const refresh = () => {
    // Someone was suspended, paused or restored: the other tabs' saved rows are out of date.
    listCache.clear();
    loadStats();
    loadList();
  };

  const decline = async (row: RestrictedRow) => {
    if (!row.restriction_id) return;
    setRowBusy(row.id);
    try {
      await peopleApi.decline(row.restriction_id);
      toast.success(`Declined for ${row.name}`, { description: 'Nothing changes for them.' });
      refresh();
    } catch (e) {
      toast.error('That didn’t go through', { description: errorText(e) });
    } finally {
      setRowBusy(null);
    }
  };

  const approve = async () => {
    const row = approving;
    if (!row?.restriction_id) return;
    setRowBusy(row.id);
    try {
      await peopleApi.approve(row.restriction_id);
      const pause = row.kind ? row.kind === 'pause_listings' : row.type === 'seller';
      toast.success(pause ? `Listings paused for ${row.name}` : `${row.name} is suspended`, {
        description:
          pause
            ? 'We’ve emailed them. Payouts are held until someone restores them.'
            : 'We’ve emailed them. They can appeal by replying.',
      });
      setApproving(null);
      refresh();
    } catch (e) {
      toast.error('That didn’t go through', { description: errorText(e) });
    } finally {
      setRowBusy(null);
    }
  };

  // A tab or page seen before shows straight away while it refreshes.
  const cached = list?.key === listKey ? undefined : listCache.get(listKey);
  const shown = cached?.list ?? list;
  const shownPaging = cached?.paging ?? paging;

  // The first load didn't work: nothing to show, so the page is the error.
  const firstFailure = (!stats && statsFailure) || (!shown && listFailure) ? statsFailure ?? listFailure : null;
  if (firstFailure) {
    return (
      <div className="pb-16 pt-1">
        <PageLoadError
          area="USR"
          title="We couldn’t load users"
          error={firstFailure}
          onRetry={() => {
            setStatsFailure(null);
            setListFailure(null);
            refresh();
          }}
        />
      </div>
    );
  }

  const suggested = stats && stats.suggested.count > 0 ? stats.suggested : null;
  const sameTab = shown?.tab === tab;
  const stale = sameTab && shown?.key !== listKey;

  const clearSearch = () => {
    setQuery('');
    patch({ search: null, page: null }, true);
  };

  const table = () => {
    if (!shown || !sameTab) {
      return listFailure ? (
        <RowsError error={listFailure} what={tab === 'suspended' ? 'this list' : tab} onRetry={loadList} />
      ) : (
        <RowsSkeleton rows={5} />
      );
    }
    if (shown.rows.length === 0) {
      return search ? (
        <EmptyRows
          action={
            <Button variant="outline" className={secondary} onClick={clearSearch}>
              Clear the search
            </Button>
          }
        >
          Nobody here matches “{search}”.
        </EmptyRows>
      ) : (
        <EmptyRows>{meta.empty}</EmptyRows>
      );
    }
    if (shown.tab === 'buyers') {
      return <BuyersTable rows={shown.rows} onAction={setAction} onOpen={id => navigate(`/buyers/${id}`)} />;
    }
    if (shown.tab === 'sellers') {
      return <SellersTable rows={shown.rows} onAction={setAction} onOpen={id => navigate(`/sellers/${id}`)} />;
    }
    return (
      <SuspendedTable
        rows={shown.rows}
        busy={rowBusy}
        onAction={setAction}
        onApprove={setApproving}
        onDecline={decline}
      />
    );
  };

  return (
    <div className="flex flex-col gap-6 pb-16">
      <Seo title={`Users · ${meta.label}`} description={meta.description} path={meta.path} noindex />
      <h1 className="sr-only">Users · {meta.label}</h1>
      {!stats || !shown ? <LoadingStatus /> : null}

      {stats ? (
        <div className={cn('grid gap-4 sm:grid-cols-2', suggested ? 'xl:grid-cols-4' : 'lg:grid-cols-3')}>
          <StatCard
            icon="idcard"
            label="Buyers"
            value={num(stats.buyers)}
            caption={`+${num(stats.buyers_this_week)} this week`}
          />
          <StatCard icon="store" label="Verified sellers" value={num(stats.verified_sellers)} caption="All in Computer Village" />
          <StatCard icon="shield" label="Suspended" value={num(stats.suspended)} caption="Buyers and sellers" />
          {suggested ? (
            suggested.first ? (
              <StatCard
                icon="bell"
                label="Suggested"
                value={num(suggested.count)}
                caption={`${suggested.first.name} · ${plural(suggested.first.missed, 'missed payment', 'missed payments')}`}
                actionLabel={`Open Suspend for ${suggested.first.name}`}
                onClick={() => {
                  const first = suggested.first!;
                  setAction({
                    kind: 'suspend',
                    person: { id: first.id, name: first.name, type: 'buyer', status: 'active' },
                    reason: 'missed_payments',
                  });
                }}
              />
            ) : (
              <StatCard
                icon="bell"
                label="Suggested"
                value={num(suggested.count)}
                caption={plural(suggested.count, 'buyer to look at', 'buyers to look at')}
              />
            )
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
      )}

      <SegmentedTabs
        label="Users"
        active={tab}
        items={ORDER.map(k => ({ key: k, label: TABS[k].label, to: TABS[k].path, count: stats?.tabs[k] ?? null }))}
      />

      <SectionCard
        icon={<Users className="size-5 text-blue-brand" aria-hidden />}
        title={meta.title}
        description={meta.description}
        right={
          <div className="relative w-full sm:w-[280px]">
            <Label htmlFor={searchId} className="sr-only">
              Search {meta.label.toLowerCase()}
            </Label>
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
              onKeyDown={e => e.key === 'Enter' && patch({ search: query.trim() || null, page: null }, true)}
              placeholder="Search name, email or phone"
              className="h-10 rounded-[12px] border-line bg-fill pl-9 text-[14px] placeholder:text-faint"
            />
          </div>
        }
      >
        {listFailure && sameTab ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-line bg-[#FDF0F2] px-6 py-3">
            <p className="min-w-0 flex-1 text-[14px] text-ink">
              We couldn’t refresh this list. <span className="text-slate">{errorText(listFailure)}</span>
            </p>
            <Button variant="outline" className={rowSecondary} onClick={loadList}>
              Try again
            </Button>
          </div>
        ) : null}
        <div aria-busy={stale} className={cn('transition-opacity duration-150', stale && 'opacity-60')}>
          {table()}
        </div>
        {sameTab && shownPaging.totalPages > 1 ? (
          <Pagination
            page={page}
            totalPages={shownPaging.totalPages}
            total={shownPaging.total}
            limit={shownPaging.limit}
            onChange={p => patch({ page: p > 1 ? String(p) : null })}
          />
        ) : null}
      </SectionCard>

      <PersonSheets action={action} onClose={() => setAction(null)} onDone={refresh} />
      <ApproveDialog row={approving} busy={!!rowBusy} onCancel={() => setApproving(null)} onConfirm={approve} />
    </div>
  );
}

/* ---------------- Tables ---------------- */

const rowCls = 'border-b border-line last:border-0';
const cellText = 'text-[14px] text-ink';

function BuyersTable({
  rows,
  onAction,
  onOpen,
}: {
  rows: BuyerRow[];
  onAction: (a: SheetAction) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={cn(th, 'pl-6')}>Name</th>
            <th scope="col" className={th}>Joined</th>
            <th scope="col" className={th}>Orders</th>
            <th scope="col" className={th}>Payments</th>
            <th scope="col" className={th}>Status</th>
            <th scope="col" className={cn(th, 'pr-6')}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const person = personOf(r, 'buyer');
            return (
              <tr
                key={r.id}
                onClick={rowClick(() => onOpen(r.id))}
                className={cn(rowCls, 'cursor-pointer transition-colors duration-150 hover:bg-fill')}
              >
                <td className={cn(td, 'pl-6')}>
                  <PersonCell id={r.id} name={r.name} email={r.email} />
                </td>
                <td className={cn(td, cellText, 'whitespace-nowrap')}>{monthYear(r.joined_at)}</td>
                <td className={cn(td, cellText, 'whitespace-nowrap tabular-nums')}>
                  {plural(r.orders, 'order', 'orders')}
                </td>
                <td className={cn(td, cellText, 'whitespace-nowrap tabular-nums')}>{missedText(r.missed_90d, r.missed_limit)}</td>
                <td className={td}>
                  <StatusChip status={r.status} />
                </td>
                <td className={cn(td, 'pr-6')}>
                  <div className="flex justify-end gap-2">
                    <LinkButton to={`/buyers/${r.id}`} label={`Open ${r.name}`}>
                      Open
                    </LinkButton>
                    {r.status === 'active' ? (
                      <Button
                        variant="outline"
                        className={rowRed}
                        aria-label={`Suspend ${r.name}`}
                        onClick={() => onAction({ kind: 'suspend', person })}
                      >
                        Suspend
                      </Button>
                    ) : r.status !== 'pending_approval' ? (
                      <Button
                        className={rowPrimary}
                        aria-label={`Restore ${r.name}`}
                        onClick={() => onAction({ kind: 'restore', person })}
                      >
                        Restore
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SellersTable({
  rows,
  onAction,
  onOpen,
}: {
  rows: SellerRow[];
  onAction: (a: SheetAction) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={cn(th, 'pl-6')}>Name</th>
            <th scope="col" className={th}>Joined</th>
            <th scope="col" className={th}>Sales</th>
            <th scope="col" className={th}>Quality</th>
            <th scope="col" className={th}>Status</th>
            <th scope="col" className={cn(th, 'pr-6')}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const person = personOf(r, 'seller');
            return (
              <tr
                key={r.id}
                onClick={rowClick(() => onOpen(r.id))}
                className={cn(rowCls, 'cursor-pointer transition-colors duration-150 hover:bg-fill')}
              >
                <td className={cn(td, 'pl-6')}>
                  <PersonCell id={r.id} name={r.name} email={r.email} />
                </td>
                <td className={cn(td, cellText, 'whitespace-nowrap')}>{monthYear(r.joined_at)}</td>
                <td className={cn(td, cellText, 'whitespace-nowrap tabular-nums')}>{plural(r.sales, 'sale', 'sales')}</td>
                <td className={cn(td, cellText, 'whitespace-nowrap tabular-nums')}>
                  <Quality row={r} />
                </td>
                <td className={td}>
                  <StatusChip status={r.status} />
                </td>
                <td className={cn(td, 'pr-6')}>
                  <div className="flex justify-end gap-2">
                    <LinkButton to={`/sellers/${r.id}`} label={`Open ${r.name}`}>
                      Open
                    </LinkButton>
                    {r.status === 'active' ? (
                      <Button
                        variant="outline"
                        className={rowRed}
                        aria-label={`Pause listings for ${r.name}`}
                        onClick={() => onAction({ kind: 'pause', person })}
                      >
                        Pause listings
                      </Button>
                    ) : r.status !== 'pending_approval' ? (
                      <Button
                        className={rowPrimary}
                        aria-label={`Restore ${r.name}`}
                        onClick={() => onAction({ kind: 'restore', person })}
                      >
                        Restore
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SuspendedTable({
  rows,
  busy,
  onAction,
  onApprove,
  onDecline,
}: {
  rows: RestrictedRow[];
  busy: string | null;
  onAction: (a: SheetAction) => void;
  onApprove: (row: RestrictedRow) => void;
  onDecline: (row: RestrictedRow) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={cn(th, 'pl-6')}>Name</th>
            <th scope="col" className={th}>Type</th>
            <th scope="col" className={th}>Why · until · by</th>
            <th scope="col" className={th}>Status</th>
            <th scope="col" className={cn(th, 'pr-6')}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const to = `/${r.type === 'seller' ? 'sellers' : 'buyers'}/${r.id}`;
            const pending = r.status === 'pending_approval';
            return (
              <tr key={`${r.id}:${r.restriction_id ?? ''}`} className={rowCls}>
                <td className={cn(td, 'pl-6')}>
                  <PersonCell id={r.id} name={r.name} email={r.email} />
                </td>
                <td className={cn(td, cellText)}>{r.type === 'seller' ? 'Seller' : 'Buyer'}</td>
                <td className={cn(td, cellText)}>
                  {whyLine(r) || '—'}
                  {pending ? <div className="mt-0.5 text-[13px] text-slate">Waiting for a second admin</div> : null}
                </td>
                <td className={td}>
                  <StatusChip status={r.status} />
                </td>
                <td className={cn(td, 'pr-6')}>
                  <div className="flex justify-end gap-2">
                    {pending && r.can_approve && r.restriction_id ? (
                      <>
                        <Button
                          variant="outline"
                          className={rowSecondary}
                          disabled={busy === r.id}
                          aria-label={`Decline for ${r.name}`}
                          onClick={() => onDecline(r)}
                        >
                          {busy === r.id ? 'Saving…' : 'Decline'}
                        </Button>
                        <Button
                          className={rowPrimary}
                          disabled={busy === r.id}
                          aria-label={`Approve for ${r.name}`}
                          onClick={() => onApprove(r)}
                        >
                          Approve
                        </Button>
                      </>
                    ) : (
                      <>
                        <LinkButton to={to} label={`Open ${r.name}`}>
                          Open
                        </LinkButton>
                        {pending ? null : (
                          <Button
                            className={rowPrimary}
                            aria-label={`Restore ${r.name}`}
                            onClick={() =>
                              onAction({
                                kind: 'restore',
                                person: personOf(r, r.type),
                                fallback: { why: r.why, until: r.until, by: r.by, source: r.source },
                              })
                            }
                          >
                            Restore
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
