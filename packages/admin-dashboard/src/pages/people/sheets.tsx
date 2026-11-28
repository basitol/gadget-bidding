import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import {
  peopleApi,
  sellerApplicationsApi,
  type EmailPreview,
  type PauseDuration,
  type PauseReason,
  type PersonStatus,
  type RestoreReason,
  type RestrictedRow,
  type RestrictionPreview,
  type RestrictionView,
  type SellerApplicationDocument,
  type SellerDocumentKind,
  type SuspendDuration,
  type SuspendReason,
} from '@/api';
import { BusinessInitials, Note, docChip, redOutline, secondary } from '@/components/SellerApplicationPanel';
import { Bone } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { friendlyTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { StatusChip, dayMonth, errorText, firstName, monthYear, primary } from './shared';

/* ---------------- What a sheet is opened for ---------------- */

export type PersonRef = {
  id: string;
  name: string;
  email?: string | null;
  type: 'buyer' | 'seller';
  status: PersonStatus;
};

/** What's in place, from a Suspended row (for automatic and older ones the preview may not have it). */
export type RestrictionFallback = {
  why: string | null;
  until: string | null;
  by: string | null;
  source?: RestrictedRow['source'];
};

export type SheetAction =
  | { kind: 'suspend'; person: PersonRef; reason?: SuspendReason }
  | { kind: 'pause'; person: PersonRef }
  | { kind: 'restore'; person: PersonRef; fallback?: RestrictionFallback };

/** The breadcrumb while a sheet is open: "Suspend Tolu Kareem", "Pause GameHub NG", "Restore Chuka Obi". */
export const sheetCrumb = (a: SheetAction) =>
  `${a.kind === 'suspend' ? 'Suspend' : a.kind === 'pause' ? 'Pause' : 'Restore'} ${a.person.name}`;

/** Buyers by first name ("Suspend Tolu"), stores by their whole name ("Restore GameHub NG"). */
const callName = (p: PersonRef) => (p.type === 'buyer' ? firstName(p.name) : p.name);

/**
 * The Suspend, Pause listings and Restore sheets for one person. The form lives inside the sheet's
 * content, so it starts fresh every time the sheet opens. Closing is blocked while it saves.
 */
export function PersonSheets({
  action,
  onClose,
  onDone,
}: {
  action: SheetAction | null;
  onClose: () => void;
  /** Saved: refresh what's on the page (the sheet closes itself). */
  onDone: () => void;
}) {
  // Keep the last one on screen while the sheet slides away.
  const [shown, setShown] = useState(action);
  useEffect(() => {
    if (action) setShown(action);
  }, [action]);
  const a = action ?? shown;
  const [busy, setBusy] = useState(false);
  const done = () => {
    setBusy(false);
    onClose();
    onDone();
  };

  return (
    <Sheet open={!!action} onOpenChange={o => !o && !busy && onClose()}>
      {a ? (
        <SheetContent showCloseButton={false} className={sheetClass}>
          {a.kind === 'suspend' ? (
            <SuspendForm person={a.person} preset={a.reason} onBusy={setBusy} onDone={done} onClose={onClose} />
          ) : a.kind === 'pause' ? (
            <PauseForm person={a.person} onBusy={setBusy} onDone={done} onClose={onClose} />
          ) : (
            <RestoreForm person={a.person} fallback={a.fallback} onBusy={setBusy} onDone={done} onClose={onClose} />
          )}
        </SheetContent>
      ) : null}
    </Sheet>
  );
}

/* ---------------- Sheet pieces ---------------- */

const sheetClass =
  'gap-0 overflow-hidden border-line bg-white p-0 data-[side=right]:sm:max-w-xl';

function SheetHead({ name, title, sub }: { name: string; title: string; sub: string }) {
  return (
    <SheetHeader className="flex-row items-center gap-3 border-b border-line px-6 py-5">
      <BusinessInitials name={name} size={48} />
      <div className="min-w-0 flex-1">
        <SheetTitle className="text-[19px] font-medium leading-snug tracking-[-0.01em] text-ink">{title}</SheetTitle>
        <SheetDescription className="truncate text-[14px] text-slate">{sub}</SheetDescription>
      </div>
      <SheetClose asChild>
        <Button
          variant="outline"
          aria-label="Close"
          className="size-9 shrink-0 rounded-[10px] border-line bg-white p-0 text-ink hover:bg-fill focus-visible:outline-2 focus-visible:outline-blue-brand"
        >
          <X className="size-4" aria-hidden />
        </Button>
      </SheetClose>
    </SheetHeader>
  );
}

function SheetBody({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
      <div className="flex flex-col gap-6">{children}</div>
    </div>
  );
}

/** Sticky footer: a note on the left (why it's disabled, or what went wrong), then Cancel and the action. */
function SheetFoot({ note, error, children }: { note?: string; error?: string; children: ReactNode }) {
  return (
    <SheetFooter className="mt-0 flex-row flex-wrap items-center justify-end gap-2 border-t border-line bg-white px-6 py-4">
      {error ? (
        <p role="alert" className="mr-auto min-w-0 flex-1 text-[13px] text-[#D9536A]">
          {error}
        </p>
      ) : note ? (
        <p className="mr-auto min-w-0 flex-1 text-[13px] text-slate">{note}</p>
      ) : null}
      {children}
    </SheetFooter>
  );
}

type Option<K extends string> = { key: K; title: string; sub?: string };

/** Selectable cards (native radios, so arrow keys work). */
function Choices<K extends string>({
  legend,
  options,
  value,
  onChange,
  error,
}: {
  legend: string;
  options: Option<K>[];
  value: K | null;
  onChange: (key: K) => void;
  error?: string;
}) {
  const ids = useId();
  return (
    <fieldset aria-describedby={error ? `${ids}-error` : undefined}>
      <legend className="mb-2 text-[14px] font-medium text-ink">{legend}</legend>
      <div className="flex flex-col gap-2">
        {options.map(o => {
          const on = value === o.key;
          return (
            <label
              key={o.key}
              className={cn(
                'flex cursor-pointer flex-col rounded-[12px] border px-4 py-3 transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue-brand',
                on ? 'border-blue-brand bg-blue-tint' : 'border-line bg-white hover:bg-fill'
              )}
            >
              <input
                type="radio"
                name={`${ids}-choice`}
                value={o.key}
                checked={on}
                onChange={() => onChange(o.key)}
                className="sr-only"
              />
              <span className="text-[14px] font-medium text-ink">{o.title}</span>
              {o.sub ? <span className="mt-0.5 text-[13px] text-slate">{o.sub}</span> : null}
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={`${ids}-error`} className="mt-2 text-[13px] text-[#D9536A]">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** "How long?": three equal choices, the picked one filled with Ink. */
function Segmented<K extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  const ids = useId();
  return (
    <fieldset>
      <legend className="mb-2 text-[14px] font-medium text-ink">{legend}</legend>
      <div className="grid grid-cols-3 gap-2">
        {options.map(o => {
          const on = value === o.key;
          return (
            <label
              key={o.key}
              className={cn(
                'flex h-10 cursor-pointer items-center justify-center rounded-[10px] border px-2 text-center text-[14px] font-medium transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue-brand',
                on ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:bg-fill'
              )}
            >
              <input
                type="radio"
                name={`${ids}-segment`}
                value={o.key}
                checked={on}
                onChange={() => onChange(o.key)}
                className="sr-only"
              />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Needed (10+ characters) when the reason is "Something else"; otherwise optional. */
const checkNote = (required: boolean, v: string) =>
  required && v.trim().length < 10 ? 'Say what happened, in at least 10 characters.' : '';

function AuditNote({
  value,
  onChange,
  required,
  placeholder,
  error,
  setError,
}: {
  value: string;
  onChange: (v: string) => void;
  required: boolean;
  placeholder: string;
  error: string;
  setError: (v: string) => void;
}) {
  const ids = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${ids}-note`} className="text-[14px] text-ink">
        Note for the audit log
      </Label>
      <Textarea
        id={`${ids}-note`}
        value={value}
        maxLength={500}
        aria-invalid={!!error}
        aria-describedby={`${ids}-hint`}
        placeholder={placeholder}
        onChange={e => {
          onChange(e.target.value);
          if (error && !checkNote(required, e.target.value)) setError('');
        }}
        onBlur={() => value && setError(checkNote(required, value))}
        className="min-h-[88px] rounded-[12px] bg-white text-[14px] placeholder:text-faint"
      />
      <p id={`${ids}-hint`} className={cn('text-[13px]', error ? 'text-[#D9536A]' : 'text-slate')}>
        {error ||
          (required
            ? 'Needed for “Something else”: at least 10 characters.'
            : 'Optional. It goes in the audit log, not in the email.')}
      </p>
    </div>
  );
}

/** "What happens", red for suspend and pause, green for restore. */
function WhatHappens({ tone, items }: { tone: 'danger' | 'ok'; items: string[] | null }) {
  return (
    <div className={cn('rounded-[12px] px-4 py-3', tone === 'ok' ? 'bg-[#EEF9F2]' : 'bg-[#FDF0F2]')}>
      <p className="text-[14px] font-medium text-ink">What happens</p>
      {items ? (
        <ul className="mt-1.5 flex flex-col gap-1 text-[14px] text-slate">
          {items.map(i => (
            <li key={i} className="flex gap-2">
              <span aria-hidden>•</span>
              <span>{i}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-2 flex flex-col gap-2" aria-busy aria-label="Loading">
          <Bone className="h-3.5 w-64 max-w-full bg-white/70" />
          <Bone className="h-3.5 w-52 max-w-full bg-white/70" />
          <Bone className="h-3.5 w-60 max-w-full bg-white/70" />
        </div>
      )}
    </div>
  );
}

/** What suspending or pausing would do right now (live bids, live auctions, a second admin). */
function usePreview(id: string, kind: 'suspend' | 'pause_listings') {
  const [preview, setPreview] = useState<RestrictionPreview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setError(null);
    peopleApi
      .preview(id, kind)
      .then(r => live && setPreview(r.data))
      .catch(e => live && setError(e));
    return () => {
      live = false;
    };
  }, [id, kind, attempt]);
  return { preview, error, retry: () => setAttempt(a => a + 1) };
}

function PreviewError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[12px] bg-[#FDF0F2] px-4 py-3">
      <p className="min-w-0 flex-1 text-[14px] text-ink">
        We couldn’t check what this would change. <span className="text-slate">{errorText(error)}</span>
      </p>
      <Button variant="outline" className={cn(secondary, 'h-9')} onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/** "kemi.n@example.com · Buyer since Jan 2025" */
const sinceLine = (person: PersonRef, p: RestrictionPreview | null) => {
  const type = (p?.type ?? person.type) === 'seller' ? 'Seller' : 'Buyer';
  const joined = p?.joined_at ? `${type} since ${monthYear(p.joined_at)}` : type;
  return [p?.email ?? person.email ?? null, joined].filter(Boolean).join(' · ');
};

/** The email they get, refreshed when the reason or the length changes; the full one in a dialog. */
function EmailBox({
  personId,
  name,
  params,
}: {
  personId: string;
  name: string;
  params: { kind: 'suspend' | 'pause_listings' | 'restore'; reason: string; duration?: string };
}) {
  const ids = useId();
  const [email, setEmail] = useState<EmailPreview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const key = `${params.kind}|${params.reason}|${params.duration ?? ''}`;

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    peopleApi
      .emailPreview(personId, paramsRef.current)
      .then(r => live && setEmail(r.data))
      .catch(e => live && setError(e))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [personId, key, attempt]);

  return (
    <section aria-labelledby={`${ids}-title`} className="rounded-[12px] border border-line bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <h3 id={`${ids}-title`} className="text-[13px] font-medium uppercase tracking-[0.04em] text-slate">
          Email they get
        </h3>
        {email ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-auto rounded text-[13px] font-medium text-blue-press hover:underline focus-visible:outline-2 focus-visible:outline-blue-brand"
          >
            See full email
          </button>
        ) : null}
      </div>
      {email ? (
        <div aria-busy={loading} className={cn('transition-opacity duration-150', loading && 'opacity-60')}>
          <p className="mt-1.5 text-[14px] font-medium text-ink">{email.subject}</p>
          <p className="mt-0.5 text-[13px] text-slate">{email.summary}</p>
        </div>
      ) : error && !loading ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-[13px] text-slate">We couldn’t load the email.</p>
          <button
            type="button"
            onClick={() => setAttempt(a => a + 1)}
            className="rounded text-[13px] font-medium text-blue-press hover:underline focus-visible:outline-2 focus-visible:outline-blue-brand"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-2" aria-busy aria-label="Loading the email">
          <Bone className="h-4 w-48" />
          <Bone className="h-3.5 w-72 max-w-full" />
        </div>
      )}

      <Dialog open={open && !!email} onOpenChange={setOpen}>
        <DialogContent className="gap-0 overflow-hidden rounded-[24px] p-0 sm:max-w-[720px]">
          <div className="border-b border-line px-6 py-5 pr-12">
            <DialogTitle className="text-[19px] font-medium leading-snug tracking-[-0.01em] text-ink">
              {email?.subject}
            </DialogTitle>
            <DialogDescription className="mt-1 text-[14px] text-slate">
              The email {name} gets when you confirm.
            </DialogDescription>
          </div>
          {email ? (
            <iframe
              title={`Email to ${name}: ${email.subject}`}
              srcDoc={email.html}
              sandbox=""
              className="h-[min(600px,70vh)] w-full bg-white"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** Toast for a saved suspension or pause: done, or sent to a second admin. */
function announce(
  result: { status: 'active' | 'pending'; restriction: RestrictionView },
  done: string,
  description: string
) {
  if (result.status === 'pending') {
    toast.success(`Sent to ${result.restriction.approver ?? 'a second admin'} to approve`, {
      description: 'Nothing changes until they approve it.',
    });
  } else {
    toast.success(done, { description });
  }
}

type FormProps = {
  person: PersonRef;
  onBusy: (busy: boolean) => void;
  onDone: () => void;
  onClose: () => void;
};

/* ---------------- Suspend (buyers) ---------------- */

const SUSPEND_DURATIONS: { key: SuspendDuration; label: string }[] = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'permanent', label: 'Permanent' },
];

function SuspendForm({ person, preset, onBusy, onDone, onClose }: FormProps & { preset?: SuspendReason }) {
  const { preview, error: previewError, retry } = usePreview(person.id, 'suspend');
  const [reason, setReason] = useState<SuspendReason | null>(preset ?? null);
  const picked = useRef(!!preset);
  const [duration, setDuration] = useState<SuspendDuration>('7d');
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');
  const suggested = preview?.suggested_reason === 'missed_payments';

  // The automatic suggestion (3 missed payments) is picked for them unless they already chose.
  useEffect(() => {
    if (suggested && !picked.current) setReason('missed_payments');
  }, [suggested]);

  const reasons: Option<SuspendReason>[] = [
    {
      key: 'missed_payments',
      title: '3 missed payments in 90 days',
      sub: suggested ? 'Won and didn’t pay — automatic suggestion' : 'Won and didn’t pay',
    },
    { key: 'shill_bidding', title: 'Shill bidding', sub: 'Bidding up a seller’s items' },
    { key: 'abusive', title: 'Abusive to staff or sellers' },
    { key: 'fraud', title: 'Fake account or stolen card', sub: 'Payment fraud' },
    { key: 'other', title: 'Something else' },
  ];

  const liveBids = preview?.live_bids ?? 0;
  const happens = preview
    ? [
        'They’re signed out and can’t bid or pay',
        ...(liveBids > 0
          ? [liveBids === 1 ? 'Their 1 live bid is withdrawn' : `Their ${liveBids} live bids are withdrawn`]
          : []),
        'Orders they already paid for still get delivered',
        'They can appeal by replying to the email',
      ]
    : null;

  const submit = async () => {
    const rErr = reason ? '' : 'Pick why you’re suspending them.';
    const nErr = checkNote(reason === 'other', note);
    setReasonError(rErr);
    setNoteError(nErr);
    if (!reason || rErr || nErr) return;
    setBusy(true);
    onBusy(true);
    setFailed('');
    try {
      const r = await peopleApi.suspend(person.id, { reason, duration, note: note.trim() || undefined });
      announce(r.data, `${person.name} is suspended`, 'We’ve emailed them. They can appeal by replying.');
      onDone();
    } catch (e) {
      setFailed(errorText(e));
      setBusy(false);
      onBusy(false);
    }
  };

  return (
    <>
      <SheetHead name={person.name} title={`Suspend ${person.name}?`} sub={sinceLine(person, preview)} />
      <SheetBody>
        <Choices
          legend="Why?"
          options={reasons}
          value={reason}
          error={reasonError}
          onChange={k => {
            picked.current = true;
            setReason(k);
            setReasonError('');
            if (noteError && !checkNote(k === 'other', note)) setNoteError('');
          }}
        />
        <Segmented legend="How long?" options={SUSPEND_DURATIONS} value={duration} onChange={setDuration} />
        <AuditNote
          value={note}
          onChange={setNote}
          required={reason === 'other'}
          placeholder="e.g. Missed GV-20877, GV-20901 and GV-20933 this month"
          error={noteError}
          setError={setNoteError}
        />
        {previewError && !preview ? <PreviewError error={previewError} onRetry={retry} /> : null}
        <WhatHappens tone="danger" items={happens} />
        <EmailBox
          personId={person.id}
          name={person.name}
          params={{ kind: 'suspend', reason: reason ?? '', duration }}
        />
      </SheetBody>
      <SheetFoot error={failed}>
        <Button variant="outline" className={secondary} disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button variant="outline" className={redOutline} disabled={busy} onClick={submit}>
          {busy ? 'Suspending…' : `Suspend ${callName(person)}`}
        </Button>
      </SheetFoot>
    </>
  );
}

/* ---------------- Pause listings (sellers) ---------------- */

const PAUSE_REASONS: Option<PauseReason>[] = [
  { key: 'failed_inspections', title: 'Too many failed inspections', sub: 'Items didn’t match their listings' },
  { key: 'misleading', title: 'Fake or misleading listings', sub: 'Stock photos, wrong specs' },
  { key: 'stolen', title: 'Possible stolen goods', sub: 'Flagged IMEI or serial' },
  { key: 'documents', title: 'Business documents expired', sub: 'CAC or ID needs updating' },
  { key: 'other', title: 'Something else' },
];

const PAUSE_DURATIONS: { key: PauseDuration; label: string }[] = [
  { key: 'until_fixed', label: 'Until fixed' },
  { key: '30d', label: '30 days' },
  { key: 'close_store', label: 'Close store' },
];

function PauseForm({ person, onBusy, onDone, onClose }: FormProps) {
  const { preview, error: previewError, retry } = usePreview(person.id, 'pause_listings');
  const [reason, setReason] = useState<PauseReason | null>(null);
  const [duration, setDuration] = useState<PauseDuration>('until_fixed');
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');

  const second = !!preview?.needs_second_admin;
  const noApprover = second && !preview?.approver;
  const auctions = preview?.live_auctions ?? 0;
  const happens = preview
    ? [
        ...(auctions > 0
          ? [
              auctions === 1
                ? 'Their live auction is paused — bidders are told'
                : `All ${auctions} live auctions are paused — bidders are told`,
            ]
          : []),
        'New listings are blocked',
        'Orders already sold still go through the hub',
        'Payouts are held until you restore them',
        ...(duration === 'close_store' ? ['Their store closes and they can’t sign in'] : []),
      ]
    : null;

  const submit = async () => {
    const rErr = reason ? '' : 'Pick why you’re pausing their listings.';
    const nErr = checkNote(reason === 'other', note);
    setReasonError(rErr);
    setNoteError(nErr);
    if (!reason || rErr || nErr) return;
    setBusy(true);
    onBusy(true);
    setFailed('');
    try {
      const r = await peopleApi.pauseListings(person.id, { reason, duration, note: note.trim() || undefined });
      announce(
        r.data,
        duration === 'close_store' ? `${person.name}’s store is closed` : `Listings paused for ${person.name}`,
        'We’ve emailed them. Payouts are held until you restore them.'
      );
      onDone();
    } catch (e) {
      setFailed(errorText(e));
      setBusy(false);
      onBusy(false);
    }
  };

  const footNote = !preview
    ? previewError
      ? undefined
      : 'Checking their auctions and escrow…'
    : noApprover
      ? 'Add another admin first.'
      : undefined;

  return (
    <>
      <SheetHead name={person.name} title={`Pause listings for ${person.name}?`} sub={sinceLine(person, preview)} />
      <SheetBody>
        <Choices
          legend="Why?"
          options={PAUSE_REASONS}
          value={reason}
          error={reasonError}
          onChange={k => {
            setReason(k);
            setReasonError('');
            if (noteError && !checkNote(k === 'other', note)) setNoteError('');
          }}
        />
        <Segmented legend="How long?" options={PAUSE_DURATIONS} value={duration} onChange={setDuration} />
        <AuditNote
          value={note}
          onChange={setNote}
          required={reason === 'other'}
          placeholder="e.g. Two phones this week didn’t match their listings"
          error={noteError}
          setError={setNoteError}
        />
        {previewError && !preview ? <PreviewError error={previewError} onRetry={retry} /> : null}
        <WhatHappens tone="danger" items={happens} />
        <EmailBox
          personId={person.id}
          name={person.name}
          params={{ kind: 'pause_listings', reason: reason ?? '', duration }}
        />
        {second ? (
          <Note
            tone="warn"
            title={
              preview?.approver
                ? `Sellers with live auctions or money in escrow need a second admin to approve. We’ll send it to ${preview.approver}.`
                : 'Sellers with live auctions or money in escrow need a second admin to approve, and there’s no other admin yet.'
            }
          />
        ) : null}
      </SheetBody>
      <SheetFoot error={failed} note={footNote}>
        <Button variant="outline" className={secondary} disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button variant="outline" className={redOutline} disabled={busy || !preview || noApprover} onClick={submit}>
          {busy ? (second ? 'Sending…' : 'Pausing…') : second ? 'Send for approval' : 'Pause listings'}
        </Button>
      </SheetFoot>
    </>
  );
}

/* ---------------- Restore ---------------- */

function KV({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 border-b border-line py-2.5 last:border-0">
      <dt className="text-[14px] text-slate">{k}</dt>
      <dd className="min-w-0 text-right text-[14px] font-medium text-ink">{children}</dd>
    </div>
  );
}

function RestoreForm({ person, fallback, onBusy, onDone, onClose }: FormProps & { fallback?: RestrictionFallback }) {
  const paused = person.type === 'seller' && person.status !== 'suspended';
  const { preview, error: previewError, retry } = usePreview(person.id, paused ? 'pause_listings' : 'suspend');
  const [reason, setReason] = useState<RestoreReason | null>(null);
  const [reasonError, setReasonError] = useState('');
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');

  const reasons: Option<RestoreReason>[] = [
    { key: 'served', title: 'Time served / they’ve paid', sub: 'The issue that caused it is fixed' },
    {
      key: 'mistake',
      title: paused ? 'Paused by mistake' : 'Suspended by mistake',
      sub: 'Our error — we’ll apologise in the email',
    },
    { key: 'appeal', title: 'Appeal accepted', sub: 'They sent evidence that changes things' },
  ];

  // What's in place: the preview's restriction, else the Suspended row (automatic and older ones).
  const r = preview?.restriction ?? null;
  const known = !!r || !!fallback || !!preview;
  const automatic = fallback?.source === 'automatic' || (!r && person.status === 'bidding_paused');
  const why = r?.reason_label ?? fallback?.why ?? (person.status === 'bidding_paused' ? 'Missed payments' : '—');
  const until = r
    ? r.until
      ? dayMonth(r.until)
      : r.kind === 'suspend'
        ? 'No end date'
        : r.close_store
          ? 'Store closed'
          : 'Until fixed'
    : fallback?.until
      ? dayMonth(fallback.until)
      : '—';
  const by = r ? (r.by ?? 'Automatic') : (fallback?.by ?? (automatic ? 'Automatic' : '—'));

  const happens = paused
    ? [
        'Their paused auctions start again with the time they had left',
        'New listings and payouts start again',
        ...(person.status === 'store_closed' ? ['Their store opens again and they can sign in'] : []),
        'The record stays in Audit logs',
      ]
    : [
        'They can sign in and bid again straight away',
        'Nothing that was cancelled comes back',
        'The record stays in Audit logs',
      ];

  const submit = async () => {
    const rErr = reason ? '' : 'Pick why you’re restoring them.';
    setReasonError(rErr);
    if (!reason) return;
    setBusy(true);
    onBusy(true);
    setFailed('');
    try {
      await peopleApi.restore(person.id, { reason, note: note.trim() || undefined });
      toast.success(`${person.name} is restored`, {
        description: paused
          ? 'We’ve emailed them. Their listings and payouts start again.'
          : 'We’ve emailed them. They can bid again.',
      });
      onDone();
    } catch (e) {
      setFailed(errorText(e));
      setBusy(false);
      onBusy(false);
    }
  };

  return (
    <>
      <SheetHead name={person.name} title={`Restore ${person.name}?`} sub={sinceLine(person, preview)} />
      <SheetBody>
        <dl className="rounded-[12px] border border-line px-4">
          <KV k="Status">
            <StatusChip status={person.status} />
          </KV>
          {known ? (
            <>
              <KV k="Why">{why}</KV>
              <KV k="Until">{until}</KV>
              <KV k="By">{by}</KV>
            </>
          ) : (
            ['Why', 'Until', 'By'].map(k => (
              <KV key={k} k={k}>
                <Bone className="h-4 w-24" />
              </KV>
            ))
          )}
        </dl>
        {previewError && !preview && !fallback ? <PreviewError error={previewError} onRetry={retry} /> : null}
        <Choices
          legend="Why are you restoring them?"
          options={reasons}
          value={reason}
          error={reasonError}
          onChange={k => {
            setReason(k);
            setReasonError('');
          }}
        />
        <AuditNote
          value={note}
          onChange={setNote}
          required={false}
          placeholder="e.g. Paid the outstanding order on Nov 28"
          error={noteError}
          setError={setNoteError}
        />
        <WhatHappens tone="ok" items={happens} />
        <EmailBox personId={person.id} name={person.name} params={{ kind: 'restore', reason: reason ?? '' }} />
      </SheetBody>
      <SheetFoot error={failed}>
        <Button variant="outline" className={secondary} disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button className={primary} disabled={busy} onClick={submit}>
          {busy ? 'Restoring…' : `Restore ${callName(person)}`}
        </Button>
      </SheetFoot>
    </>
  );
}

/* ---------------- Request documents (approved sellers) ---------------- */

/**
 * Ask an approved seller for an updated document (an expired ID, an old proof of address). They stay
 * approved and keep selling; the new copy shows up in Seller KYB to check.
 */
export function RequestDocumentsSheet({
  open,
  seller,
  onClose,
  onDone,
}: {
  open: boolean;
  seller: { name: string; seller_code: string; application_id: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onOpenChange={o => !o && !busy && onClose()}>
      <SheetContent showCloseButton={false} className={sheetClass}>
        <RequestDocumentsForm
          seller={seller}
          onBusy={setBusy}
          onClose={onClose}
          onDone={() => {
            setBusy(false);
            onClose();
            onDone();
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

function RequestDocumentsForm({
  seller,
  onBusy,
  onClose,
  onDone,
}: {
  seller: { name: string; seller_code: string; application_id: string };
  onBusy: (busy: boolean) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const ids = useId();
  const [docs, setDocs] = useState<SellerApplicationDocument[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [kind, setKind] = useState<SellerDocumentKind | null>(null);
  const [kindError, setKindError] = useState('');
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');

  useEffect(() => {
    let live = true;
    setLoadError(null);
    sellerApplicationsApi
      .get(seller.application_id)
      .then(r => live && setDocs(r.data.documents))
      .catch(e => live && setLoadError(e));
    return () => {
      live = false;
    };
  }, [seller.application_id, attempt]);

  const check = (v: string) => (v.trim().length < 5 ? 'Say what they should update, in at least 5 characters.' : '');

  const submit = async () => {
    const kErr = kind ? '' : 'Pick the document they should update.';
    const nErr = check(note);
    setKindError(kErr);
    setNoteError(nErr);
    if (!kind || kErr || nErr) return;
    setBusy(true);
    onBusy(true);
    setFailed('');
    try {
      await sellerApplicationsApi.reviewDocument(seller.application_id, kind, 'needs_fix', note);
      const label = docs?.find(d => d.kind === kind)?.label ?? 'document';
      toast.success(`Asked ${seller.name} for a new ${label.toLowerCase()}`, {
        description: 'They stay approved and keep selling.',
      });
      onDone();
    } catch (e) {
      setFailed(errorText(e));
      setBusy(false);
      onBusy(false);
    }
  };

  return (
    <>
      <SheetHead
        name={seller.name}
        title={`Ask ${seller.name} for a new document`}
        sub={`Seller · ${seller.seller_code}`}
      />
      <SheetBody>
        <Note tone="info" title="They stay approved and keep selling">
          We tell them straight away and they upload a new copy. You check it in Seller KYB.
        </Note>
        {docs ? (
          <Choices
            legend="Which document?"
            options={docs.map(d => ({
              key: d.kind,
              title: d.label,
              sub: [docChip(d).text, d.uploaded_at ? `uploaded ${friendlyTime(d.uploaded_at)}` : null]
                .filter(Boolean)
                .join(' · '),
            }))}
            value={kind}
            error={kindError}
            onChange={k => {
              setKind(k);
              setKindError('');
            }}
          />
        ) : loadError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[12px] bg-[#FDF0F2] px-4 py-3">
            <p className="min-w-0 flex-1 text-[14px] text-ink">
              We couldn’t load their documents. <span className="text-slate">{errorText(loadError)}</span>
            </p>
            <Button variant="outline" className={cn(secondary, 'h-9')} onClick={() => setAttempt(a => a + 1)}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2" aria-busy aria-label="Loading their documents">
            <Bone className="h-4 w-32" />
            <Bone className="h-16 w-full rounded-[12px]" />
            <Bone className="h-16 w-full rounded-[12px]" />
            <Bone className="h-16 w-full rounded-[12px]" />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${ids}-note`} className="text-[14px] text-ink">
            What should they update?
          </Label>
          <Textarea
            id={`${ids}-note`}
            value={note}
            maxLength={300}
            aria-invalid={!!noteError}
            aria-describedby={`${ids}-hint`}
            placeholder="e.g. Your ID card has expired. Send one that’s still valid."
            onChange={e => {
              setNote(e.target.value);
              if (noteError && !check(e.target.value)) setNoteError('');
            }}
            onBlur={() => note && setNoteError(check(note))}
            className="min-h-[88px] rounded-[12px] bg-white text-[14px] placeholder:text-faint"
          />
          <p id={`${ids}-hint`} className={cn('text-[13px]', noteError ? 'text-[#D9536A]' : 'text-slate')}>
            {noteError || 'The seller sees this note.'}
          </p>
        </div>
      </SheetBody>
      <SheetFoot error={failed}>
        <Button variant="outline" className={secondary} disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button className={primary} disabled={busy || !docs} onClick={submit}>
          {busy ? 'Sending…' : 'Ask for an update'}
        </Button>
      </SheetFoot>
    </>
  );
}

/* ---------------- Approve a pause (second admin) ---------------- */

/** Confirm before approving another admin's suspension or pause (design guide › Confirm before anything risky). */
export function ApproveDialog({
  row,
  busy,
  onCancel,
  onConfirm,
}: {
  row: RestrictedRow | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const seller = row?.type === 'seller';
  return (
    <Dialog open={!!row} onOpenChange={o => !o && !busy && onCancel()}>
      <DialogContent className="gap-0 overflow-hidden rounded-[24px] p-0 sm:max-w-md">
        <div className="bg-[#FDF0F2] px-6 pb-5 pt-6 pr-12">
          <DialogTitle className="text-[19px] font-medium leading-snug tracking-[-0.01em] text-ink">
            {seller ? `Pause listings for ${row?.name}?` : `Suspend ${row?.name}?`}
          </DialogTitle>
          <DialogDescription className="mt-2 text-[14px] leading-5 text-ink">
            {row?.by ? `${row.by} asked to ${seller ? 'pause them' : 'suspend them'}` : 'Why'}: {row?.why}.{' '}
            {seller
              ? 'Their live auctions pause, new listings are blocked and payouts are held until someone restores them.'
              : 'They’re signed out and can’t bid or pay until someone restores them.'}
          </DialogDescription>
        </div>
        <DialogFooter className="mx-0 mb-0 rounded-none border-line bg-white px-6 pb-6 pt-4">
          <Button variant="outline" className={secondary} disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="outline" className={redOutline} disabled={busy} onClick={onConfirm}>
            {busy ? 'Approving…' : seller ? 'Approve and pause' : 'Approve and suspend'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
