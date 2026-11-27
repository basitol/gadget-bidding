import { useEffect, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { LogoMark } from '@/components/shell/Icon3d';
import { compactMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

type Panel = {
  ticker: { title: string; sub: string }[];
  escrow: { held: number; bars: number[] };
};

/** Live activity and the escrow figure for the brand panel (public endpoint, refreshed each minute). */
function usePanel() {
  const [panel, setPanel] = useState<Panel | null>(null);
  useEffect(() => {
    let gone = false;
    const load = () =>
      fetch(`${API_BASE}/auth/sign-in-panel`)
        .then(r => (r.ok ? r.json() : null))
        .then(j => {
          if (!gone && j?.data) setPanel(j.data);
        })
        .catch(() => {});
    load();
    const t = window.setInterval(load, 60_000);
    return () => {
      gone = true;
      window.clearInterval(t);
    };
  }, []);
  return panel;
}

const ROW = 36;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * One event at a time, sliding up every 3 seconds (a 12-second cycle for four events). The
 * first line is repeated at the end so it loops back without a jump. Still with reduce motion.
 */
function Ticker({ items }: { items: Panel['ticker'] }) {
  const [i, setI] = useState(0);
  const [slide, setSlide] = useState(true);
  const [reduce] = useState(reducedMotion);
  const n = items.length;

  useEffect(() => {
    setI(0);
    if (n < 2 || reduce) return;
    const t = window.setInterval(() => {
      setSlide(true);
      setI(x => x + 1);
    }, 3000);
    return () => window.clearInterval(t);
  }, [n, reduce]);

  // Once it has slid onto the copy of the first line, jump back to the real one unseen.
  useEffect(() => {
    if (i < n) return;
    const t = window.setTimeout(() => {
      setSlide(false);
      setI(0);
    }, 260);
    return () => window.clearTimeout(t);
  }, [i, n]);

  const rows = n > 1 ? [...items, items[0]] : items;
  return (
    <span className="block h-9 overflow-hidden">
      <span
        className="flex flex-col"
        style={{ transform: `translateY(-${i * ROW}px)`, transition: slide ? 'transform 250ms ease-out' : 'none' }}
      >
        {rows.map((r, k) => (
          <span key={k} className="flex h-9 shrink-0 flex-col justify-center">
            <span className="block truncate text-[15px] font-medium leading-5">{r.title}</span>
            <span className="block truncate text-[13px] leading-4 opacity-75">{r.sub}</span>
          </span>
        ))}
      </span>
    </span>
  );
}

const glass = 'rounded-[20px] border border-white/30 bg-white/16 backdrop-blur-[16px]';
/** Older days fainter, today brightest. */
const BAR_ALPHA = [0.35, 0.35, 0.35, 0.45, 0.45, 0.6, 0.85];
const blob = (rgba: string) => ({ backgroundImage: `radial-gradient(circle, ${rgba}, transparent 65%)` });

/** Split screen from the design: brand panel on the left, the form on the right. */
export function AuthLayout({ children }: { children: ReactNode }) {
  const panel = usePanel();
  return (
    <div className="grid min-h-svh bg-white tracking-[-0.2px] text-ink lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden rounded-[28px] bg-[linear-gradient(150deg,#2F5BFF_0%,#4E5FF2_45%,#7C68E8_100%)] px-12 py-11 text-white lg:my-4 lg:ml-4 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{
            maskImage: 'radial-gradient(circle at 60% 45%, #000 20%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(circle at 60% 45%, #000 20%, transparent 75%)',
          }}
        >
          <div
            className="gb-drift absolute -left-7 -top-7 bottom-0 right-0"
            style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.22) 1.2px, transparent 1.4px)', backgroundSize: '28px 28px' }}
          />
        </div>
        <span aria-hidden className="pointer-events-none gb-blob-a absolute -left-[120px] -top-[100px] size-[420px] rounded-full" style={blob('rgba(124,214,255,0.55)')} />
        <span aria-hidden className="pointer-events-none gb-blob-c absolute -bottom-[140px] -right-[160px] size-[480px] rounded-full" style={blob('rgba(246,176,79,0.4)')} />
        <span aria-hidden className="pointer-events-none gb-blob-b absolute right-[60px] top-[120px] size-[300px] rounded-full" style={blob('rgba(205,180,255,0.5)')} />
        <svg aria-hidden width="640" height="640" viewBox="0 0 640 640" className="gb-ring pointer-events-none absolute -right-[200px] top-1/2 -mt-[320px] origin-center opacity-25">
          <circle cx="320" cy="320" r="300" fill="none" stroke="#FFFFFF" strokeWidth="1" strokeDasharray="2 10" />
          <circle cx="320" cy="320" r="220" fill="none" stroke="#FFFFFF" strokeWidth="1" strokeDasharray="1 8" />
        </svg>

        <div className="relative flex items-center gap-3">
          <span className="flex rounded-[16px] bg-white/35 p-[3px]">
            <LogoMark size={44} className="rounded-[12px]" />
          </span>
          <span className="flex flex-col">
            <span className="text-[18px] font-medium leading-[24.5px]">Gadgets Bidding</span>
            <span className="text-[13px] font-medium leading-[17.5px] opacity-75">Admin backoffice</span>
          </span>
        </div>

        <div aria-hidden className="relative h-[330px]">
          {panel?.ticker.length ? (
            <div className={cn(glass, 'gb-bob-6 absolute left-0 top-[10px] flex w-[334px] flex-col gap-2.5 p-4')}>
              <span className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.06em]">
                <span className="relative size-2">
                  <span className="gb-live-ring absolute inset-0 rounded-full bg-[#7CF0B5]" />
                  <span className="absolute inset-0 rounded-full bg-[#7CF0B5]" />
                </span>
                Live now
              </span>
              <Ticker items={panel.ticker} />
            </div>
          ) : null}
          {panel ? (
            <div className={cn(glass, 'gb-bob-7 absolute right-[10px] top-[120px] flex w-[254px] flex-col gap-1.5 p-4')}>
              <span className="text-[13px] leading-[17.5px] opacity-80">Held in escrow</span>
              <span className="text-[28px] font-medium leading-[38px] tracking-[-0.02em] tabular-nums">{compactMoney(panel.escrow.held)}</span>
              <span className="flex h-9 items-end gap-[5px]">
                {panel.escrow.bars.map((v, i) => (
                  <span
                    key={i}
                    className="flex-1 rounded-[3px]"
                    style={{ height: `${20 + 80 * v}%`, backgroundColor: `rgba(255,255,255,${BAR_ALPHA[i] ?? 0.35})` }}
                  />
                ))}
              </span>
            </div>
          ) : null}
          <div className="gb-bob-8 absolute left-[60px] top-[220px] flex items-center gap-2.5 rounded-[16px] bg-white/92 px-4 py-3 text-ink shadow-[0_12px_30px_rgba(20,28,90,0.25)]">
            <span className="grid size-8 place-items-center rounded-full bg-[#EEF9F2] text-[#2E9E5E]">
              <Check className="size-4" strokeWidth={2.5} />
            </span>
            <span className="flex flex-col">
              <span className="text-[14px] font-medium leading-[19px]">Every gadget checked</span>
              <span className="text-[12px] leading-4 text-hint">at our Computer Village hub</span>
            </span>
          </div>
        </div>

        <div className="relative flex max-w-[460px] flex-col gap-3">
          <p className="text-[34px] font-medium leading-[1.15] tracking-[-0.02em]">Run the marketplace that Lagos trusts.</p>
          <p className="text-[16px] leading-6 opacity-80">Sellers, listings, inspections, escrow and payouts — all in one place.</p>
          <p className="mt-2.5 text-[13px] leading-[17.5px] opacity-65">14 Ola-Ayeni Street, Computer Village, Ikeja</p>
        </div>
      </aside>

      <main className="flex flex-col items-center justify-center gap-6 px-6 py-12 sm:px-10">
        <div className="w-full max-w-[400px]">{children}</div>
        <p className="max-w-[400px] text-center text-[13px] leading-[19.5px] text-hint">
          For Gadgets Bidding staff only. Every sign-in is recorded in the audit log.
        </p>
      </main>
    </div>
  );
}

