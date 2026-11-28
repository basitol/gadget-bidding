import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TriangleAlert, WifiOff } from 'lucide-react';
import { ApiError, checkConnection, getNetState, onNetChange, reportPageError, type NetState } from '@/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/*
 * Page states from the admin design board: Offline (banner), Error (card with a reference),
 * Loading (skeletons shaped like the page). The breadcrumb ends in the state's name.
 */

const TZ = 'Africa/Lagos';
const clock = (ms: number, seconds = false) =>
  new Date(ms)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', ...(seconds ? { second: '2-digit', hour12: false } : {}), timeZone: TZ })
    .toLowerCase();

/* ---------------- Breadcrumb status: "Payouts & escrow › Error" ---------------- */

/** "Not found" replaces the breadcrumb (the address may look like a real page's). */
export type PageStatus = 'Loading' | 'Error' | 'Not found' | null;
const PageStatusContext = createContext<(status: PageStatus) => void>(() => {});
export const PageStatusProvider = PageStatusContext.Provider;

/** Shows "› Loading" or "› Error" after the breadcrumb while `status` is set. */
export function usePageStatus(status: PageStatus) {
  const set = useContext(PageStatusContext);
  useEffect(() => {
    set(status);
    return () => set(null);
  }, [status, set]);
}

/** The page's own last crumb: "Users › Kemi Nwosu", "Users › Pause GameHub NG". */
const PageCrumbContext = createContext<(crumb: string | null) => void>(() => {});
export const PageCrumbProvider = PageCrumbContext.Provider;

/** Ends the breadcrumb with `crumb` (replacing the page's own title) while it's set. */
export function usePageCrumb(crumb: string | null) {
  const set = useContext(PageCrumbContext);
  useEffect(() => {
    set(crumb);
    return () => set(null);
  }, [crumb, set]);
}

/* ---------------- Offline ---------------- */

/** Whether the API can be reached (updates as requests succeed or fail). */
export function useNetState() {
  const [state, setState] = useState<NetState>(getNetState);
  useEffect(() => onNetChange(setState), []);
  return state;
}

/**
 * Amber banner while the API can't be reached. Pages keep what they last loaded; anything that
 * saves (approvals, payouts, refunds) fails until it's back. "Try again" asks the API and, when it
 * answers, reloads the page's data.
 */
export function OfflineBanner({ onBack }: { onBack: () => void }) {
  const net = useNetState();
  const [checking, setChecking] = useState(false);
  const [stillDown, setStillDown] = useState(false);

  // While it's down, look again every 20 seconds and whenever the computer reconnects.
  useEffect(() => {
    if (!net.down) return;
    setStillDown(false);
    const again = () => checkConnection().then(ok => ok && onBack());
    const t = window.setInterval(again, 20_000);
    window.addEventListener('online', again);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('online', again);
    };
  }, [net.down, onBack]);

  if (!net.down) return null;
  const since = net.lastOkAt ? `Showing data from ${clock(net.lastOkAt)}.` : 'Nothing has loaded yet.';
  const title = net.reason === 'offline' ? 'You’re offline.' : 'We can’t reach Gadgets Bidding.';

  const retry = async () => {
    setChecking(true);
    const ok = await checkConnection();
    setChecking(false);
    if (ok) onBack();
    else setStillDown(true);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 flex flex-wrap items-center gap-3 rounded-[12px] border border-[#F6DCC4] bg-[#FFF6EE] px-4 py-3"
    >
      <WifiOff className="size-4 shrink-0 text-[#DB7A2E]" aria-hidden />
      <p className="min-w-0 flex-1 text-[14px] text-[#9A5A1F]">
        <span className="font-medium text-[#DB7A2E]">{title}</span> {since} Approvals, payouts and refunds can’t be saved
        until {net.reason === 'offline' ? 'you reconnect' : 'it’s back'}.
        {stillDown ? <span className="text-[#9A5A1F]"> Still not reachable.</span> : null}
      </p>
      <Button
        variant="outline"
        disabled={checking}
        onClick={retry}
        className="h-9 rounded-[10px] border-line bg-white px-3.5 text-[14px] text-ink hover:bg-fill focus-visible:outline-2 focus-visible:outline-blue-brand"
      >
        {checking ? 'Checking…' : 'Try again'}
      </Button>
    </div>
  );
}

/* ---------------- Error ---------------- */

/** Short area codes for references: GB-PAY-504. */
export type ErrorArea = 'OVW' | 'PAY' | 'USR' | 'KYB' | 'ORD' | 'LST';

/**
 * A page whose data didn't load. Says what didn't load and what that means, gives a reference
 * (recorded in the audit log when the API is up), and offers Try again.
 */
