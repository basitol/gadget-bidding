import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { ExternalLink, FileText, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  sellerApplicationsApi,
  type NumberCheck,
  type SellerApplication,
  type SellerApplicationDocument,
  type SellerApplicationStatus,
} from '@/api';
import { Badge, type Tone } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { friendlyTime } from '@/lib/format';
import { cn } from '@/lib/utils';

/* ---------------- Shared bits (also used by the queue page) ---------------- */

/** Status chip from the design guide: 30px, radius 9, tint + dark text, always a word. */
export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <Badge tone={tone} className="h-[30px] rounded-[9px] px-2.5 text-[13px] font-medium">
      {children}
    </Badge>
  );
}

export const STATUS_CHIP: Record<SellerApplicationStatus, { text: string; tone: Tone }> = {
  in_review: { text: 'Waiting for review', tone: 'info' },
  needs_info: { text: 'With the seller', tone: 'warn' },
  approved: { text: 'Approved', tone: 'ok' },
  rejected: { text: 'Turned down', tone: 'danger' },
  draft: { text: 'Draft', tone: 'neutral' },
};

export const NUMBER_CHIP: Record<NumberCheck, { text: string; tone: Tone }> = {
  pending: { text: 'Not checked', tone: 'neutral' },
  matched: { text: 'Matched', tone: 'ok' },
  not_matched: { text: 'Not matched', tone: 'danger' },
};

const docChip = (d: SellerApplicationDocument): { text: string; tone: Tone } => {
  if (!d.uploaded) return { text: 'Not uploaded', tone: 'neutral' };
  if (d.status === 'accepted') return { text: 'Accepted', tone: 'ok' };
  if (d.status === 'needs_fix') return { text: 'New one asked for', tone: 'warn' };
  // A file the seller sent after we asked for a new one keeps our note.
  return d.note ? { text: 'New file', tone: 'info' } : { text: 'Not checked', tone: 'neutral' };
};

const TZ = 'Africa/Lagos';
const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ }).toLowerCase();

