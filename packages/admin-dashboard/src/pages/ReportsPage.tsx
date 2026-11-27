import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { reportsApi, type ListingReport } from '@/api';
import { SectionCard } from '@/components/attention';
import { ErrorAlert, PageHeader } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { refreshQueues } from '@/hooks/useQueues';
import { friendlyTime, money } from '@/lib/format';
import { mediaUrl } from '@/lib/media';
import { cn } from '@/lib/utils';

const FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'actioned', label: 'Actioned' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: 'all', label: 'All' },
] as const;
type Filter = (typeof FILTERS)[number]['key'];

/** Status chips: tint + dark text, as everywhere in the admin. */
const REASON_TONE: Record<ListingReport['reason'], string> = {
  stolen: 'bg-[#FDF0F2] text-[#B23A50]',
  fake: 'bg-[#FFF6EE] text-[#A85A1C]',
  wrong_details: 'bg-[#F1F5FF] text-[#3E6AF0]',
  other: 'bg-fill text-slate',
};

/** Listings buyers reported. Reporters stay private to sellers; our team sees who. */
export function ReportsPage() {
  const [filter, setFilter] = useState<Filter>('open');
  const [rows, setRows] = useState<ListingReport[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    reportsApi
      .list(filter)
      .then(r => setRows(r.data))
      .catch(err => {
        setRows(prev => prev ?? []);
        setError(err.message || "Couldn't load reports");
      });
  }, [filter]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  return (
    <div className="pb-16">
      <PageHeader
        title="Listing reports"
        description="Listings buyers think are stolen, fake or described wrong. Check the listing, then take it down or dismiss the report. Sellers never see who reported them."
        path="/reports"
      />
      <ErrorAlert>{error}</ErrorAlert>
      <div role="tablist" aria-label="Filter reports" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'h-9 rounded-full px-4 text-[14px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-blue-brand',
              filter === f.key ? 'bg-ink text-white' : 'bg-white text-slate ring-1 ring-line hover:text-ink'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <SectionCard
        icon={<ShieldAlert className="size-[18px] text-[#D9536A]" />}
        title="Reports"
        meta={rows ? `${rows.length} ${filter === 'all' ? 'in total' : filter}` : undefined}
      >
        {rows === null ? (
          <Skeleton className="m-6 h-40" />
        ) : rows.length === 0 ? (
          <p className="px-6 py-8 text-[15px] text-slate">
            {filter === 'open' ? 'No open reports. Nothing needs checking right now.' : 'Nothing here.'}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map(r => (
              <ReportRow
                key={r.id}
                r={r}
                onDone={() => {
                  load();
                  refreshQueues();
                }}
              />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function ReportRow({ r, onDone }: { r: ListingReport; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'actioned' | 'dismissed' | null>(null);
  const a = r.auction;

  const resolve = async (status: 'actioned' | 'dismissed') => {
    setBusy(status);
    try {
      await reportsApi.resolve(r.id, status, note);
      toast.success(status === 'actioned' ? 'Marked as actioned' : 'Report dismissed');
      onDone();
    } catch (err: any) {
      toast.error(err.message || 'That did not work');
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-start md:gap-5">
      <div className="flex min-w-0 flex-1 gap-4">
        <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[12px] bg-[#F1F5FF]">
          {a?.image ? <img src={mediaUrl(a.image)} alt="" className="size-full object-cover" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-[8px] px-2 py-0.5 text-[12px] font-medium', REASON_TONE[r.reason])}>{r.reason_label}</span>
            {r.reports_on_listing > 1 ? (
              <span className="rounded-[8px] bg-[#FDF0F2] px-2 py-0.5 text-[12px] font-medium text-[#B23A50]">
                {r.reports_on_listing} reports on this listing
              </span>
            ) : null}
            <span className="text-[13px] text-hint">{friendlyTime(r.created_at)}</span>
          </div>
          <p className="mt-1.5 truncate text-[15px] font-medium text-ink">{a?.title ?? 'Listing removed'}</p>
          {a ? (
            <p className="text-[13px] text-slate">
              {a.seller.name ?? 'Seller'} ({a.seller.code}) · {money(a.current_price)} · {a.status}
            </p>
          ) : null}
          {r.details ? <p className="mt-2 text-[14px] text-ink">“{r.details}”</p> : null}
          <p className="mt-1 text-[12px] text-hint">
            Reported by {r.reporter.name ?? 'a buyer'}
            {r.reporter.email ? ` · ${r.reporter.email}` : ''}
          </p>
          {r.status !== 'open' ? (
            <p className="mt-2 text-[13px] text-slate">
              {r.status === 'actioned' ? 'Actioned' : 'Dismissed'}
              {r.reviewed_by ? ` by ${r.reviewed_by}` : ''}
              {r.reviewed_at ? ` · ${friendlyTime(r.reviewed_at)}` : ''}
              {r.resolution_note ? ` — ${r.resolution_note}` : ''}
            </p>
          ) : null}
        </div>
      </div>
      {r.status === 'open' ? (
        <div className="flex w-full flex-col gap-2 md:w-[320px]">
          <Textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="What you checked or did (5+ characters)"
            aria-label="Note about this report"
            className="min-h-[68px]"
          />
          <div className="flex gap-2">
            {a ? (
              <Button asChild variant="secondary" size="sm">
                <Link to={`/auctions?search=${encodeURIComponent(a.title)}`}>Open listing</Link>
              </Button>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              disabled={note.trim().length < 5 || !!busy}
              onClick={() => resolve('dismissed')}
            >
              {busy === 'dismissed' ? 'Saving…' : 'Dismiss'}
            </Button>
            <Button size="sm" disabled={note.trim().length < 5 || !!busy} onClick={() => resolve('actioned')}>
              {busy === 'actioned' ? 'Saving…' : 'Mark actioned'}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
