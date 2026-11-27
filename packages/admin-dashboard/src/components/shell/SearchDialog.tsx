import { useMemo, useState } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import { NAV, SUB_NAV } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/** ⌘K: jump to any page or queue. */
const DESTINATIONS = (() => {
  const seen = new Set<string>();
  const list: { label: string; hint: string; to: string }[] = [];
  const add = (label: string, hint: string, to: string) => {
    if (seen.has(to)) return;
    seen.add(to);
    list.push({ label, hint, to });
  };
  NAV.forEach(n => add(n.label, n.group === 'queues' ? 'Queue' : n.group === 'settings' ? 'Settings' : 'Page', n.to));
  SUB_NAV.forEach(g => g.items.forEach(i => add(i.label, 'Page', i.to)));
  add('Notifications', 'Page', '/notifications');
  add('All listings', 'Page', '/gadgets');
  return list;
})();

export function SearchDialog({
  open,
  onOpenChange,
  onGo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGo: (to: string) => void;
}) {
  const [q, setQ] = useState('');
  const [index, setIndex] = useState(0);
  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? DESTINATIONS.filter(d => d.label.toLowerCase().includes(term)) : DESTINATIONS;
  }, [q]);

  const go = (to: string) => {
    onOpenChange(false);
    setQ('');
    setIndex(0);
    onGo(to);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden rounded-[24px] p-0 sm:max-w-lg" showCloseButton={false}>
        <DialogTitle className="sr-only">Go to a page</DialogTitle>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 text-slate" />
          <input
            autoFocus
            value={q}
            onChange={e => {
              setQ(e.target.value);
              setIndex(0);
            }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndex(i => Math.min(i + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex(i => Math.max(i - 1, 0));
              } else if (e.key === 'Enter' && results[index]) {
                go(results[index].to);
              }
            }}
            placeholder="Go to a page or queue"
            aria-label="Go to a page or queue"
            className="h-14 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint"
          />
        </div>
        <ul role="listbox" className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-[14px] text-slate">No page called that.</li>
          ) : (
            results.map((r, i) => (
              <li key={r.to} role="option" aria-selected={i === index}>
                <button
                  type="button"
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => go(r.to)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left',
                    i === index && 'bg-blue-tint'
                  )}
                >
                  <span className="flex-1 text-[15px] text-ink">{r.label}</span>
                  <span className="text-[13px] text-slate">{r.hint}</span>
                  {i === index ? <CornerDownLeft className="size-3.5 text-slate" /> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
