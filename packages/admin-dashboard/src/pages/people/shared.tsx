import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { peopleApi, type PersonNote, type PersonStatus, type RestrictionView } from '@/api';
import { Chip, initialsOf, Note, redOutline, secondary } from '@/components/SellerApplicationPanel';
import { Badge, type Tone } from '@/components/shared';
import { Icon3d, type Icon3dName } from '@/components/shell/Icon3d';
import { Bone, RowsSkeleton, SkeletonCard, TableSkeleton, usePageStatus } from '@/components/states';
import { PillIndicator, UnderlineIndicator, useTabIndicator } from '@/components/tabs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { friendlyTime } from '@/lib/format';
import { TINTS, type Tint } from '@/lib/nav';
import { cn } from '@/lib/utils';

/** "› Loading" in the breadcrumb while it's on screen (a child, so an error card's "› Error" isn't overwritten). */
export function LoadingStatus() {
  usePageStatus('Loading');
  return null;
}

/* ---------------- Formats ---------------- */

const TZ = 'Africa/Lagos';
const lagosDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });

/** 18240 → "18,240" */
export const num = (n: number | null | undefined) => Number(n || 0).toLocaleString('en-NG');

/** "Mar 2025" */
export const monthYear = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: TZ }) : '—';

/** "Dec 4" this year, "Dec 4, 2027" otherwise. */
export const dayMonth = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const sameYear =
    d.toLocaleDateString('en-US', { year: 'numeric', timeZone: TZ }) ===
    new Date().toLocaleDateString('en-US', { year: 'numeric', timeZone: TZ });
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: TZ,
  });
};

/** "Today", "Yesterday", "Nov 20, 2026", "—". */
export const dayLabel = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (lagosDay(d) === lagosDay(new Date())) return 'Today';
  if (lagosDay(d) === lagosDay(new Date(Date.now() - 86_400_000))) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ });
};

/** An auction's end: "in 24m", "in 5h", "Dec 2", "Ended". */
export const endsLabel = (iso: string, now = Date.now()) => {
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return 'Ended';
  const m = Math.max(1, Math.round(diff / 60_000));
  if (m < 60) return `in ${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `in ${h}h` : dayMonth(iso);
};

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export const plural = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`;

export const errorText = (e: unknown) =>
  e instanceof Error && e.message ? e.message.replace(/\.?$/, '.') : 'Something went wrong. Try again.';

/* ---------------- Chips ---------------- */

export const PERSON_STATUS: Record<PersonStatus, { text: string; tone: Tone }> = {
  active: { text: 'Active', tone: 'ok' },
  suspended: { text: 'Suspended', tone: 'danger' },
  listings_paused: { text: 'Listings paused', tone: 'warn' },
  store_closed: { text: 'Store closed', tone: 'neutral' },
  bidding_paused: { text: 'Bidding paused', tone: 'warn' },
  pending_approval: { text: 'Waiting for approval', tone: 'info' },
};

export function StatusChip({ status }: { status: PersonStatus }) {
  const s = PERSON_STATUS[status] ?? { text: status, tone: 'neutral' as Tone };
  return <Chip tone={s.tone}>{s.text}</Chip>;
}

/** Status chip that also has the Seller · Refunded tint (violet). */
export type ChipTone = Tone | 'violet';
export function TintChip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  if (tone !== 'violet') return <Chip tone={tone}>{children}</Chip>;
  return (
    <Badge tone="neutral" className="h-[30px] rounded-[9px] bg-[#F5F2FF] px-2.5 text-[13px] font-medium text-[#7C68E8]">
      {children}
    </Badge>
  );
}

/* ---------------- Buttons ---------------- */

/** Row buttons are the 36px admin size. */
export const rowSecondary = cn(secondary, 'h-9 px-3.5');
export const primary =
  'h-10 rounded-[10px] px-4 text-[14px] focus-visible:outline-2 focus-visible:outline-blue-brand';
export const rowPrimary = cn(primary, 'h-9 px-3.5');
export const rowRed = cn(redOutline, 'h-9 px-3.5');

