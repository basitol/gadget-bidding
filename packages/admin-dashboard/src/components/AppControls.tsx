import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { adminApi, type AppConfigAdmin, type ReleaseSettings } from '@/api';
import { SectionCard } from '@/components/attention';
import { useConfirmDialog } from '@/components/ConfirmDialogProvider';
import { StatusBadge } from '@/components/shared';
import { Icon3d } from '@/components/shell/Icon3d';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { friendlyTime } from '@/lib/format';

/**
 * Settings → App versions and Maintenance. What the mobile app reads from GET /app-config:
 * below the minimum version it shows "Time to update"; while maintenance is on, bidding is
 * paused and buyers see the maintenance screen.
 */

const VERSION_RE = /^\d+(\.\d+){0,2}$/;
const LAGOS_OFFSET_MS = 3_600_000; // UTC+1, no daylight saving

const compareVersions = (a: string, b: string) => {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
};

/** "1h 4m", "45m", "under a minute". */
const span = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  if (m < 1) return 'under a minute';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

/** datetime-local value in Lagos time, e.g. "2026-11-27T03:00". */
const toLagosInput = (ms: number) => new Date(ms + LAGOS_OFFSET_MS).toISOString().slice(0, 16);
const fromLagosInput = (v: string) => new Date(`${v}:00+01:00`).toISOString();
/** Two hours from now, on the next quarter hour. */
const defaultBackBy = () => {
  const q = 15 * 60_000;
  return toLagosInput(Math.ceil((Date.now() + 2 * 3_600_000) / q) * q);
};

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-NG')} ${n === 1 ? one : many}`;

function FieldError({ children }: { children?: string | null }) {
  return children ? (
    <p role="alert" className="text-[13px] text-[#D9536A]">
      {children}
    </p>
  ) : null;
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-6 border-b border-line px-6 py-3.5 last:border-0">
      <dt className="w-40 shrink-0 text-[15px] text-slate">{k}</dt>
      <dd className="text-[15px] font-medium text-ink">{children}</dd>
    </div>
  );
}

/* ================= App versions ================= */