export function PageLoadError({
  area,
  title,
  reassurance = 'Nothing was changed.',
  error,
  onRetry,
}: {
  area: ErrorArea;
  /** "We couldn't load payouts" */
  title: string;
  /** What didn't happen, e.g. "No money has moved — nothing was paid twice." */
  reassurance?: string;
  error: unknown;
  onRetry: () => void;
}) {
  usePageStatus('Error');
  const status = error instanceof ApiError ? error.status : 0;
  const unreachable = error instanceof ApiError && error.code === 'NETWORK';
  const [at] = useState(() => Date.now());
  const reference = `GB-${area}-${unreachable && !status ? 'NET' : String(status || 500).padStart(3, '0')}`;
  const [logged, setLogged] = useState<boolean | null>(null);
  const reported = useRef(false);
  const [retrying, setRetrying] = useState(false);

  // Record it once, unless we couldn't reach the API in the first place.
  useEffect(() => {
    if (reported.current || unreachable) return;
    reported.current = true;
    reportPageError({
      reference,
      page: window.location.pathname,
      status,
      message: error instanceof Error ? error.message : String(error),
    }).then(setLogged);
  }, [reference, status, unreachable, error]);

  const why = unreachable
    ? 'We can’t reach Gadgets Bidding right now.'
    : status >= 500
      ? 'The server didn’t respond properly.'
      : error instanceof Error && error.message
        ? error.message.replace(/\.?$/, '.')
        : 'Something went wrong.';

  return (
    <section
      role="alert"
      className="gb-elev rounded-[24px] border border-white/80 bg-white/90 px-6 pb-6 pt-5"
    >
      <div className="flex items-start gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-[#FDF0F2] text-[#D9536A]">
          <TriangleAlert className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">{title}</h2>
          <p className="mt-0.5 text-[14px] text-slate">
            {why} {reassurance}
          </p>
        </div>
      </div>
      <div className="mt-6 flex flex-col items-center gap-3">
        <span className="rounded-[8px] bg-fill px-2.5 py-1 text-[13px] tabular-nums text-slate">
          Error {reference} · {clock(at, true)}
          {logged ? ' · logged' : ''}
        </span>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            disabled={retrying}
            onClick={async () => {
              setRetrying(true);
              if (unreachable) await checkConnection();
              setRetrying(false);
              onRetry();
            }}
            className="h-10 rounded-[10px] px-4 text-[14px] focus-visible:outline-2 focus-visible:outline-blue-brand"
          >
            {retrying ? 'Trying…' : 'Try again'}
          </Button>
          {logged ? (
            <Button
              asChild
              variant="outline"
              className="h-10 rounded-[10px] border-line bg-white px-4 text-[14px] text-ink hover:bg-fill focus-visible:outline-2 focus-visible:outline-blue-brand"
            >
              <Link to="/audit?action=page_load_error">View audit log</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* ---------------- Loading ---------------- */

/** A grey placeholder line or block (Fill colour, gently pulsing). */
export function Bone({ className }: { className?: string }) {
  return <Skeleton className={cn('rounded-[8px] bg-fill', className)} />;
}

/** White card the placeholders sit in, like the real card. */
export function SkeletonCard({ className, children }: { className?: string; children?: ReactNode }) {
  return <div className={cn('gb-elev rounded-[20px] border border-white/80 bg-white/90 p-5', className)}>{children}</div>;
}

/** Stat card placeholder: icon tile, label, the big number, a caption. */
export function StatCardSkeleton() {
  return (
    <SkeletonCard className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Bone className="size-9 rounded-[12px]" />
        <Bone className="h-4 w-28" />
      </div>
      <Bone className="h-7 w-36" />
      <Bone className="h-3.5 w-48" />
    </SkeletonCard>
  );
}

/** Placeholder table rows: an avatar, two lines of text, a couple of cells and a button. */
export function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-line px-6 py-4 last:border-0">
          <Bone className="size-9 rounded-[10px]" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Bone className="h-3.5 w-48 max-w-[60%]" />
            <Bone className="h-3 w-32 max-w-[40%]" />
          </div>
          <Bone className="hidden h-3.5 w-20 md:block" />
          <Bone className="hidden h-3.5 w-16 md:block" />
          <Bone className="h-8 w-16 rounded-[10px]" />
        </div>
      ))}
    </div>
  );
}

/** Table placeholder: a title row then the rows. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <SkeletonCard className="rounded-[24px] p-0">
      <div className="flex items-center gap-3 border-b border-line px-6 py-4">
        <Bone className="size-10 rounded-[12px]" />
        <Bone className="h-4 w-40" />
        <Bone className="ml-auto h-9 w-44 rounded-[10px]" />
      </div>
      <RowsSkeleton rows={rows} />
    </SkeletonCard>
  );
}

/** While a page's code loads: a header, a row of cards and a table, shaped like most pages. */
export function PageSkeleton() {
  usePageStatus('Loading');
  return (
    <div aria-busy className="flex flex-col gap-4 pb-16 pt-1" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <Bone className="h-8 w-64" />
        <Bone className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <TableSkeleton />
    </div>
  );
}
