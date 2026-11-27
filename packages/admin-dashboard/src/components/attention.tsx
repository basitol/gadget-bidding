import { Link } from 'react-router-dom';
import type { AttentionItem } from '@/api';
import { dueLabel } from '@/lib/format';
import { TINTS, type Tint } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { Icon3d, type Icon3dName } from '@/components/shell/Icon3d';

/** One row per thing waiting on the team: item, queue chip, when it's due, the next step. */

const KIND: Record<AttentionItem['kind'], { icon: Icon3dName; tint: Tint; action: string }> = {
  kyb: { icon: 'idcard', tint: 'violet', action: 'Review' },
  dispute: { icon: 'box', tint: 'red', action: 'Open case' },
  listing: { icon: 'phonecheck', tint: 'blue', action: 'Review' },
  hub: { icon: 'truck', tint: 'amber', action: 'Check it' },
  payouts: { icon: 'wallet', tint: 'green', action: 'Release' },
};

const DUE_COLOR = { red: '#D9536A', amber: '#DB7A2E', ink: '#1C1F2A' };

export function QueueChip({ label, tint }: { label: string; tint: Tint }) {
  return (
    <span
      className="inline-flex h-[26px] items-center rounded-[8px] px-2 text-[13px] font-medium"
      style={{ backgroundColor: TINTS[tint].bg, color: TINTS[tint].fg }}
    >
      {label}
    </span>
  );
}

export function AttentionTable({ items, now }: { items: AttentionItem[]; now: number }) {
  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-line text-[12px] font-medium uppercase tracking-[0.04em] text-slate">
          <th scope="col" className="py-3 pl-6 pr-3 font-medium">Item</th>
          <th scope="col" className="hidden px-3 py-3 font-medium md:table-cell">Queue</th>
          <th scope="col" className="px-3 py-3 font-medium">Due</th>
          <th scope="col" className="py-3 pl-3 pr-6 text-right font-medium">Action</th>
        </tr>
      </thead>
      <tbody>
        {items.map(item => {
          const k = KIND[item.kind];
          const due = dueLabel(item.due_at, now);
          return (
            <tr key={item.id} className="border-b border-line last:border-0">
              <td className="py-3 pl-6 pr-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Icon3d name={k.icon} size={32} />
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-medium text-ink">{item.title}</div>
                    <div className="truncate text-[13px] text-slate">{item.sub}</div>
                  </div>
                </div>
              </td>
              <td className="hidden px-3 py-3 md:table-cell">
                <QueueChip label={item.queue} tint={k.tint} />
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-[14px] font-medium" style={{ color: DUE_COLOR[due.tone] }}>
                {due.text}
              </td>
              <td className="py-3 pl-3 pr-6 text-right">
                <Link
                  to={item.route}
                  className="inline-flex h-9 items-center rounded-[10px] bg-white px-3.5 text-[14px] font-medium text-ink ring-1 ring-line transition-colors duration-150 hover:bg-fill focus-visible:outline-2 focus-visible:outline-blue-brand"
                >
                  {k.action}
                </Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Section card shell (design guide › Cards): icon tile, Title 2, count, content. */
export function SectionCard({
  icon,
  title,
  meta,
  right,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  meta?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('gb-elev overflow-hidden rounded-[24px] border border-white/80 bg-white/90', className)}>
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-4">
        <span className="grid size-10 place-items-center rounded-[12px] bg-fill">{icon}</span>
        <h2 className="text-[19px] font-medium tracking-[-0.01em] text-ink">
          {title}
          {meta ? <span className="font-normal text-hint"> · {meta}</span> : null}
        </h2>
        {right ? <div className="ml-auto">{right}</div> : null}
      </header>
      {children}
    </section>
  );
}
