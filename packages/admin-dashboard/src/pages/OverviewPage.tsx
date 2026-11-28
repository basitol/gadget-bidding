import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Check, Circle, Hash, TrendingUp } from 'lucide-react';
import { adminApi, getStoredUser, sellerApplicationsApi, type ChecklistItem, type Overview, type SellerApplicationRow } from '@/api';
import { refreshQueues } from '@/hooks/useQueues';
import { connectAdminSocket } from '@/lib/socket';
import { compactMoney, friendlyTime, money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Seo } from '@/components/Seo';
import { Icon3d, type Icon3dName } from '@/components/shell/Icon3d';
import { AttentionTable, QueueChip, SectionCard } from '@/components/attention';
import { SalesChart } from '@/components/SalesChart';
import { Skeleton } from '@/components/ui/skeleton';
import { Bone, PageLoadError, SkeletonCard, StatCardSkeleton, usePageStatus } from '@/components/states';
import { UnderlineIndicator, useTabIndicator } from '@/components/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const TZ = 'Africa/Lagos';

const greeting = () => {
  const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const todayLabel = () =>
  new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });

const ago = (iso: string | undefined, now: number) => {
  if (!iso) return '';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
};

function useTick(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

/* ---------------- Pieces ---------------- */

function StatCard({
  icon,
  label,
  value,
  caption,
  chip,
  to,
}: {
  icon: Icon3dName;
  label: string;
  value: string;
  caption: string;
  chip?: ReactNode;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="gb-elev group flex flex-col rounded-[20px] border border-white/80 bg-white p-4 transition-transform duration-150 ease-out hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-blue-brand"
    >
      <div className="flex items-center gap-2.5">
        <span className="grid size-10 place-items-center rounded-[12px] bg-fill">
          <Icon3d name={icon} size={26} />
        </span>
        <span className="text-[14px] font-medium text-slate">{label}</span>
        {chip ? <span className="ml-auto">{chip}</span> : null}
      </div>
      <div className="mt-4 text-[26px] font-medium leading-none tracking-[-0.02em] text-ink tabular-nums">{value}</div>
      <div className="mt-2 text-[13px] text-slate">{caption}</div>
    </Link>
  );
}

type Metric = 'gmv' | 'bids' | 'users';
const METRICS: { key: Metric; label: string; title: string }[] = [
  { key: 'gmv', label: 'GMV', title: 'Gross sales' },
  { key: 'bids', label: 'Bids', title: 'Bids' },
  { key: 'users', label: 'Users', title: 'New users' },
];

function ChartCard({ series }: { series: Overview['series'] }) {
  const [metric, setMetric] = useState<Metric>('gmv');
  const total = series.reduce((sum, p) => sum + p[metric], 0);
  const m = METRICS.find(x => x.key === metric)!;
  const fmt = metric === 'gmv' ? compactMoney : (n: number) => Math.round(n).toLocaleString('en-NG');
  const totalText = metric === 'gmv' ? compactMoney(total) : total.toLocaleString('en-NG');
  return (
    <SectionCard
      icon={<TrendingUp className="size-[18px] text-blue-brand" />}
      title={m.title}
      meta={`${totalText} in 30 days`}
      right={
        <div role="radiogroup" aria-label="Chart" className="flex gap-1 rounded-[12px] bg-fill p-1">
          {METRICS.map(x => (
            <button
              key={x.key}
              type="button"
              role="radio"
              aria-checked={metric === x.key}
              onClick={() => setMetric(x.key)}
              className={cn(
                'h-8 rounded-[9px] px-3 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-blue-brand',
                metric === x.key ? 'gb-elev bg-white text-ink' : 'text-slate hover:text-ink'
              )}
            >
              {x.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="px-4 pb-4 pt-5">
        <SalesChart
          points={series.map(p => ({ date: p.date, value: p[metric] }))}
          format={fmt}
          label={`${m.title}: ${totalText} in the last 30 days`}
        />
      </div>
    </SectionCard>
  );
}

function AttentionCard({ data, now }: { data: Overview['attention']; now: number }) {
  return (
    <SectionCard
      icon={<AlertCircle className="size-[18px] text-[#DB7A2E]" />}
      title="Needs attention"
      meta={`${data.total} open`}
      right={
        data.total > data.items.length ? (
          <Link to="/tasks" className="text-[14px] font-medium text-blue-press hover:underline">
            See all {data.total}
          </Link>
        ) : null
      }
    >
      {data.items.length ? (
        <AttentionTable items={data.items} now={now} />
      ) : (
        <p className="px-6 py-8 text-[15px] text-slate">Nothing is waiting on the team. Every queue is clear.</p>
      )}
    </SectionCard>
  );
}

/* ---------------- Verification and Payments tabs ---------------- */

function ListRow({ title, sub, right, to }: { title: string; sub: string; right?: ReactNode; to: string }) {
  return (
    <li className="flex items-center gap-3 border-b border-line px-6 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium text-ink">{title}</div>
        <div className="truncate text-[13px] text-slate">{sub}</div>
      </div>
      {right}
      <Link
        to={to}
        className="inline-flex h-9 items-center rounded-[10px] bg-white px-3.5 text-[14px] font-medium text-ink ring-1 ring-line hover:bg-fill"
      >
        Review
      </Link>
    </li>
  );
}

function VerificationTab() {
  const [kyb, setKyb] = useState<{ rows: SellerApplicationRow[]; waiting: number } | null>(null);
  const [listings, setListings] = useState<any[] | null>(null);
  useEffect(() => {
    sellerApplicationsApi
      .list({ status: 'in_review' })
      .then(r => setKyb({ rows: (r.data ?? []).slice(0, 6), waiting: r.counts?.in_review ?? r.data?.length ?? 0 }))
      .catch(() => setKyb({ rows: [], waiting: 0 }));
    adminApi.gadgets({ status: 'pending', page: 1, limit: 6 }).then(r => setListings(r.data ?? [])).catch(() => setListings([]));
  }, []);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SectionCard
        icon={<Icon3d name="idcard" size={26} />}
        title="Seller KYB"
        meta={kyb ? `${kyb.waiting} waiting` : undefined}
        right={
          kyb && kyb.waiting > kyb.rows.length ? (
            <Link to="/sellers/applications" className="text-[14px] font-medium text-blue-press hover:underline">
              See all {kyb.waiting}
            </Link>
          ) : null
        }
      >
        {kyb === null ? (
          <Skeleton className="m-6 h-24" />
        ) : kyb.rows.length ? (
          <ul>
            {kyb.rows.map(a => (
              <ListRow
                key={a.id}
                title={a.business_name || a.owner_name || 'New seller'}
                sub={[
                  `Sent ${friendlyTime(a.submitted_at)}`,
                  a.registration,
                  a.second_review ? 'Second review' : a.resubmitted_at ? 'Fix sent' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                to={`/sellers/applications?application=${a.id}`}
              />
            ))}
          </ul>
        ) : (
          <p className="px-6 py-8 text-[15px] text-slate">No sellers waiting for verification.</p>
        )}
      </SectionCard>
      <SectionCard icon={<Icon3d name="phonecheck" size={26} />} title="Listing review" meta={listings ? `${listings.length} waiting` : undefined}>
        {listings === null ? (
          <Skeleton className="m-6 h-24" />
        ) : listings.length ? (
          <ul>
            {listings.map(g => (
              <ListRow
                key={g.id}
                title={g.title}
                sub={`${g.seller?.full_name ?? 'Seller'} · ${friendlyTime(g.created_at)}`}
                to={`/gadgets?status=pending&gadget=${g.id}`}
              />
            ))}
          </ul>
        ) : (
          <p className="px-6 py-8 text-[15px] text-slate">No listings waiting for review.</p>
        )}
      </SectionCard>
    </div>
  );
}

const PAYMENT_TINT: Record<string, 'green' | 'amber' | 'red' | 'blue'> = {
  success: 'green',
  pending: 'amber',
  failed: 'red',
  abandoned: 'red',
};

function PaymentsTab({ overview }: { overview: Overview }) {
  const [payments, setPayments] = useState<any[] | null>(null);
  useEffect(() => {
    adminApi.payments({ page: 1, limit: 8 }).then(r => setPayments(r.data ?? [])).catch(() => setPayments([]));
  }, []);
  const payoutsRow = overview.attention.items.find(i => i.kind === 'payouts');
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          icon="shield"
          label="Held in escrow"
          value={compactMoney(overview.stats.held_in_escrow)}
          caption={`${overview.stats.escrow_orders} order${overview.stats.escrow_orders === 1 ? '' : 's'} waiting for the buyer`}
          to="/payouts"
        />
        <StatCard
          icon="wallet"
          label="Payouts ready"
          value={String(overview.queues.payouts_ready)}
          caption={payoutsRow ? payoutsRow.sub : 'Nothing to release'}
          to="/payouts?status=ready"
        />
        <StatCard
          icon="autobid"
          label="Paid orders (30d)"
          value={String(overview.stats.paid_orders_30d)}
          caption={`${money(overview.stats.gross_sales_30d)} in total`}
          to="/orders"
        />
      </div>
      <SectionCard icon={<Icon3d name="wallet" size={26} />} title="Recent payments" right={<Link to="/payments" className="text-[14px] font-medium text-blue-press hover:underline">All payments</Link>}>
        {payments === null ? (
          <Skeleton className="m-6 h-24" />
        ) : payments.length ? (
          <ul>
            {payments.map(p => (
              <li key={p.id} className="flex items-center gap-3 border-b border-line px-6 py-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-medium text-ink">{p.user?.full_name || 'Customer'}</div>
                  <div className="truncate text-[13px] text-slate">
                    {p.reference || p.id.slice(0, 8)} · {friendlyTime(p.created_at)}
                  </div>
                </div>
                <QueueChip label={(p.status || 'pending').replace(/^\w/, (c: string) => c.toUpperCase())} tint={PAYMENT_TINT[p.status] ?? 'blue'} />
                <div className="w-28 text-right text-[15px] font-medium tabular-nums text-ink">{money(p.amount)}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-6 py-8 text-[15px] text-slate">No payments yet.</p>
        )}
      </SectionCard>
    </div>
  );
}

/* ---------------- Launch checklist ---------------- */

function LaunchChecklist() {
  const [data, setData] = useState<{ done: number; total: number; items: ChecklistItem[] } | null>(null);
  const load = useCallback(() => {
    adminApi.launchChecklist().then(r => setData(r.data)).catch(() => {});
  }, []);
  useEffect(load, [load]);
  if (!data || data.done === data.total) return null;
  return (
    <DropdownMenu onOpenChange={o => o && load()}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="gb-elev fixed bottom-6 right-6 z-30 flex h-12 items-center gap-2.5 rounded-full border border-white/80 bg-white pl-2 pr-2.5 text-[15px] font-medium text-ink focus-visible:outline-2 focus-visible:outline-blue-brand"
        >
          <span className="grid size-8 place-items-center rounded-full bg-[#FFF6EE]">
            <Icon3d name="tag" size={20} />
          </span>
          Launch checklist
          <span className="rounded-[8px] bg-blue-tint px-2 py-0.5 text-[13px] tabular-nums text-blue-press">
            {data.done}/{data.total}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-80 rounded-[18px] p-2">
        <DropdownMenuLabel className="px-2 pb-1 pt-2 font-normal">
          <div className="text-[15px] font-medium text-ink">Ready for launch</div>
          <div className="text-[13px] text-slate">
            {data.done} of {data.total} done. Read from live settings and data.
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ul className="py-1">
          {data.items.map(i => (
            <li key={i.key} className="flex gap-2.5 rounded-[10px] px-2 py-2">
              {i.done ? (
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#EEF9F2]">
                  <Check className="size-3 text-[#2E9E5E]" strokeWidth={3} />
                </span>
              ) : (
                <Circle className="mt-0.5 size-5 shrink-0 text-faint" />
              )}
              <div className="min-w-0">
                <div className={cn('text-[14px]', i.done ? 'text-slate' : 'font-medium text-ink')}>{i.label}</div>
                {!i.done ? <div className="text-[13px] text-slate">{i.hint}</div> : null}
              </div>
            </li>
          ))}
        </ul>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------------- Loading ---------------- */

/** The overview's shape while its numbers load: greeting card, six stat cards, tabs, the chart card. */
function OverviewSkeleton() {
  usePageStatus('Loading');
  return (
    <div aria-busy aria-label="Loading the overview" className="flex flex-col gap-4 pb-16">
      <SkeletonCard className="rounded-[24px] px-6 py-6">
        <div className="flex gap-2">
          <Bone className="h-[30px] w-40 rounded-[9px]" />
          <Bone className="h-[30px] w-32 rounded-[9px]" />
        </div>
        <div className="mt-5 flex items-center gap-5">
          <Bone className="size-16 rounded-[18px]" />
          <div className="flex flex-1 flex-col gap-2">
            <Bone className="h-8 w-80 max-w-full" />
            <Bone className="h-4 w-64 max-w-full" />
          </div>
        </div>
      </SkeletonCard>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <div className="mt-2 flex gap-8 border-b border-line pb-3">
        <Bone className="h-5 w-20" />
        <Bone className="h-5 w-24" />
        <Bone className="h-5 w-20" />
      </div>
      <SkeletonCard className="rounded-[24px] p-6">
        <Bone className="h-5 w-40" />
        <Bone className="mt-5 h-64 w-full rounded-[16px]" />
      </SkeletonCard>
    </div>
  );
}

/* ---------------- Page ---------------- */

type Tab = 'overview' | 'verification' | 'payments';

export function OverviewPage() {
  const user = getStoredUser();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  /** Kept so the error card can show the reference (status code). */
  const [failure, setFailure] = useState<unknown>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const tabBar = useRef<HTMLDivElement>(null);
  useTabIndicator(tabBar, tab);
  const now = useTick();

  const load = useCallback(() => {
    adminApi
      .overview()
      .then(r => {
        setData(r.data);
        setError('');
        setFailure(null);
      })
      .catch(err => {
        setError(err.message || "Couldn't load the overview");
        setFailure(err);
      });
  }, []);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 30_000);
    let debounce: number | null = null;
    const soon = () => {
      if (debounce) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        load();
        refreshQueues();
      }, 1500);
    };
    const socket = connectAdminSocket();
    socket?.on('bid:placed', soon);
    socket?.on('notification', soon);
    return () => {
      window.clearInterval(t);
      if (debounce) window.clearTimeout(debounce);
      socket?.off('bid:placed', soon);
      socket?.off('notification', soon);
    };
  }, [load]);

  const s = data?.stats;
  const firstName = user?.full_name?.split(/\s+/)[0] || 'there';

  // Nothing loaded yet: the page's shape, or the error if the first load failed.
  if (!data) {
    if (!failure) return <OverviewSkeleton />;
    return (
      <div className="pb-16 pt-1">
        <PageLoadError
          area="OVW"
          title="We couldn’t load the overview"
          error={failure}
          onRetry={() => {
            setFailure(null);
            load();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-16">
      <Seo title="Overview" description="Marketplace overview for the Gadgets Bidding team." path="/" />

      <section className="gb-elev rounded-[24px] border border-white/80 bg-white/70 px-6 py-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-[30px] items-center gap-1.5 rounded-[9px] bg-fill px-2.5 text-[13px] font-medium text-ink">
            <Hash className="size-3.5 text-blue-brand" strokeWidth={2.4} />
            Today · {todayLabel()}
          </span>
          <span className="inline-flex h-[30px] items-center gap-2 rounded-[9px] bg-fill px-2.5 text-[13px] font-medium text-ink" aria-live="polite">
            <span className={cn('size-2 rounded-full', error ? 'bg-[#D9536A]' : 'bg-blue-brand')} />
            {error ? 'Not updating · check your connection' : data ? `Live · updated ${ago(data.generated_at, now)}` : 'Loading…'}
          </span>
        </div>
        <div className="mt-5 flex items-center gap-5">
          <Icon3d name="gavel" size={64} />
          <div>
            <h1 className="text-[30px] font-medium leading-tight tracking-[-0.02em] text-ink">
              {greeting()}, {firstName}
            </h1>
            <p className="mt-1 text-[15px] text-slate">Marketplace overview · Computer Village hub</p>
          </div>
        </div>
      </section>


      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {s ? (
          <>
            <StatCard icon="wallet" label="Gross sales (30d)" value={compactMoney(s.gross_sales_30d)} caption="Paid orders, last 30 days" to="/payments" />
            <StatCard icon="gavel" label="Live auctions" value={s.live_auctions.toLocaleString('en-NG')} caption={`${s.ending_next_hour} ending in the next hour`} to="/auctions" />
            <StatCard icon="autobid" label="Bids today" value={s.bids_today.toLocaleString('en-NG')} caption="Updating live" to="/auctions" />
            <StatCard icon="shield" label="Held in escrow" value={compactMoney(s.held_in_escrow)} caption="Released after buyer confirms" to="/payouts" />
            <StatCard
              icon="idcard"
              label="KYB queue"
              value={String(s.kyb_queue)}
              caption="Businesses waiting for review"
              chip={s.kyb_queue ? <QueueChip label="Needs review" tint="amber" /> : null}
              to="/sellers/applications"
            />
            <StatCard
              icon="box"
              label="Inspection hub"
              value={String(s.at_hub)}
              caption="Devices at Computer Village"
              chip={s.at_hub ? <QueueChip label="At hub" tint="blue" /> : null}
              to="/backoffice"
            />
          </>
        ) : (
          Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[132px] rounded-[20px]" />)
        )}
      </div>

      <div ref={tabBar} role="tablist" aria-label="Overview sections" className="relative mt-2 flex gap-8 border-b border-line">
        <UnderlineIndicator />
        {(
          [
            ['overview', 'Overview'],
            ['verification', 'Verification'],
            ['payments', 'Payments'],
          ] as [Tab, string][]
        ).map(([key, text]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              '-mb-px border-b-2 border-transparent pb-3 text-[16px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-blue-brand',
              tab === key ? 'text-ink' : 'text-hint hover:text-ink'
            )}
          >
            {text}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        data ? (
          <>
            <ChartCard series={data.series} />
            <AttentionCard data={data.attention} now={now} />
          </>
        ) : (
          <Skeleton className="h-80 rounded-[24px]" />
        )
      ) : tab === 'verification' ? (
        <VerificationTab />
      ) : data ? (
        <PaymentsTab overview={data} />
      ) : null}

      <LaunchChecklist />
    </div>
  );
}