function AppVersionsCard({ release, onSaved }: { release: ReleaseSettings; onSaved: (d: AppConfigAdmin) => void }) {
  const { confirm } = useConfirmDialog();
  const [min, setMin] = useState(release.min_version);
  const [latest, setLatest] = useState(release.latest_version);
  const [ios, setIos] = useState(release.store_urls.ios ?? '');
  const [android, setAndroid] = useState(release.store_urls.android ?? '');
  const [lines, setLines] = useState(release.whats_new.join('\n'));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMin(release.min_version);
    setLatest(release.latest_version);
    setIos(release.store_urls.ios ?? '');
    setAndroid(release.store_urls.android ?? '');
    setLines(release.whats_new.join('\n'));
  }, [release]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!VERSION_RE.test(min.trim())) e.min = 'Use a version like 2.3.0.';
    if (!VERSION_RE.test(latest.trim())) e.latest = 'Use a version like 2.4.0.';
    if (!e.min && !e.latest && compareVersions(min.trim(), latest.trim()) > 0) {
      e.min = 'The minimum can’t be newer than the latest version.';
    }
    for (const [key, v] of [['ios', ios], ['android', android]] as const) {
      if (v.trim() && !/^https:\/\/\S+$/.test(v.trim())) e[key] = 'Paste the full https:// link.';
    }
    const list = lines.split('\n').map(l => l.trim()).filter(Boolean);
    if (list.length > 8) e.lines = 'Keep it to 8 lines or fewer.';
    else if (list.some(l => l.length > 120)) e.lines = 'Keep each line under 120 characters.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const dirty =
    min.trim() !== release.min_version ||
    latest.trim() !== release.latest_version ||
    ios.trim() !== (release.store_urls.ios ?? '') ||
    android.trim() !== (release.store_urls.android ?? '') ||
    lines.split('\n').map(l => l.trim()).filter(Boolean).join('\n') !== release.whats_new.join('\n');

  const save = async () => {
    if (!validate()) return;
    const raising = compareVersions(min.trim(), release.min_version) > 0;
    if (
      raising &&
      !(await confirm({
        title: `Require version ${min.trim()}?`,
        description: `Anyone on an older version sees “Time to update” and can’t bid until they update from the store. Their bids and watchlist stay put.`,
        confirmLabel: `Require ${min.trim()}`,
        danger: true,
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await adminApi.saveRelease({
        min_version: min.trim(),
        latest_version: latest.trim(),
        ios_store_url: ios.trim() || null,
        android_store_url: android.trim() || null,
        whats_new: lines.split('\n').map(l => l.trim()).filter(Boolean),
      });
      onSaved(res.data);
      toast.success('App versions saved. The app picks them up next time it opens.');
    } catch (err: any) {
      toast.error(err.message || 'That didn’t save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      icon={<Icon3d name="autobid" size={26} />}
      title="App versions"
      meta={release.updated_at ? `Saved ${friendlyTime(release.updated_at)}` : undefined}
    >
      <form
        className="grid gap-5 px-6 py-5 md:grid-cols-2"
        onSubmit={e => {
          e.preventDefault();
          save();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="min-version">Minimum version</Label>
          <Input
            id="min-version"
            value={min}
            inputMode="decimal"
            onChange={e => {
              setMin(e.target.value);
              setErrors(x => ({ ...x, min: '' }));
            }}
            className="h-11 rounded-[12px] tabular-nums"
            aria-invalid={!!errors.min}
          />
          <FieldError>{errors.min}</FieldError>
          <p className="text-[13px] text-hint">Older apps see “Time to update” and can’t bid.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="latest-version">Latest version</Label>
          <Input
            id="latest-version"
            value={latest}
            inputMode="decimal"
            onChange={e => {
              setLatest(e.target.value);
              setErrors(x => ({ ...x, latest: '' }));
            }}
            className="h-11 rounded-[12px] tabular-nums"
            aria-invalid={!!errors.latest}
          />
          <FieldError>{errors.latest}</FieldError>
          <p className="text-[13px] text-hint">The update screen says “What’s new in {latest.trim().replace(/^(\d+\.\d+)\.0$/, '$1') || '…'}”.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ios-url">App Store link</Label>
          <Input
            id="ios-url"
            value={ios}
            placeholder="https://apps.apple.com/app/…"
            onChange={e => {
              setIos(e.target.value);
              setErrors(x => ({ ...x, ios: '' }));
            }}
            className="h-11 rounded-[12px]"
            aria-invalid={!!errors.ios}
          />
          <FieldError>{errors.ios}</FieldError>
          {!ios.trim() ? <p className="text-[13px] text-hint">Empty: “Update now” opens gadgetsbidding.com.</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="android-url">Google Play link</Label>
          <Input
            id="android-url"
            value={android}
            placeholder="https://play.google.com/store/apps/details?id=…"
            onChange={e => {
              setAndroid(e.target.value);
              setErrors(x => ({ ...x, android: '' }));
            }}
            className="h-11 rounded-[12px]"
            aria-invalid={!!errors.android}
          />
          <FieldError>{errors.android}</FieldError>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="whats-new">What’s new · one line each</Label>
          <Textarea
            id="whats-new"
            value={lines}
            rows={4}
            placeholder={'Faster live bidding with fewer missed updates\nPay by bank transfer and USSD'}
            onChange={e => {
              setLines(e.target.value);
              setErrors(x => ({ ...x, lines: '' }));
            }}
            className="rounded-[12px] text-[15px]"
            aria-invalid={!!errors.lines}
          />
          <FieldError>{errors.lines}</FieldError>
        </div>
        <div className="flex items-center gap-3 md:col-span-2">
          <Button type="submit" className="h-10 rounded-[10px]" disabled={busy || !dirty}>
            {busy ? 'Saving…' : 'Save app versions'}
          </Button>
          {!dirty ? <span className="text-[13px] text-hint">No changes to save.</span> : null}
        </div>
      </form>
    </SectionCard>
  );
}

/* ================= Maintenance ================= */

function MaintenanceCard({ data, onChange }: { data: AppConfigAdmin; onChange: (d: AppConfigAdmin) => void }) {
  const { confirm } = useConfirmDialog();
  const m = data.maintenance;
  const [form, setForm] = useState<'start' | 'edit' | null>(null);
  const [backBy, setBackBy] = useState(defaultBackBy);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!m.active) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [m.active]);

  const pausedFor = m.started_at ? Math.max(0, (now - new Date(m.started_at).getTime()) / 1000) : 0;
  const last = data.history.find(w => w.ended_at);

  const openForm = (kind: 'start' | 'edit') => {
    setBackBy(kind === 'edit' && m.back_by ? toLagosInput(new Date(m.back_by).getTime()) : defaultBackBy());
    setMessage(kind === 'edit' ? m.message ?? '' : '');
    setReason('');
    setError(null);
    setForm(kind);
  };

  const start = async () => {
    if (!backBy) return setError('Choose when you expect to be back.');
    if (new Date(fromLagosInput(backBy)).getTime() <= Date.now()) return setError('“Back by” must be later than now.');
    if (!reason.trim()) return setError('Add a reason for the audit log.');
    const ok = await confirm({
      title: 'Pause bidding for everyone?',
      description:
        'Buyers see the maintenance screen and can’t bid or set auto-bids. Auctions stop ending. When you end maintenance, every running auction gets the paused time added back. Payments, payouts and deliveries carry on.',
      confirmLabel: 'Pause bidding',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await adminApi.startMaintenance({
        back_by: fromLagosInput(backBy),
        reason: reason.trim(),
        message: message.trim() || undefined,
      });
      onChange(res.data);
      setForm(null);
      toast.success('Maintenance is on. Bidding is paused until you end it.');
    } catch (err: any) {
      toast.error(err.message || 'That didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!backBy || new Date(fromLagosInput(backBy)).getTime() <= Date.now()) return setError('“Back by” must be later than now.');
    setBusy(true);
    try {
      const res = await adminApi.updateMaintenance({ back_by: fromLagosInput(backBy), message: message.trim() || null });
      onChange(res.data);
      setForm(null);
      toast.success('Updated. Buyers see the new time next time the app checks.');
    } catch (err: any) {
      toast.error(err.message || 'That didn’t save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const end = async () => {
    const ok = await confirm({
      title: 'End maintenance now?',
      description: `Bidding opens again straight away. ${
        m.affected_auctions
          ? `${plural(m.affected_auctions, 'auction')} get${m.affected_auctions === 1 ? 's' : ''} the paused time (${pausedFor < 60 ? 'under a minute' : `about ${span(pausedFor)}`}) added to ${m.affected_auctions === 1 ? 'its' : 'their'} end time.`
          : 'No auctions need time added back.'
      }`,
      confirmLabel: 'End maintenance',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await adminApi.endMaintenance();
      onChange(res.data);
      const e = res.data.ended;
      toast.success(
        e.auctions_extended
          ? `Bidding is open again. ${plural(e.auctions_extended, 'auction')} got ${span(e.paused_seconds)} added back.`
          : 'Bidding is open again.'
      );
    } catch (err: any) {
      toast.error(err.message || 'That didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      icon={<Icon3d name="bell" size={26} />}
      title="Maintenance"
      right={
        m.active ? (
          <StatusBadge key="paused" tone="warn">
            Bidding paused
          </StatusBadge>
        ) : (
          <StatusBadge key="open" tone="ok">
            Bidding open
          </StatusBadge>
        )
      }
    >
      {m.active ? (
        <dl>
          <Row k="Started">{friendlyTime(m.started_at)}</Row>
          <Row k="Back by">
            <span className="mr-3">{m.back_by ? friendlyTime(m.back_by) : 'Not set'}</span>
            {m.back_by && new Date(m.back_by).getTime() < now ? <StatusBadge tone="danger">Running late</StatusBadge> : null}
          </Row>
          <Row k="Paused for">
            <span className="tabular-nums">{span(pausedFor)}</span>
          </Row>
          <Row k="Auctions">
            {m.affected_auctions
              ? `${plural(m.affected_auctions, 'auction')} will get the paused time added back`
              : 'None running'}
          </Row>
          {m.message ? <Row k="Note for buyers">{m.message}</Row> : null}
        </dl>
      ) : (
        <div className="border-b border-line px-6 py-4 text-[15px] text-slate">
          Pauses bids and auto-bids for everyone and stops auctions from ending. When you end it, every running
          auction gets the paused time added back. Payments, payouts and deliveries carry on.
          {last ? (
            <div className="mt-2 text-[13px] text-hint">
              Last time: {friendlyTime(last.started_at)} for {span(last.paused_seconds ?? 0)} ·{' '}
              {plural(last.auctions_extended ?? 0, 'auction')} got the time back
            </div>
          ) : null}
        </div>
      )}

      {form ? (
        <form
          className="flex flex-wrap items-end gap-3 border-t border-line bg-fill/60 px-6 py-4"
          onSubmit={e => {
            e.preventDefault();
            if (form === 'start') start();
            else saveEdit();
          }}
        >
          <div className="w-56 space-y-2">
            <Label htmlFor="back-by">Back by · Lagos time</Label>
            <Input
              id="back-by"
              type="datetime-local"
              value={backBy}
              min={toLagosInput(Date.now())}
              onChange={e => {
                setBackBy(e.target.value);
                setError(null);
              }}
              className="h-11 rounded-[12px] bg-white"
            />
          </div>
          {form === 'start' ? (
            <div className="min-w-56 flex-1 space-y-2">
              <Label htmlFor="maint-reason">Reason · kept in the audit log</Label>
              <Input
                id="maint-reason"
                value={reason}
                maxLength={280}
                placeholder="Database upgrade"
                onChange={e => {
                  setReason(e.target.value);
                  setError(null);
                }}
                className="h-11 rounded-[12px] bg-white"
              />
            </div>
          ) : null}
          <div className="min-w-56 flex-1 space-y-2">
            <Label htmlFor="maint-message">Note for buyers · optional</Label>
            <Input
              id="maint-message"
              value={message}
              maxLength={280}
              onChange={e => setMessage(e.target.value)}
              className="h-11 rounded-[12px] bg-white"
            />
          </div>
          <Button type="button" variant="outline" className="h-11 rounded-[10px]" onClick={() => setForm(null)}>
            Cancel
          </Button>
          {form === 'start' ? (
            <Button
              type="submit"
              variant="outline"
              disabled={busy}
              className="h-11 rounded-[10px] border-[#D9536A] text-[#D9536A] hover:bg-[#FDF0F2] hover:text-[#D9536A]"
            >
              Pause bidding now
            </Button>
          ) : (
            <Button type="submit" className="h-11 rounded-[10px]" disabled={busy}>
              Save new time
            </Button>
          )}
          {error ? (
            <p role="alert" className="w-full text-[13px] text-[#D9536A]">
              {error}
            </p>
          ) : null}
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-6 py-4">
          {m.active ? (
            <>
              <Button key="end" className="h-10 rounded-[10px]" onClick={end} disabled={busy}>
                {busy ? 'Ending…' : 'End maintenance'}
              </Button>
              <Button variant="outline" className="h-10 rounded-[10px]" onClick={() => openForm('edit')} disabled={busy}>
                Change back-by time
              </Button>
            </>
          ) : (
            <Button
              key="start"
              variant="outline"
              className="h-10 rounded-[10px] border-[#D9536A] text-[#D9536A] hover:bg-[#FDF0F2] hover:text-[#D9536A]"
              onClick={() => openForm('start')}
            >
              Start maintenance
            </Button>
          )}
        </div>
      )}
    </SectionCard>
  );
}

/** Both cards, loaded together. */
export function AppControls() {
  const [data, setData] = useState<AppConfigAdmin | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    adminApi
      .appConfig()
      .then(res => setData(res.data))
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return (
      <p role="alert" className="rounded-[16px] bg-[#FDF0F2] px-4 py-3 text-[15px] text-[#D9536A]">
        Couldn’t load app versions and maintenance. Refresh the page to try again.
      </p>
    );
  }
  if (!data) return null;
  return (
    <>
      <MaintenanceCard data={data} onChange={setData} />
      <AppVersionsCard release={data.release} onSaved={setData} />
    </>
  );
}
