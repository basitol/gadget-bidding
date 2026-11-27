import { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { adminApi, type AttentionItem } from '@/api';
import { AttentionTable, SectionCard } from '@/components/attention';
import { ErrorAlert, PageHeader } from '@/components/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const FILTERS: { key: 'all' | AttentionItem['kind']; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'kyb', label: 'Seller KYB' },
  { key: 'listing', label: 'Listing review' },
  { key: 'hub', label: 'Inspection hub' },
  { key: 'dispute', label: 'Disputes' },
  { key: 'payouts', label: 'Payouts' },
];

/** Everything waiting on the team across queues, soonest due first. */
export function TasksPage() {
  const [items, setItems] = useState<AttentionItem[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const load = () =>
      adminApi
        .tasks()
        .then(r => {
          setItems(r.data.items);
          setNow(Date.now());
          setError('');
        })
        .catch(err => setError(err.message || "Couldn't load tasks"));
    load();
    const t = window.setInterval(load, 30_000);
    return () => window.clearInterval(t);
  }, []);

  const shown = useMemo(() => (items ?? []).filter(i => filter === 'all' || i.kind === filter), [items, filter]);
  const countOf = (k: string) => (items ?? []).filter(i => k === 'all' || i.kind === k).length;

  return (
    <div>
      <PageHeader title="My tasks" description="Everything waiting on the team, soonest due first. Targets are on the Fees & rules page." path="/tasks" />
      <ErrorAlert>{error}</ErrorAlert>
      <div role="tablist" aria-label="Filter tasks" className="mb-4 flex flex-wrap gap-2">
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
            {items ? <span className="ml-1.5 tabular-nums opacity-70">{countOf(f.key)}</span> : null}
          </button>
        ))}
      </div>
      <SectionCard
        icon={<AlertCircle className="size-[18px] text-[#DB7A2E]" />}
        title="Needs attention"
        meta={items ? `${shown.length} open` : undefined}
      >
        {items === null ? (
          error ? <p className="px-6 py-8 text-[15px] text-slate">Tasks didn't load. Refresh the page to try again.</p> : <Skeleton className="m-6 h-40" />
        ) : shown.length ? (
          <AttentionTable items={shown} now={now} />
        ) : (
          <p className="px-6 py-8 text-[15px] text-slate">Nothing waiting here. This queue is clear.</p>
        )}
      </SectionCard>
    </div>
  );
}
