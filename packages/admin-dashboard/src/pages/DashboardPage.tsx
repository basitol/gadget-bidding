import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '@/api';
import { BrandIllustration } from '@/components/BrandIllustration';
import { BrandPill } from '@/components/BrandMark';
import { label, money, when } from '@/lib/format';
import {
  Badge,
  Empty,
  ErrorAlert,
  Panel,
  statusTone,
} from '@/components/shared';
import { InfiniteScroll } from '@/components/InfiniteScroll';
import { useInfiniteResource } from '@/hooks/usePagedResource';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

const accentStyles = {
  warn: 'border-l-amber-500 text-amber-700 dark:text-amber-400',
  danger: 'border-l-rose-500 text-rose-700 dark:text-rose-400',
  ok: 'border-l-emerald-500 text-emerald-700 dark:text-emerald-400',
  info: 'border-l-sky-500 text-sky-700 dark:text-sky-400',
  primary: 'border-l-primary text-primary',
  violet: 'border-l-violet-500 text-violet-700 dark:text-violet-400',
};

export function DashboardPage() {
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [statsError, setStatsError] = useState('');

  const activityFetcher = useCallback(
    (params: { page: number; limit: number }) => adminApi.activity(params),
    []
  );

  const {
    items: feed,
    hasMore,
    loading,
    loadingMore,
    error: feedError,
    loadMore,
  } = useInfiniteResource(activityFetcher, [], 20);

  useEffect(() => {
    adminApi
      .stats()
      .then(s => setStats(s.data))
      .catch(err => setStatsError(err.message));
  }, []);

  const attention = [
    {
      label: 'Gadgets awaiting review',
      value: stats?.pending_gadgets ?? 0,
      to: '/gadgets?status=pending',
      tone: 'warn' as const,
      accent: 'warn' as const,
    },
    {
      label: 'Orders missing shipping',
      value: stats?.missing_shipping ?? 0,
      to: '/orders?missing_shipping=true',
      tone: 'danger' as const,
      accent: 'danger' as const,
    },
    {
      label: 'Open disputes',
      value: stats?.open_disputes ?? 0,
      to: '/disputes?status=open',
      tone: 'danger' as const,
      accent: 'danger' as const,
    },
    {
      label: 'Pending payments',
      value: stats?.pending_payment_orders ?? 0,
      to: '/orders?payment_status=pending',
      tone: 'warn' as const,
      accent: 'warn' as const,
    },
  ];

  const metrics = [
    {
      label: 'Gross merchandise (paid)',
      value: stats ? money(stats.gmv) : '—',
      accent: 'primary' as const,
    },
    {
      label: 'Platform fees collected',
      value: stats ? money(stats.platform_fees) : '—',
      accent: 'violet' as const,
    },
    {
      label: 'Seller payouts',
      value: stats ? money(stats.seller_payouts) : '—',
      accent: 'ok' as const,
    },
    {
      label: 'Active auctions',
      value: stats?.active_auctions ?? '—',
      accent: 'info' as const,
    },
    {
      label: 'Users',
      value: stats?.total_users ?? '—',
      sub: `${stats?.buyers ?? 0} buyers · ${stats?.sellers ?? 0} sellers · ${stats?.new_users_7d ?? 0} new (7d)`,
      accent: 'primary' as const,
    },
    {
      label: 'Fulfillment',
      value: stats?.shipped_orders ?? 0,
      sub: `${stats?.processing_orders ?? 0} processing · ${stats?.delivered_orders ?? 0} delivered`,
      accent: 'info' as const,
    },
  ];

  const error = statsError || feedError;

  return (
    <>
      <div className="mb-8 overflow-hidden rounded-2xl bg-muted/60 lg:grid lg:min-h-[280px] lg:grid-cols-2">
        <div className="px-8 py-8 xl:px-12 xl:py-10">
          <BrandPill />
          <h1 className="mt-5 max-w-md text-4xl font-bold leading-tight tracking-tight text-foreground xl:text-5xl">
            Run the marketplace, calmly.
          </h1>
          <p className="mt-4 max-w-sm text-base leading-7 text-muted-foreground xl:text-lg">
            Live snapshot of listings, auctions, money movement, and risk —
            everything your team needs to keep GadgetBid moving.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/gadgets?status=pending">Review queue</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/payouts">Payouts</Link>
            </Button>
          </div>
        </div>
        <div className="relative hidden min-h-[220px] lg:block">
          <BrandIllustration compact />
        </div>
      </div>

      <ErrorAlert>{error}</ErrorAlert>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {attention.map(item => (
          <Link key={item.label} to={item.to}>
            <Card
              className={cn(
                'h-full rounded-2xl border-l-4 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md',
                accentStyles[item.accent]
              )}
            >
              <CardHeader className="pb-2">
                <CardDescription className="text-foreground/70">
                  {item.label}
                </CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  {item.value}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge tone={item.tone}>Needs attention</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map(item => (
          <Card
            key={item.label}
            className={cn(
              'rounded-2xl border-l-4 shadow-sm',
              accentStyles[item.accent]
            )}
          >
            <CardHeader className="pb-2">
              <CardDescription className="text-foreground/70">
                {item.label}
              </CardDescription>
              <CardTitle className="text-2xl">{item.value}</CardTitle>
            </CardHeader>
            {item.sub ? (
              <CardContent className="text-sm text-muted-foreground">
                {item.sub}
              </CardContent>
            ) : null}
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel>
          <div className="flex items-center justify-between border-b bg-muted/60 px-5 py-4">
            <strong className="text-sm font-medium">
              Recent platform activity
            </strong>
            <Button asChild variant="secondary" size="sm">
              <Link to="/audit">Audit log</Link>
            </Button>
          </div>
          {loading && feed.length === 0 ? (
            <Empty>Loading activity…</Empty>
          ) : feed.length === 0 ? (
            <Empty>No recent activity.</Empty>
          ) : (
            <InfiniteScroll
              className="max-h-[480px] overflow-y-auto"
              hasMore={hasMore}
              loading={loading}
              loadingMore={loadingMore}
              onLoadMore={loadMore}
            >
              <div className="divide-y">
                {feed.map(item => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-4 px-4 py-3 hover:bg-primary/5"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{item.title}</span>
                        <Badge tone={statusTone(item.status)}>
                          {label(item.status)}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {item.subtitle}
                        {item.meta ? ` · ${item.meta}` : ''}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm">
                      {item.amount != null ? (
                        <div className="font-medium text-primary">
                          {money(item.amount)}
                        </div>
                      ) : null}
                      <div className="text-muted-foreground">
                        {when(item.at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </InfiniteScroll>
          )}
        </Panel>

        <Panel>
          <div className="border-b bg-muted/60 px-5 py-4">
            <strong className="text-sm font-medium">Catalog health</strong>
          </div>
          <dl className="divide-y px-4">
            {[
              ['Pending', stats?.pending_gadgets ?? 0, 'text-amber-600'],
              ['Approved', stats?.approved_gadgets ?? 0, 'text-emerald-600'],
              ['Rejected', stats?.rejected_gadgets ?? 0, 'text-rose-600'],
              [
                'Scheduled auctions',
                stats?.scheduled_auctions ?? 0,
                'text-sky-600',
              ],
              ['Ended auctions', stats?.ended_auctions ?? 0, 'text-violet-600'],
              [
                'Paystack success / pending',
                `${stats?.payments_success ?? 0} / ${stats?.payments_pending ?? 0}`,
                'text-primary',
              ],
            ].map(([label, value, color]) => (
              <div
                key={String(label)}
                className="flex items-center justify-between py-3 text-sm"
              >
                <dt className="text-muted-foreground">{label}</dt>
                <dd className={cn('font-semibold', color)}>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2 border-t border-primary/10 p-4">
            <Button asChild variant="secondary" size="sm">
              <Link to="/auctions">Auctions</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to="/payments">Payments</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to="/payouts">Payouts</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to="/buyers">Buyers</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to="/sellers">Sellers</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to="/admins">Admins</Link>
            </Button>
          </div>
        </Panel>
      </div>
    </>
  );
}
