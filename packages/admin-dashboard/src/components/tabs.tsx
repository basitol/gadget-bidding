import { useLayoutEffect, useRef, type RefObject } from 'react';
import { cn } from '@/lib/utils';

/*
 * The moving part of a tab bar: a white pill (segmented tabs) or a blue underline that slides to the
 * selected tab (design guide › Motion: tabs, 250ms, ease-out to enter). Tab bars that change the address
 * (Users › Buyers / Sellers / Suspended) are built again on every switch, so the last position is kept
 * by name and the indicator glides on from there. With reduce motion on it simply moves.
 */

/** Where the indicator itself sits inside the bar. */
type Geo = { x: number; y: number; w: number; h: number };

const lastGeo = new Map<string, Geo>();
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const LINE = 2;

const reduceMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const same = (a: Geo, b: Geo) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

const frame = (g: Geo): Keyframe => ({
  transform: `translate(${g.x}px, ${g.y}px)`,
  width: `${g.w}px`,
  height: `${g.h}px`,
});

/** Where the indicator is on screen right now, mid-slide included. */
function readGeo(ind: HTMLElement): Geo | null {
  const cs = getComputedStyle(ind);
  const w = parseFloat(cs.width);
  if (!w) return null;
  const m = new DOMMatrixReadOnly(cs.transform === 'none' ? undefined : cs.transform);
  return { x: m.m41, y: m.m42, w, h: parseFloat(cs.height) };
}

/**
 * Moves the bar's indicator (the element marked data-tab-indicator) to the tab with aria-selected="true".
 * `remember` names the tab bar so the position outlives the page being rebuilt.
 */
export function useTabIndicator(bar: RefObject<HTMLElement | null>, active: string, remember?: string) {
  const current = useRef<Geo | null>(null);

  useLayoutEffect(() => {
    const el = bar.current;
    const ind = el?.querySelector<HTMLElement>(':scope > [data-tab-indicator]');
    if (!el || !ind) return;
    const line = ind.dataset.tabIndicator === 'line';

    const measure = (): Geo | null => {
      const tab = el.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (!tab) return null;
      const { offsetLeft: x, offsetTop: y, offsetWidth: w, offsetHeight: h } = tab;
      return line ? { x, y: y + h - LINE, w, h: LINE } : { x, y, w, h };
    };
    const place = (g: Geo | null) => {
      ind.style.visibility = g ? '' : 'hidden';
      if (!g) return;
      Object.assign(ind.style, frame(g));
    };
    const save = (g: Geo) => {
      current.current = g;
      if (remember) lastGeo.set(remember, g);
    };

    let target = measure();
    const from = current.current ?? (remember ? lastGeo.get(remember) : undefined);
    place(target);
    let anim: Animation | null = null;
    if (target && from && !same(from, target) && !reduceMotion() && typeof ind.animate === 'function') {
      anim = ind.animate([frame(from), frame(target)], { duration: 250, easing: EASE });
    }
    if (target) save(target);

    // Fonts loading, counts arriving or the window resizing move the tabs: follow without sliding.
    const ro =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            const g = measure();
            if (!g || (target && same(target, g))) return;
            target = g;
            if (anim && anim.playState === 'running') {
              // Mid-slide (counts arriving widen a tab): aim the slide at the new spot from where it is now.
              const now = readGeo(ind);
              anim.cancel();
              place(g);
              anim = now ? ind.animate([frame(now), frame(g)], { duration: 200, easing: EASE }) : null;
            } else {
              place(g);
            }
            save(g);
          });
    ro?.observe(el);
    el.querySelectorAll(':scope > [role="tab"]').forEach(t => ro?.observe(t));

    return () => {
      ro?.disconnect();
      if (anim && anim.playState === 'running') {
        // Stopped mid-slide (another click, or the bar being rebuilt): carry on from where it is now.
        const now = readGeo(ind);
        if (now) save(now);
        anim.cancel();
      }
    };
  }, [bar, active, remember]);
}

/** The white pill behind the selected segmented tab. */
export function PillIndicator({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      data-tab-indicator="pill"
      className={cn('pointer-events-none absolute left-0 top-0', className ?? 'gb-elev rounded-[14px] bg-white')}
    />
  );
}

/** The 2px Blue 500 line under the selected underlined tab. */
export function UnderlineIndicator() {
  return <span aria-hidden data-tab-indicator="line" className="pointer-events-none absolute left-0 top-0 bg-blue-brand" />;
}