const fileSize = (bytes: number | null) => {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Local-storage links come back as /api/v1/files/private/…; point them at the API when it lives elsewhere. */
const API_BASE: string = import.meta.env.VITE_API_URL || '';
const fileHref = (url: string | null) => {
  if (!url) return '';
  if (url.startsWith('/') && /^https?:\/\//i.test(API_BASE)) return `${new URL(API_BASE).origin}${url}`;
  return url;
};

/** Signed file links last 10 minutes from when the application was loaded. */
const LINK_TTL_MS = 10 * 60_000;

const secondary =
  'h-10 rounded-[10px] border-line bg-white text-[14px] text-ink hover:bg-fill focus-visible:outline-2 focus-visible:outline-blue-brand';
const selected = 'border-blue-brand bg-blue-tint text-blue-press hover:bg-blue-tint';
const redOutline =
  'h-10 rounded-[10px] border-[#D9536A] bg-white text-[14px] text-[#D9536A] hover:bg-[#FDF0F2] hover:text-[#D9536A] focus-visible:outline-2 focus-visible:outline-blue-brand';

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-medium uppercase tracking-[0.04em] text-slate">{title}</h3>
        {right ? <div className="ml-auto">{right}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex gap-4 border-b border-line py-3 last:border-0">
      <dt className="w-28 shrink-0 text-[14px] text-slate sm:w-36">{k}</dt>
      <dd className="min-w-0 flex-1 text-[14px] text-ink">{children}</dd>
    </div>
  );
}

/** Tinted note (design guide › Feedback): green done, amber waiting/warning, red turned down, blue info. */
const NOTE_TINT = {
  ok: { bg: 'bg-[#EEF9F2]', fg: 'text-[#2E9E5E]' },
  warn: { bg: 'bg-[#FFF6EE]', fg: 'text-[#DB7A2E]' },
  danger: { bg: 'bg-[#FDF0F2]', fg: 'text-[#D9536A]' },
  info: { bg: 'bg-blue-tint', fg: 'text-blue-press' },
} as const;

function Note({ tone, title, children }: { tone: keyof typeof NOTE_TINT; title: string; children?: ReactNode }) {
  return (
    <div className={cn('rounded-[12px] px-4 py-3', NOTE_TINT[tone].bg)}>
      <p className={cn('text-[14px] font-medium', NOTE_TINT[tone].fg)}>{title}</p>
      {children ? <div className="mt-1 text-[14px] text-ink">{children}</div> : null}
    </div>
  );
}

/* ---------------- One document ---------------- */

function DocumentCard({
  doc,
  business,
  editable,
  busy,
  expired,
  onReview,
  onRefreshLinks,
}: {
  doc: SellerApplicationDocument;
  business: string;
  editable: boolean;
  busy: string | null;
  expired: boolean;
  onReview: (status: 'accepted' | 'needs_fix', note?: string) => Promise<boolean>;
  onRefreshLinks: () => void;
}) {
  const noteId = useId();
  const errorId = useId();
  const [flagging, setFlagging] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [broken, setBroken] = useState(false);
  const chip = docChip(doc);
  const preview = fileHref(doc.preview_url);
  const original = fileHref(doc.url);
  const key = `doc:${doc.kind}`;

  // A fresh set of links (after a refresh or a change) gets a fresh try at the preview.
  useEffect(() => setBroken(false), [doc.preview_url]);

  const check = (v: string) => (v.trim().length < 5 ? 'Say what the seller should fix, in at least 5 characters.' : '');

  const sendFlag = async () => {
    const problem = check(note);
    setError(problem);
    if (problem) return;
    if (await onReview('needs_fix', note)) setFlagging(false);
  };

  return (
    <li className="rounded-[18px] border border-line bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-[14px] font-medium text-ink">{doc.label}</h4>
        <span className="ml-auto">
          <Chip tone={chip.tone}>{chip.text}</Chip>
        </span>
      </div>

      {doc.uploaded ? (
        <>
          <div className="mt-3 overflow-hidden rounded-[12px] bg-fill">
            {broken || expired ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-4 py-6 text-center">
                <p className="text-[14px] text-ink">
                  {expired ? 'The link to this file has expired.' : 'This preview didn’t load. The link may have expired.'}
                </p>
                <Button variant="outline" className={secondary} onClick={onRefreshLinks}>
                  <RefreshCw data-icon="inline-start" />
                  Refresh links
                </Button>
              </div>
            ) : preview ? (
              <a
                href={original || preview}
                target="_blank"
                rel="noreferrer"
                className="block focus-visible:outline-2 focus-visible:outline-blue-brand"
                aria-label={`Open ${doc.label} in a new tab`}
              >
                <img
                  src={preview}
                  alt={`${doc.label} from ${business}${doc.is_pdf ? ', page 1' : ''}`}
                  onError={() => setBroken(true)}
                  className="max-h-80 w-full object-contain"
                />
              </a>
            ) : (
              <p className="px-4 py-6 text-center text-[14px] text-slate">No preview for this file.</p>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex min-w-0 items-center gap-1 text-[13px] text-slate">
              {doc.is_pdf ? <FileText className="size-3.5 shrink-0" aria-hidden /> : null}
              <span className="truncate">{[doc.name, fileSize(doc.size)].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="text-[13px] text-hint">Uploaded {friendlyTime(doc.uploaded_at)}</span>
          </div>
          {original && !expired && !broken ? (
            <a
              href={original}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 self-start rounded text-[13px] font-medium text-blue-press underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-blue-brand"
            >
              {doc.is_pdf ? 'Open the PDF in a new tab' : 'Open full size in a new tab'}
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : null}

          {doc.note && doc.status === 'needs_fix' ? (
            <div className="mt-3">
              <Note tone="warn" title="What we asked the seller to fix">
                “{doc.note}”
              </Note>
            </div>
          ) : doc.note && doc.status === 'submitted' ? (
            <div className="mt-3">
              <Note tone="info" title="New file after we asked">
                We asked: “{doc.note}”
              </Note>
            </div>
          ) : null}

          {editable ? (
            flagging ? (
              <div className="mt-3 flex flex-col gap-2">
                <Label htmlFor={noteId} className="text-[14px] text-ink">
                  What should the seller fix?
                </Label>
                <Textarea
                  id={noteId}
                  value={note}
                  maxLength={300}
                  autoFocus
                  aria-invalid={!!error}
                  aria-describedby={errorId}
                  onChange={e => {
                    setNote(e.target.value);
                    if (error && !check(e.target.value)) setError('');
                  }}
                  onBlur={() => note && setError(check(note))}
                  className="min-h-[72px] rounded-[12px] bg-white text-[14px]"
                />
                <p id={errorId} className={cn('text-[13px]', error ? 'text-[#D9536A]' : 'text-slate')}>
                  {error || 'The seller sees this note and uploads only this document again.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className={secondary} disabled={busy === key} onClick={sendFlag}>
                    {busy === key ? 'Saving…' : 'Ask for a new one'}
                  </Button>
                  <Button variant="ghost" className="h-10 rounded-[10px] text-[14px]" onClick={() => setFlagging(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  aria-pressed={doc.status === 'accepted'}
                  className={cn(secondary, doc.status === 'accepted' && selected)}
                  disabled={!!busy}
                  onClick={() => doc.status !== 'accepted' && onReview('accepted')}
                >
                  {busy === key ? 'Saving…' : 'Accept'}
                </Button>
                <Button
                  variant="outline"
                  aria-pressed={doc.status === 'needs_fix'}
                  className={cn(secondary, doc.status === 'needs_fix' && selected)}
                  disabled={!!busy}
                  onClick={() => {
                    setNote(doc.status === 'needs_fix' ? doc.note ?? '' : '');
                    setError('');
                    setFlagging(true);
                  }}
                >
                  {doc.status === 'needs_fix' ? 'Change the note' : 'Ask for a new one'}
                </Button>
              </div>
            )
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-[14px] text-slate">The seller hasn’t uploaded this yet.</p>
      )}
    </li>
  );
}

/* ---------------- Turn down (confirm before anything risky) ---------------- */

function TurnDownDialog({
  open,
  business,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  business: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const id = useId();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const check = (v: string) => (v.trim().length < 10 ? 'Give the seller a reason of at least 10 characters.' : '');

  useEffect(() => {
    if (open) {
      setReason('');
      setError('');
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={o => !o && !busy && onCancel()}>
      <DialogContent className="gap-0 overflow-hidden rounded-[24px] p-0 sm:max-w-md">
        <div className="bg-[#FDF0F2] px-6 pb-5 pt-6 pr-12">
          <DialogTitle className="text-[19px] font-medium leading-snug tracking-[-0.01em] text-ink">
            Turn down {business}?
          </DialogTitle>
          <DialogDescription className="mt-2 text-[14px] leading-5 text-ink">
            The seller sees your reason and can’t list anything. They can ask for a second review once, or apply again
            after 30 days. Their account and the files they sent stay as they are.
          </DialogDescription>
        </div>
        <div className="flex flex-col gap-2 px-6 py-5">
          <Label htmlFor={`${id}-reason`} className="text-[14px] text-ink">
            Reason the seller sees
          </Label>
          <Textarea
            id={`${id}-reason`}
            value={reason}
            maxLength={1000}
            aria-invalid={!!error}
            aria-describedby={`${id}-hint`}
            onChange={e => {
              setReason(e.target.value);
              if (error && !check(e.target.value)) setError('');
            }}
            onBlur={() => reason && setError(check(reason))}
            className="min-h-[96px] rounded-[12px] bg-white text-[14px]"
          />
          <p id={`${id}-hint`} className={cn('text-[13px]', error ? 'text-[#D9536A]' : 'text-slate')}>
            {error || 'It also goes in the audit log.'}
          </p>
        </div>
        <DialogFooter className="mx-0 mb-0 rounded-none border-line bg-white px-6 pb-6 pt-4">
          <Button variant="outline" className={secondary} disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="outline"
            className={redOutline}
            disabled={busy}
            onClick={() => {
              const problem = check(reason);
              setError(problem);
              if (!problem) onConfirm(reason);
            }}
          >
            {busy ? 'Turning down…' : 'Turn down'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- The sheet ---------------- */

/**
 * One seller application for our verification team: business details, the RC/BN number
 * (checked by hand against the CAC register), the three private documents, and the decision.
 * Only applications waiting for review can be changed; everything else is read-only.
 */
export function SellerApplicationSheet({
  applicationId,
  onClose,
  onChanged,
}: {
  applicationId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const ids = useId();
  const [app, setApp] = useState<SellerApplication | null>(null);
  const [failed, setFailed] = useState('');
  const [loadedAt, setLoadedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [backNote, setBackNote] = useState('');
  const [backError, setBackError] = useState('');
  const [turningDown, setTurningDown] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      if (!applicationId) return;
      setFailed('');
      try {
        const res = await sellerApplicationsApi.get(applicationId);
        setApp(res.data);
        setLoadedAt(Date.now());
        setNow(Date.now());
        if (refresh) toast.success('Links refreshed. They work for 10 minutes.');
      } catch (err: any) {
        const message = err.message || 'Couldn’t load this application.';
        if (refresh) toast.error(message);
        else setFailed(message);
      }
    },
    [applicationId]
  );
  const refreshLinks = () => load(true);

  // Opening an application always fetches it again, so the file links are fresh.
  useEffect(() => {
    setApp(null);
    setBackNote('');
    setBackError('');
    setTurningDown(false);
    load();
  }, [load]);

  useEffect(() => {
    if (!applicationId) return;
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, [applicationId]);

  /** Runs a change; every change returns the whole application (with fresh links). */
  const run = async (key: string, fn: () => Promise<{ data: SellerApplication }>, ok: string) => {
    setBusy(key);
    try {
      const res = await fn();
      setApp(res.data);
      setLoadedAt(Date.now());
      setNow(Date.now());
      toast.success(ok);
      onChanged();
      return true;
    } catch (err: any) {
      toast.error(err.message || 'That didn’t work. Try again.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const editable = app?.status === 'in_review';
  const expired = !!app && now - loadedAt >= LINK_TTL_MS;
  const business = app?.business_name || 'this business';

  const docs = app?.documents ?? [];
  const accepted = docs.filter(d => d.status === 'accepted').length;
  const flaggedDocs = docs.filter(d => d.status === 'needs_fix').length;
  const uncheckedDocs = docs.filter(d => d.uploaded && d.status === 'submitted').length;
  const numberPending = app?.number_check === 'pending';
  const numberFlagged = app?.number_check === 'not_matched';
  const flagged = flaggedDocs + (numberFlagged ? 1 : 0);

  const canApprove = !!app && app.number_check === 'matched' && accepted === docs.length && docs.length > 0;
  const approveReason = !app
    ? ''
    : flagged
      ? 'You flagged something. Send it back or turn it down instead.'
      : numberPending && accepted < docs.length
        ? `Check the number and accept all ${docs.length} documents first.`
        : numberPending
          ? 'Mark the registration number as matched first.'
          : `Accept all ${docs.length} documents first.`;

  const sendBackBlock =
    uncheckedDocs || numberPending
      ? 'Accept or flag every document and the number first.'
      : !flagged
        ? 'Flag a document, or mark the number as not matched, first.'
        : '';
  const checkNote = (v: string) => (v.trim().length < 10 ? 'Write a note of at least 10 characters.' : '');

  const sendBack = async () => {
    const problem = checkNote(backNote);
    setBackError(problem);
    if (problem || !app) return;
    if (await run('needs_info', () => sellerApplicationsApi.needsInfo(app.id, backNote), 'Sent back to the seller')) {
      setBackNote('');
    }
  };

  return (
    <Sheet open={!!applicationId} onOpenChange={open => !open && onClose()}>
      <SheetContent className="gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl sm:rounded-l-[28px]">
        <SheetHeader className="gap-1 border-b border-line px-6 pb-5 pt-6 pr-14">
          <SheetTitle className="text-[19px] font-medium tracking-[-0.01em] text-ink">
            {app ? app.business_name || 'Business name not given' : 'Seller application'}
          </SheetTitle>
          <SheetDescription className="text-[14px] text-slate">
            {app ? [app.seller_code, app.email].filter(Boolean).join(' · ') : failed ? 'Couldn’t load it' : 'Loading…'}
          </SheetDescription>
          {app ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Chip tone={STATUS_CHIP[app.status].tone}>{STATUS_CHIP[app.status].text}</Chip>
              {app.status === 'in_review' && app.second_review_requested_at ? <Chip tone="warn">Second review</Chip> : null}
              {app.status === 'in_review' && app.resubmitted_at && !app.second_review_requested_at ? (
                <Chip tone="info">Fix sent</Chip>
              ) : null}
            </div>
          ) : null}
        </SheetHeader>

        {failed && !app ? (
          <div className="flex flex-col items-start gap-3 px-6 py-6">
            <p role="alert" className="text-[14px] text-[#D9536A]">
              {failed}
            </p>
            <Button variant="outline" className={secondary} onClick={() => load()}>
              Try again
            </Button>
          </div>
        ) : !app ? (
          <div className="flex flex-col gap-4 px-6 py-6">
            <Skeleton className="h-24 rounded-[18px]" />
            <Skeleton className="h-64 rounded-[18px]" />
          </div>
        ) : (
          <div className="flex flex-col gap-8 px-6 pb-10 pt-6">
            {/* Where it stands */}
            {app.status === 'approved' ? (
              <Note tone="ok" title={`Approved${app.reviewed_by ? ` by ${app.reviewed_by}` : ''} · ${friendlyTime(app.decided_at)}`}>
                Buyers see them as Verified seller {app.seller_code}.
              </Note>
            ) : app.status === 'rejected' ? (
              <Note tone="danger" title={`Turned down${app.reviewed_by ? ` by ${app.reviewed_by}` : ''} · ${friendlyTime(app.decided_at)}`}>
                {app.reject_reason ? <p>“{app.reject_reason}”</p> : null}
                <p className="mt-1 text-slate">
                  {app.second_review_requested_at
                    ? `They asked for a second review ${friendlyTime(app.second_review_requested_at)}.`
                    : 'They can ask for a second review once.'}
                </p>
              </Note>
            ) : app.status === 'needs_info' ? (
              <Note tone="warn" title={`Sent back${app.reviewed_by ? ` by ${app.reviewed_by}` : ''} · ${friendlyTime(app.decided_at)}`}>
                {app.team_note ? <p>“{app.team_note}”</p> : null}
                <p className="mt-1 text-slate">The seller fixes only what we flagged and keeps their place in the queue.</p>
              </Note>
            ) : app.status === 'draft' ? (
              <Note tone="info" title="Not sent yet">
                The seller is still filling this in.
              </Note>
            ) : null}
            {app.status === 'in_review' && app.second_review_requested_at ? (
              <Note tone="warn" title={`Second review asked for · ${friendlyTime(app.second_review_requested_at)}`}>
                {app.reject_reason ? <p>Turned down {friendlyTime(app.decided_at)}: “{app.reject_reason}”</p> : null}
                <p className="mt-1 text-slate">The seller thinks we got it wrong. Someone else on the team should look again.</p>
              </Note>
            ) : null}
            {app.status === 'in_review' && app.resubmitted_at && app.team_note ? (
              <Note tone="info" title={`Fix sent · ${friendlyTime(app.resubmitted_at)}`}>
                <p>We asked: “{app.team_note}”</p>
                <p className="mt-1 text-slate">Check the items marked New file. Everything else was accepted before.</p>
              </Note>
            ) : null}

            <Section title="Business">
              <dl className="rounded-[18px] border border-line bg-white px-4">
                <Row k="Business name">{app.business_name || '—'}</Row>
                <Row k="Owner">{app.owner_name || '—'}</Row>
                <Row k="Business email">{app.email || '—'}</Row>
                <Row k="Business phone">{app.business_phone || '—'}</Row>
                <Row k="Shop">
                  {[app.shop_number, app.plaza].filter(Boolean).join(', ') || '—'}
                  {app.area ? <span className="block text-[13px] text-slate">{app.area}</span> : null}
                </Row>
                <Row k="Sells">{app.categories.length ? app.categories.join(', ') : '—'}</Row>
                <Row k="Account">
                  Made {friendlyTime(app.account_created_at)}
                  {!app.account_active ? <span className="block text-[13px] text-[#D9536A]">Account switched off</span> : null}
                </Row>
                <Row k="Sent">{friendlyTime(app.submitted_at)}</Row>
                <Row k="Selling rules">{app.rules_accepted_at ? `All 6 accepted · ${friendlyTime(app.rules_accepted_at)}` : 'Not accepted yet'}</Row>
              </dl>
            </Section>

            <Section title="Registration number">
              <div className="rounded-[18px] border border-line bg-white p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[19px] font-medium tracking-[-0.01em] text-ink tabular-nums">
                    {app.registration || 'Not given'}
                  </span>
                  <span className="ml-auto">
                    <Chip tone={NUMBER_CHIP[app.number_check].tone}>{NUMBER_CHIP[app.number_check].text}</Chip>
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-slate">
                  {app.registration_type === 'bn' ? 'Business name (BN). ' : app.registration_type === 'rc' ? 'Company (RC). ' : ''}
                  Look it up on the CAC register and check it belongs to{' '}
                  {app.business_name ? `“${app.business_name}”` : 'this business'}.
                  {app.number_checked_at ? ` Checked ${friendlyTime(app.number_checked_at)}.` : ''}
                </p>
                {editable ? (
                  <div role="group" aria-label="Does the number match the CAC register?" className="mt-3 flex flex-wrap gap-2">
                    {(
                      [
                        ['matched', 'Matched'],
                        ['not_matched', 'Not matched'],
                      ] as const
                    ).map(([value, text]) => (
                      <Button
                        key={value}
                        variant="outline"
                        aria-pressed={app.number_check === value}
                        className={cn(secondary, app.number_check === value && selected)}
                        disabled={!!busy}
                        onClick={() =>
                          app.number_check !== value &&
                          run(
                            'number',
                            () => sellerApplicationsApi.numberCheck(app.id, value),
                            value === 'matched' ? 'Number marked as matched' : 'Number marked as not matched'
                          )
                        }
                      >
                        {busy === 'number' && app.number_check !== value ? 'Saving…' : text}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            </Section>

            <Section
              title={`Documents · ${accepted} of ${docs.length} accepted`}
              right={
                <div className="flex items-center gap-2">
                  <span className={cn('text-[13px]', expired ? 'text-[#D9536A]' : 'text-hint')}>
                    {expired ? 'Links expired' : `Links work until ${clock(loadedAt + LINK_TTL_MS)}`}
                  </span>
                  <Button
                    variant="ghost"
                    className="h-9 rounded-[10px] px-2.5 text-[14px] text-blue-press focus-visible:outline-2 focus-visible:outline-blue-brand"
                    onClick={refreshLinks}
                  >
                    <RefreshCw data-icon="inline-start" />
                    Refresh links
                  </Button>
                </div>
              }
            >
              <ul className="flex flex-col gap-3">
                {docs.map(d => (
                  <DocumentCard
                    key={d.kind}
                    doc={d}
                    business={business}
                    editable={editable}
                    busy={busy}
                    expired={expired}
                    onRefreshLinks={refreshLinks}
                    onReview={(status, note) =>
                      run(
                        `doc:${d.kind}`,
                        () => sellerApplicationsApi.reviewDocument(app.id, d.kind, status, note),
                        status === 'accepted' ? `${d.label} accepted` : `${d.label}: new one asked for`
                      )
                    }
                  />
                ))}
              </ul>
            </Section>

            {editable ? (
              <Section title="Decision">
                <div className="flex flex-col gap-4 rounded-[18px] border border-line bg-white p-4">
                  <ul className="flex flex-col gap-1 text-[14px] text-ink">
                    <li className="flex items-center gap-2">
                      <span className="w-40 shrink-0 text-slate">Registration number</span>
                      <Chip tone={NUMBER_CHIP[app.number_check].tone}>{NUMBER_CHIP[app.number_check].text}</Chip>
                    </li>
                    <li className="flex flex-wrap items-center gap-2">
                      <span className="w-40 shrink-0 text-slate">Documents</span>
                      <span className="tabular-nums">
                        {accepted} of {docs.length} accepted
                        {flaggedDocs ? ` · ${flaggedDocs} flagged` : ''}
                        {uncheckedDocs ? ` · ${uncheckedDocs} not checked` : ''}
                      </span>
                    </li>
                  </ul>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      className="h-10 rounded-[10px] px-4 text-[14px] focus-visible:outline-2 focus-visible:outline-blue-brand"
                      disabled={!canApprove || !!busy}
                      onClick={() => run('approve', () => sellerApplicationsApi.approve(app.id), `${business} approved`)}
                    >
                      {busy === 'approve' ? 'Approving…' : 'Approve and tell the seller'}
                    </Button>
                    {!canApprove ? <span className="text-[13px] text-slate">{approveReason}</span> : null}
                  </div>

                  <div className="flex flex-col gap-2 border-t border-line pt-4">
                    <Label htmlFor={`${ids}-back`} className="text-[14px] text-ink">
                      Note for the seller
                    </Label>
                    <Textarea
                      id={`${ids}-back`}
                      value={backNote}
                      maxLength={500}
                      aria-invalid={!!backError}
                      aria-describedby={`${ids}-back-hint`}
                      onChange={e => {
                        setBackNote(e.target.value);
                        if (backError && !checkNote(e.target.value)) setBackError('');
                      }}
                      onBlur={() => backNote && setBackError(checkNote(backNote))}
                      className="min-h-[80px] rounded-[12px] bg-white text-[14px]"
                    />
                    <p id={`${ids}-back-hint`} className={cn('text-[13px]', backError ? 'text-[#D9536A]' : 'text-slate')}>
                      {backError ||
                        'They see this with what you flagged, fix only those, and keep their place in the queue.'}
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        variant="outline"
                        className={secondary}
                        disabled={!!sendBackBlock || !!busy}
                        onClick={sendBack}
                      >
                        {busy === 'needs_info' ? 'Sending…' : 'Send back to the seller'}
                      </Button>
                      {sendBackBlock ? <span className="text-[13px] text-slate">{sendBackBlock}</span> : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                    <Button variant="outline" className={redOutline} disabled={!!busy} onClick={() => setTurningDown(true)}>
                      Turn down this application
                    </Button>
                    <span className="text-[13px] text-slate">You’ll be asked for a reason first.</span>
                  </div>
                </div>
              </Section>
            ) : null}
          </div>
        )}

        <TurnDownDialog
          open={turningDown}
          business={business}
          busy={busy === 'reject'}
          onCancel={() => setTurningDown(false)}
          onConfirm={async reason => {
            if (!app) return;
            if (await run('reject', () => sellerApplicationsApi.reject(app.id, reason), 'Application turned down')) {
              setTurningDown(false);
            }
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
