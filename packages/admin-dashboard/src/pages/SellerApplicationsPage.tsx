import { useCallback, useEffect, useId, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import {
  sellerApplicationsApi,
  type SellerApplicationCounts,
  type SellerApplicationFilter,
  type SellerApplicationRow,
} from '@/api';
import { SectionCard } from '@/components/attention';
import { Chip, NUMBER_CHIP, STATUS_CHIP, SellerApplicationSheet } from '@/components/SellerApplicationSheet';
import { Icon3d } from '@/components/shell/Icon3d';
import { ErrorAlert, PageHeader, Pagination } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { refreshQueues } from '@/hooks/useQueues';
import { friendlyTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const TABS: {
  key: SellerApplicationFilter;
  label: string;
  /** Column heading for the time we show. */
  when: string;
  meta: (n: number) => string;
  empty: string;
}[] = [
  {
    key: 'in_review',
    label: 'Waiting for review',
    when: 'Sent',
    meta: n => `${n} waiting · oldest first`,
    empty: 'No applications waiting. Every business that applied has been checked.',
  },
  {
    key: 'needs_info',
    label: 'Needs info',
    when: 'Sent back',
    meta: n => `${n} with the seller`,
    empty: 'Nothing is with the sellers right now.',
  },
  { key: 'approved', label: 'Approved', when: 'Approved', meta: n => `${n} approved`, empty: 'No approved sellers yet.' },
  { key: 'rejected', label: 'Turned down', when: 'Turned down', meta: n => `${n} turned down`, empty: 'No applications turned down.' },
  { key: 'all', label: 'All', when: 'Sent', meta: n => `${n} in total`, empty: 'No applications yet.' },
];
const isTab = (v: string | null): v is SellerApplicationFilter => TABS.some(t => t.key === v);

const tabCount = (counts: SellerApplicationCounts | null, key: SellerApplicationFilter) =>
  !counts ? null : key === 'all' ? counts.in_review + counts.needs_info + counts.approved + counts.rejected : counts[key];

const NUMBER_TEXT = { ok: 'text-[#2E9E5E]', danger: 'text-[#D9536A]', neutral: 'text-slate', warn: '', info: '' } as const;

/**
 * Seller applications: our verification team checks each business by hand (RC/BN number on the
 * CAC register, three private documents), then approves, sends back or turns it down.
 * ?application=<id> opens one (admin notifications link here).
 */
export function SellerApplicationsPage() {
  const searchId = useId();
  const [params, setParams] = useSearchParams();
  const status: SellerApplicationFilter = isTab(params.get('status')) ? (params.get('status') as SellerApplicationFilter) : 'in_review';
  const search = params.get('search') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const openId = params.get('application');
  const legacySeller = params.get('seller');

  const [query, setQuery] = useState(search);
  const [rows, setRows] = useState<SellerApplicationRow[] | null>(null);
  const [counts, setCounts] = useState<SellerApplicationCounts | null>(null);
  const [paging, setPaging] = useState({ total: 0, totalPages: 1 });
  const [error, setError] = useState('');

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
        setCounts(r.counts);
        setPaging({
          total: r.pagination?.total ?? r.data.length,
          totalPages: r.pagination?.totalPages ?? r.pagination?.total_pages ?? 1,
        });
        return r.data;
      })
      .catch(err => {
        setRows(prev => prev ?? []);
        setError(err.message || 'Couldn’t load applications. Refresh the page to try again.');
        return [] as SellerApplicationRow[];
      });
  }, [status, search, page]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  // Search as you type, a moment after the last key.
  useEffect(() => {
    if (query.trim() === search) return;
    const t = window.setTimeout(() => patch({ search: query.trim() || null, page: null }, true), 300);
    return () => window.clearTimeout(t);
  }, [query, search, patch]);

  // Old "Seller KYB" links carry the seller's user id; open their application when it's in the list.
  useEffect(() => {
    if (!legacySeller || !rows) return;
    const match = rows.find(r => r.user_id === legacySeller);
    patch({ seller: null, application: match?.id ?? openId }, true);
  }, [legacySeller, rows, openId, patch]);

  const tab = TABS.find(t => t.key === status)!;
  const n = tabCount(counts, status);
  const meta = search ? `${paging.total} found for “${search}”` : n != null ? tab.meta(n) : undefined;
  const decidedTab = status === 'needs_info' || status === 'approved' || status === 'rejected';

  return (
    <div className="pb-16">
      <PageHeader
        title="Seller applications"
        description="Businesses that want to sell. Look up the RC or BN number on the CAC register and check each document, then approve, send it back for a fix, or turn it down."
        path="/sellers/applications"
      />
      <ErrorAlert>{error}</ErrorAlert>

      <div role="tablist" aria-label="Applications by status" className="mb-6 flex flex-wrap gap-x-8 gap-y-2 border-b border-line">
        {TABS.map(t => {
          const count = tabCount(counts, t.key);
          const on = t.key === status;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => patch({ status: t.key === 'in_review' ? null : t.key, page: null })}
              className={cn(
                '-mb-px flex h-11 items-center gap-2 border-b-2 text-[15px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-blue-brand',
                on ? 'border-blue-brand text-ink' : 'border-transparent text-hint hover:text-ink'
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

      <SectionCard icon={<Icon3d name="idcard" size={26} />} title={tab.label} meta={meta}>
        <div className="flex flex-col gap-1.5 border-b border-line px-6 py-4">
          <Label htmlFor={searchId} className="text-[14px] text-ink">
            Search
          </Label>
          <div className="relative w-full sm:max-w-[360px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-hint" aria-hidden />
            <Input
              id={searchId}
              type="search"
              value={query}
              maxLength={100}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && patch({ search: query.trim() || null, page: null }, true)}
              placeholder="Business, owner, email or RC/BN number"
              className="h-10 rounded-[12px] bg-white pl-9 text-[14px]"
            />
          </div>
        </div>
        {rows === null ? (
          <Skeleton className="m-6 h-40" />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-start gap-3 px-6 py-8">
            <p className="text-[15px] text-slate">{search ? `No applications match “${search}”.` : tab.empty}</p>
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
          <div className="relative overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line text-[13px] font-medium uppercase tracking-[0.04em] text-slate">
                  <th scope="col" className="py-3 pl-6 pr-3 font-medium">Business</th>
                  <th scope="col" className="hidden px-3 py-3 font-medium lg:table-cell">Seller</th>
                  <th scope="col" className="hidden px-3 py-3 font-medium md:table-cell">Registration</th>
                  <th scope="col" className="px-3 py-3 font-medium">Documents</th>
                  <th scope="col" className="hidden px-3 py-3 font-medium md:table-cell">{tab.when}</th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    <span className="sr-only">Status</span>
                  </th>
                  <th scope="col" className="py-3 pl-3 pr-6 text-right font-medium">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const number = NUMBER_CHIP[r.number_check];
                  const all = r.documents.uploaded >= 3;
                  const waiting = r.status === 'in_review';
                  return (
                    <tr
                      key={r.id}
                      onClick={() => patch({ application: r.id })}
                      className={cn(
                        'cursor-pointer border-b border-line transition-colors duration-150 last:border-0 hover:bg-fill/60',
                        openId === r.id && 'bg-blue-tint hover:bg-blue-tint'
                      )}
                    >
                      <td className="max-w-[280px] py-3 pl-6 pr-3">
                        <div className="truncate text-[15px] font-medium text-ink">{r.business_name || 'Business name not given'}</div>
                        <div className="truncate text-[13px] text-slate">
                          {[r.owner_name, r.email].filter(Boolean).join(' · ')}
                        </div>
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-3 text-[15px] tabular-nums text-ink lg:table-cell">
                        {r.seller_code}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-3 md:table-cell">
                        <div className="text-[15px] tabular-nums text-ink">{r.registration || '—'}</div>
                        <div className={cn('text-[13px]', NUMBER_TEXT[number.tone])}>{number.text}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <div className="text-[15px] tabular-nums text-ink">
                          {all ? `${r.documents.accepted} of 3 accepted` : `${r.documents.uploaded} of 3 uploaded`}
                        </div>
                        {r.documents.needs_fix ? (
                          <div className="text-[13px] text-[#DB7A2E]">
                            {r.documents.needs_fix} flagged for a new one
                          </div>
                        ) : null}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-3 md:table-cell">
                        <div className="text-[15px] text-ink">{friendlyTime(decidedTab ? r.decided_at : r.submitted_at)}</div>
                        {waiting && r.resubmitted_at ? (
                          <div className="text-[13px] text-slate">Fix sent {friendlyTime(r.resubmitted_at)}</div>
                        ) : decidedTab ? (
                          <div className="text-[13px] text-slate">Sent {friendlyTime(r.submitted_at)}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          {status === 'all' ? <Chip tone={STATUS_CHIP[r.status].tone}>{STATUS_CHIP[r.status].text}</Chip> : null}
                          {waiting && r.second_review ? <Chip tone="warn">Second review</Chip> : null}
                          {waiting && r.resubmitted_at && !r.second_review ? <Chip tone="info">Fix sent</Chip> : null}
                        </div>
                      </td>
                      <td className="py-3 pl-3 pr-6 text-right">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            patch({ application: r.id });
                          }}
                          aria-label={`${waiting ? 'Review' : 'Open'} ${r.business_name || 'application'}`}
                          className="inline-flex h-9 items-center rounded-[10px] bg-white px-3.5 text-[14px] font-medium text-ink ring-1 ring-line transition-colors duration-150 hover:bg-fill focus-visible:outline-2 focus-visible:outline-blue-brand"
                        >
                          {waiting ? 'Review' : 'Open'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows && paging.totalPages > 1 ? (
          <Pagination
            page={page}
            totalPages={paging.totalPages}
            total={paging.total}
            limit={30}
            onChange={p => patch({ page: p > 1 ? String(p) : null })}
          />
        ) : null}
      </SectionCard>

      <SellerApplicationSheet
        applicationId={openId}
        onClose={() => patch({ application: null }, true)}
        onChanged={() => {
          load();
          refreshQueues();
        }}
      />
    </div>
  );
}