/** A link that looks like the secondary button. */
export function LinkButton({
  to,
  children,
  className,
  label,
}: {
  to: string;
  children: ReactNode;
  className?: string;
  /** Read out instead of the text: "Open order GV-21031". */
  label?: string;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      className={cn(
        'inline-flex h-9 items-center rounded-[10px] border border-line bg-white px-3.5 text-[14px] font-medium text-ink transition-colors duration-150 hover:bg-fill focus-visible:outline-2 focus-visible:outline-blue-brand',
        className
      )}
    >
      {children}
    </Link>
  );
}

/* ---------------- People ---------------- */

const AVATAR_TINTS: Tint[] = ['amber', 'blue', 'violet', 'green', 'teal'];
const tintFor = (seed: string) => {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TINTS[AVATAR_TINTS[h % AVATAR_TINTS.length]];
};

/** Round initials in a soft tint (same person, same colour). */
export function Avatar({ name, seed }: { name: string; seed: string }) {
  const t = tintFor(seed);
  return (
    <span
      aria-hidden
      className="grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-medium"
      style={{ backgroundColor: t.bg, color: t.fg }}
    >
      {initialsOf(name)}
    </span>
  );
}

/** The big initials tile on a detail page: violet for sellers (seller identity), blue for buyers. */
export function PersonTile({ name, type }: { name: string; type: 'buyer' | 'seller' }) {
  const t = TINTS[type === 'seller' ? 'violet' : 'blue'];
  return (
    <span
      aria-hidden
      className="grid size-20 shrink-0 place-items-center rounded-[18px] text-[26px] font-medium tracking-[-0.02em]"
      style={{ backgroundColor: t.bg, color: t.fg }}
    >
      {initialsOf(name)}
    </span>
  );
}

/** A person in a table: initials, name (a link when `to` is set) and email. */
export function PersonCell({ id, name, email, to }: { id: string; name: string; email: string | null; to?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={name} seed={id} />
      <div className="min-w-0">
        {to ? (
          <Link
            to={to}
            className="block truncate rounded text-[14px] font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-blue-brand"
          >
            {name}
          </Link>
        ) : (
          <div className="truncate text-[14px] font-medium text-ink">{name}</div>
        )}
        <div className="truncate text-[13px] text-slate">{email || 'No email'}</div>
      </div>
    </div>
  );
}

/* ---------------- Stat cards ---------------- */

/** Stat card (design guide › Cards): icon tile + label, the number, a caption. Clickable when `onClick` is set. */
export function StatCard({
  icon,
  label,
  value,
  caption,
  onClick,
  actionLabel,
}: {
  icon: Icon3dName;
  label: string;
  value: string;
  caption: string;
  onClick?: () => void;
  /** Read out for the clickable card: "Suspend Tolu Kareem". */
  actionLabel?: string;
}) {
  const body = (
    <>
      <span className="flex items-center gap-2.5">
        <span className="grid size-10 place-items-center rounded-[12px] bg-fill">
          <Icon3d name={icon} size={26} />
        </span>
        <span className="text-[14px] font-medium text-slate">{label}</span>
      </span>
      <span className="mt-4 text-[26px] font-medium leading-none tracking-[-0.02em] text-ink tabular-nums">{value}</span>
      <span className="mt-2 truncate text-[13px] text-slate" title={caption}>
        {caption}
      </span>
    </>
  );
  const cls = 'gb-elev flex min-w-0 flex-col rounded-[20px] border border-white/80 bg-white p-4 text-left';
  if (!onClick) return <div className={cls}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={actionLabel ? `${label}: ${value}. ${caption}. ${actionLabel}` : undefined}
      className={cn(
        cls,
        'transition-transform duration-150 ease-out hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-blue-brand'
      )}
    >
      {body}
    </button>
  );
}

/* ---------------- Tabs ---------------- */

export type TabItem<K extends string> = { key: K; label: string; count?: number | null; to?: string };

