export function money(n?: number | null) {
  const v = Math.round(Number(n || 0));
  return `${v < 0 ? '−' : ''}₦${Math.abs(v).toLocaleString('en-NG')}`;
}

/** ₦1.14B, ₦86.4M, ₦520K, ₦8,000 — for stat cards and chart axes. */
export function compactMoney(n?: number | null) {
  const v = Number(n || 0);
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  const fmt = (x: number, unit: string) => `${sign}₦${x >= 100 ? Math.round(x) : Number(x.toFixed(x >= 10 ? 1 : 2))}${unit}`;
  if (abs >= 1e9) return fmt(abs / 1e9, 'B');
  if (abs >= 1e6) return fmt(abs / 1e6, 'M');
  if (abs >= 1e4) return fmt(abs / 1e3, 'K');
  return money(v);
}

const TZ = 'Africa/Lagos';
const lagosDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });

/** "Due in 1h" (amber when close), "Overdue 3h" (red), "Today", "Tomorrow", "Nov 29". */
export function dueLabel(iso: string | null | undefined, now = Date.now()): { text: string; tone: 'red' | 'amber' | 'ink' } {
  if (!iso) return { text: '—', tone: 'ink' };
  const due = new Date(iso);
  const diff = due.getTime() - now;
  const span = (ms: number) => {
    const m = Math.max(1, Math.round(Math.abs(ms) / 60_000));
    if (m < 60) return `${m}m`;
    const h = Math.round(m / 60);
    return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
  };
  if (diff < 0) return { text: `Overdue ${span(diff)}`, tone: 'red' };
  if (diff < 3 * 3_600_000) return { text: `Due in ${span(diff)}`, tone: 'amber' };
  if (diff < 12 * 3_600_000) return { text: `Due in ${span(diff)}`, tone: 'ink' };
  const today = lagosDay(new Date(now));
  const tomorrow = lagosDay(new Date(now + 86_400_000));
  if (lagosDay(due) === today) return { text: 'Today', tone: 'ink' };
  if (lagosDay(due) === tomorrow) return { text: 'Tomorrow', tone: 'ink' };
  return { text: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ }), tone: 'ink' };
}

/** "Just now", "5m ago", "2h ago", "3d ago". */
export function ago(iso?: string | null, now = Date.now()) {
  if (!iso) return '—';
  const m = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** "Nov 24, 2026 · 6:00 pm", with Today / Yesterday when recent. */
export function friendlyTime(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ }).toLowerCase();
  const day = lagosDay(d);
  if (day === lagosDay(new Date())) return `Today · ${time}`;
  if (day === lagosDay(new Date(Date.now() - 86_400_000))) return `Yesterday · ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ })} · ${time}`;
}

export function when(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-NG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function formatAddress(addr: any) {
  if (!addr) return '';
  return [
    addr.full_name,
    addr.phone_number,
    addr.address_line1,
    addr.address_line2,
    [addr.city, addr.state].filter(Boolean).join(', '),
    addr.postal_code,
    addr.country || 'Nigeria',
    addr.delivery_note ? `Note for the rider: ${addr.delivery_note}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export function label(value?: string | null) {
  if (!value) return '—';
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}