/** Heading block used at the top of every auth form. */
export function AuthHeading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-[26px] font-medium leading-[35px] tracking-[-0.02em] text-ink">{title}</h1>
      <p className="text-[15px] leading-5 text-hint">{children}</p>
    </div>
  );
}

export function AuthField({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[14px] font-medium leading-[19px] text-slate">
        {label}
      </label>
      {children}
      {error ? (
        <p key={error} id={`${id}-error`} role="alert" className="gb-fade-up mt-1.5 text-[13px] text-[#D9536A]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Space between the heading, fields, button and links on auth forms. */
export const authForm = 'flex flex-col gap-[18px]';

export const authInput =
  'h-[50px] w-full rounded-[12px] border border-line bg-white px-[14px] text-[16px] text-ink outline-none transition-colors duration-150 placeholder:text-faint focus:border-blue-brand focus:outline-1 focus:outline-blue-brand aria-[invalid=true]:border-[#D9536A] aria-[invalid=true]:outline-[#D9536A]';

export const authButton =
  'h-[50px] w-full rounded-[12px] bg-blue-brand text-[16px] font-medium text-white transition-colors duration-150 hover:bg-blue-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-brand disabled:bg-line disabled:text-faint';

export const authLink = 'text-[14px] font-medium text-blue-press hover:underline focus-visible:outline-2 focus-visible:outline-blue-brand';

/** The form's main button. While it checks it stays blue and shows a spinning ring. */
export function AuthSubmit({ busy, disabled, children }: { busy: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={disabled || busy}
      aria-busy={busy}
      className={cn(authButton, 'inline-flex items-center justify-center gap-2', busy && 'disabled:bg-blue-brand disabled:text-white')}
    >
      {busy ? <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : null}
      {children}
    </button>
  );
}