/** Underlined tabs (design guide › Tabs): Blue 500 underline and Ink text on the active one, a count when it helps. */
export function UnderlineTabs<K extends string>({
  label,
  items,
  active,
  onSelect,
  idBase,
}: {
  label: string;
  items: TabItem<K>[];
  active: K;
  onSelect?: (key: K) => void;
  /** Set when the tabs control panels on this page (ids for aria-controls). */
  idBase?: string;
}) {
  const bar = useRef<HTMLDivElement>(null);
  useTabIndicator(bar, active, `underline:${label}`);
  return (
    <div ref={bar} role="tablist" aria-label={label} className="relative flex flex-wrap gap-x-8 gap-y-2 border-b border-line">
      <UnderlineIndicator />
      {items.map(t => {
        const on = t.key === active;
        // The blue line is drawn by UnderlineIndicator so it can slide; each tab keeps a clear border for spacing.
        const cls = cn(
          '-mb-px flex h-11 items-center gap-2 border-b-2 border-transparent text-[15px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-blue-brand',
          on ? 'text-ink' : 'text-hint hover:text-ink'
        );
        const inner = (
          <>
            {t.label}
            {t.count != null ? (
              <span
                className={cn(
                  'rounded-[8px] px-1.5 text-[13px] leading-5 tabular-nums transition-colors duration-150',
                  on ? 'bg-blue-tint text-blue-press' : 'bg-fill text-slate'
                )}
              >
                {num(t.count)}
              </span>
            ) : null}
          </>
        );
        return t.to ? (
          <Link key={t.key} to={t.to} role="tab" aria-selected={on} className={cls}>
            {inner}
          </Link>
        ) : (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={idBase ? `${idBase}-tab-${t.key}` : undefined}
            aria-controls={idBase && on ? `${idBase}-panel-${t.key}` : undefined}
            aria-selected={on}
            onClick={() => onSelect?.(t.key)}
            className={cls}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Segmented tabs (Users list): a quiet Fill tray with one white pill for the open tab. Its count sits in a
 * solid blue badge; the others are grey. Each tab is a link to its own address.
 */
export function SegmentedTabs<K extends string>({
  label,
  items,
  active,
}: {
  label: string;
  items: (TabItem<K> & { to: string })[];
  active: K;
}) {
  const bar = useRef<HTMLDivElement>(null);
  useTabIndicator(bar, active, `segmented:${label}`);
  return (
    <div
      ref={bar}
      role="tablist"
      aria-label={label}
      className="relative inline-flex max-w-full flex-wrap gap-1 self-start rounded-[18px] border border-line bg-fill p-1"
    >
      {/* The white pill slides between tabs. */}
      <PillIndicator />
      {items.map(t => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            to={t.to}
            role="tab"
            aria-selected={on}
            className={cn(
              'relative flex h-10 items-center gap-2 rounded-[14px] px-4 text-[15px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-blue-brand',
              on ? 'text-ink' : 'text-slate hover:text-ink'
            )}
          >
            {t.label}
            {t.count != null ? (
              <span
                className={cn(
                  'grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[13px] leading-none tabular-nums transition-colors duration-150',
                  on ? 'bg-blue-brand text-white' : 'bg-line text-slate'
                )}
              >
                {num(t.count)}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

/* ---------------- Tables ---------------- */

export const th = 'px-3 py-3 text-[13px] font-medium uppercase tracking-[0.04em] text-slate';
export const td = 'px-3 py-3.5 align-middle';

/** Plain-words message inside a card. */
export function EmptyRows({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="max-w-md text-[14px] text-slate">{children}</p>
      {action}
    </div>
  );
}

/** A tab whose rows didn't load. */
export function RowsError({ error, onRetry, what }: { error: unknown; onRetry: () => void; what: string }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <p className="max-w-md text-[14px] text-ink">
        We couldn’t load {what}. <span className="text-slate">{errorText(error)}</span>
      </p>
      <Button variant="outline" className={secondary} onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/**
 * Rows for one tab of a detail page: loads when the tab opens and again when `key` changes
 * (after a suspend, a restore or a new note). Stale answers are dropped.
 */
export function useRows<T>(load: () => Promise<{ data: T[] }>, key: string) {
  const loadRef = useRef(load);
  loadRef.current = load;
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setError(null);
    loadRef
      .current()
      .then(r => live && setRows(r.data))
      .catch(e => live && setError(e));
    return () => {
      live = false;
    };
  }, [key, attempt]);
  return { rows, error, setRows, retry: () => setAttempt(a => a + 1) };
}

/** Loading, error or the rows. */
export function RowsState<T>({
  state,
  what,
  empty,
  children,
}: {
  state: { rows: T[] | null; error: unknown; retry: () => void };
  /** "orders" for "We couldn't load orders." */
  what: string;
  empty: string;
  children: (rows: T[]) => ReactNode;
}) {
  if (state.rows === null) {
    return state.error ? <RowsError error={state.error} what={what} onRetry={state.retry} /> : <RowsSkeleton rows={4} />;
  }
  if (state.rows.length === 0) return <EmptyRows>{empty}</EmptyRows>;
  return <>{children(state.rows)}</>;
}

/** Item thumbnail (radius 12, Fill behind). */
export function Thumb({ src, alt }: { src: string | null; alt: string }) {
  return (
    <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[12px] bg-fill">
      {src ? <img src={src} alt={alt} className="size-full object-cover" loading="lazy" /> : null}
    </span>
  );
}

/* ---------------- Detail page header ---------------- */

export function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="min-w-0 lg:border-l lg:border-line lg:pl-5 lg:first:border-l-0 lg:first:pl-0">
      <dt className="text-[14px] text-slate">{k}</dt>
      <dd className="mt-2 flex h-[30px] items-center text-[19px] font-medium tracking-[-0.01em] text-ink tabular-nums">
        {children}
      </dd>
    </div>
  );
}

/** Header card (design guide › Layout › Detail pages): chips, actions, the person, a note, the facts. */
export function PersonHeader({
  chips,
  actions,
  tile,
  name,
  sub,
  note,
  facts,
}: {
  chips: ReactNode;
  actions: ReactNode;
  tile: ReactNode;
  name: string;
  sub: string;
  note?: ReactNode;
  facts: ReactNode;
}) {
  return (
    <section className="gb-elev rounded-[24px] border border-white/80 bg-white/90 px-6 py-6">
      <div className="flex flex-wrap items-center gap-2">
        {chips}
        <div className="ml-auto flex flex-wrap gap-2">{actions}</div>
      </div>
      <div className="mt-5 flex min-w-0 items-center gap-5">
        {tile}
        <div className="min-w-0">
          <h1 className="truncate text-[30px] font-medium leading-tight tracking-[-0.02em] text-ink">{name}</h1>
          {sub ? <p className="mt-1 text-[16px] text-slate">{sub}</p> : null}
        </div>
      </div>
      {note ? <div className="mt-5">{note}</div> : null}
      <dl className="mt-6 grid grid-cols-2 gap-x-5 gap-y-5 border-t border-line pt-5 sm:grid-cols-3 lg:grid-cols-6">
        {facts}
      </dl>
    </section>
  );
}

/** What's in place on this person: why, until, by (and the note left with it). */
export function RestrictionNote({ restriction }: { restriction: RestrictionView }) {
  const r = restriction;
  const what = r.kind === 'suspend' ? 'Suspended' : r.close_store ? 'Store closed' : 'Listings paused';
  const until = r.until ? `until ${dayMonth(r.until)}` : r.kind === 'suspend' ? 'no end date' : 'until fixed';
  const line = [until, r.by ? `by ${r.by}` : 'automatic'].join(' · ').replace(/^./, c => c.toUpperCase());
  if (r.status === 'pending') {
    return (
      <Note tone="info" title={`Waiting for ${r.approver ?? 'a second admin'} to approve · ${r.reason_label}`}>
        {r.by
          ? `${r.by} asked to ${r.kind === 'suspend' ? 'suspend them' : 'pause their listings'}.`
          : 'This is waiting for a second admin.'}
        {r.note ? ` “${r.note}”` : ''}
      </Note>
    );
  }
  return (
    <Note tone={r.kind === 'suspend' ? 'danger' : 'warn'} title={`${what} · ${r.reason_label}`}>
      {line}
      {r.note ? <span className="text-slate"> · “{r.note}”</span> : null}
    </Note>
  );
}

/** Detail page placeholder: the header card, the tabs and a table. */
export function DetailSkeleton() {
  return (
    <div aria-busy aria-label="Loading" className="flex flex-col gap-6 pb-16">
      <SkeletonCard className="rounded-[24px] px-6 py-6">
        <div className="flex gap-2">
          <Bone className="h-[30px] w-16 rounded-[9px]" />
          <Bone className="h-[30px] w-16 rounded-[9px]" />
          <Bone className="ml-auto h-10 w-40 rounded-[10px]" />
        </div>
        <div className="mt-5 flex items-center gap-5">
          <Bone className="size-20 rounded-[18px]" />
          <div className="flex flex-1 flex-col gap-2">
            <Bone className="h-8 w-64 max-w-full" />
            <Bone className="h-4 w-80 max-w-full" />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-5 border-t border-line pt-5 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Bone className="h-3.5 w-20" />
              <Bone className="h-6 w-16" />
            </div>
          ))}
        </div>
      </SkeletonCard>
      <div className="flex gap-8 border-b border-line pb-3">
        <Bone className="h-5 w-20" />
        <Bone className="h-5 w-24" />
        <Bone className="h-5 w-20" />
      </div>
      <TableSkeleton rows={4} />
    </div>
  );
}

/* ---------------- Notes ---------------- */

const NOTE_KIND: Record<Exclude<PersonNote['kind'], 'note'>, { text: string; tone: Tone }> = {
  suspend: { text: 'Suspended', tone: 'danger' },
  pause: { text: 'Listings paused', tone: 'warn' },
  restore: { text: 'Restored', tone: 'ok' },
};

/** Team notes on a person, newest first, and a box to add one. */
export function NotesPanel({ personId, refreshKey, onAdded }: { personId: string; refreshKey: string; onAdded: () => void }) {
  const ids = useId();
  const state = useRows(() => peopleApi.notes(personId), `${personId}|${refreshKey}`);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const check = (v: string) => (v.trim().length < 5 ? 'Write at least 5 characters.' : '');

  const save = async () => {
    const problem = check(body);
    setError(problem);
    if (problem) return;
    setBusy(true);
    try {
      const r = await peopleApi.addNote(personId, body.trim());
      state.setRows(prev => [r.data, ...(prev ?? [])]);
      setBody('');
      onAdded();
      toast.success('Note saved', { description: 'The team sees it here.' });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2 border-b border-line px-6 py-5">
        <Label htmlFor={`${ids}-note`} className="text-[14px] text-ink">
          Add a note
        </Label>
        <Textarea
          id={`${ids}-note`}
          value={body}
          maxLength={1000}
          aria-invalid={!!error}
          aria-describedby={`${ids}-hint`}
          placeholder="e.g. Called them about the unpaid order. They’ll pay by Friday."
          onChange={e => {
            setBody(e.target.value);
            if (error && !check(e.target.value)) setError('');
          }}
          onBlur={() => body && setError(check(body))}
          className="min-h-[80px] rounded-[12px] bg-white text-[14px] placeholder:text-faint"
        />
        <div className="flex flex-wrap items-center gap-3">
          <p id={`${ids}-hint`} className={cn('flex-1 text-[13px]', error ? 'text-[#D9536A]' : 'text-slate')}>
            {error || 'Only the team sees notes.'}
          </p>
          <Button variant="outline" className={secondary} disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save note'}
          </Button>
        </div>
      </div>
      <RowsState state={state} what="notes" empty="No notes yet.">
        {rows => (
          <ul>
            {rows.map(n => (
              <li key={n.id} className="border-b border-line px-6 py-4 last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium text-ink">{n.author ?? 'Automatic'}</span>
                  <span className="text-[13px] text-hint">{friendlyTime(n.created_at)}</span>
                  {n.kind !== 'note' ? (
                    <span className="ml-auto">
                      <Chip tone={NOTE_KIND[n.kind].tone}>{NOTE_KIND[n.kind].text}</Chip>
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 whitespace-pre-line text-[14px] text-ink">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </RowsState>
    </div>
  );
}
