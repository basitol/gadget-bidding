import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * 30-day area chart (no chart library): Blue 500 line, soft fill, four y ticks, five dates,
 * and a hover read-out. The aria-label carries the total for screen readers.
 */

type Point = { date: string; value: number };

const niceMax = (max: number) => {
  if (max <= 0) return 3;
  const raw = max / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 3, 5, 10].map(m => m * pow).find(s => s >= raw) ?? raw;
  return step * 3;
};

const dateLabel = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function SalesChart({
  points,
  format,
  label,
}: {
  points: Point[];
  format: (n: number) => string;
  label: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const H = 240;
  const pad = { l: 56, r: 16, t: 16, b: 32 };
  const max = useMemo(() => niceMax(Math.max(0, ...points.map(p => p.value))), [points]);
  const innerW = width - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (points.length <= 1 ? 0 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = points.length ? `${line} L${x(points.length - 1).toFixed(1)},${pad.t + innerH} L${pad.l},${pad.t + innerH} Z` : '';
  const ticks = [0, 1, 2, 3].map(i => (max / 3) * i);
  const xLabels = points.length
    ? Array.from(new Set([0, 7, 14, 21, points.length - 1].filter(i => i < points.length)))
    : [];

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round(((px - pad.l) / innerW) * (points.length - 1));
    setHover(i >= 0 && i < points.length ? i : null);
  };

  const hp = hover != null ? points[hover] : null;

  return (
    <div ref={wrap} className="relative w-full">
      <svg
        width={width}
        height={H}
        role="img"
        aria-label={label}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        className="block"
      >
        <defs>
          <linearGradient id="gb-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#4F7BFF" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#4F7BFF" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map(t => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="#EDEFF4" strokeDasharray={t === 0 ? undefined : '3 4'} />
            <text x={pad.l - 10} y={y(t) + 4} textAnchor="end" fontSize="12" fill="#5C6273" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {format(t)}
            </text>
          </g>
        ))}
        {xLabels.map(i => (
          <text
            key={i}
            x={x(i)}
            y={H - 8}
            textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
            fontSize="12"
            fill="#5C6273"
          >
            {dateLabel(points[i].date)}
          </text>
        ))}
        {area ? <path d={area} fill="url(#gb-area)" /> : null}
        {line ? <path d={line} fill="none" stroke="#4F7BFF" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /> : null}
        {hp ? (
          <g>
            <line x1={x(hover!)} x2={x(hover!)} y1={pad.t} y2={pad.t + innerH} stroke="#A9AEBB" strokeDasharray="3 3" />
            <circle cx={x(hover!)} cy={y(hp.value)} r="4.5" fill="#FFFFFF" stroke="#4F7BFF" strokeWidth="2" />
          </g>
        ) : null}
      </svg>
      {hp ? (
        <div
          className="pointer-events-none absolute top-2 rounded-[10px] bg-ink px-2.5 py-1.5 text-[12px] text-white shadow-lg"
          style={{ left: Math.min(Math.max(x(hover!) - 60, 0), width - 130) }}
        >
          <div className="text-white/70">{dateLabel(hp.date)}</div>
          <div className="font-medium tabular-nums">{format(hp.value)}</div>
        </div>
      ) : null}
    </div>
  );
}
