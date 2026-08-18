import { Sparkle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BrandIllustration({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('absolute inset-0 overflow-hidden', className)}>
      <span className="absolute left-[12%] top-[16%] size-2.5 rounded-full bg-primary/25" />
      <span className="absolute left-[68%] top-[10%] size-1.5 rounded-full bg-amber-400/40" />
      <span className="absolute left-[80%] top-[28%] size-3 rounded-full border-2 border-slate-300" />
      <span className="absolute left-[24%] top-[36%] size-1.5 rounded-full bg-slate-300" />
      <Sparkle className="absolute left-[76%] top-[52%] size-4 text-primary/30" />
      <Sparkle className="absolute left-[16%] top-[58%] size-3 text-amber-400/50" />

      <div className="absolute inset-0 flex items-end justify-center">
        <div
          className={cn(
            'relative -mb-4 h-[92%] w-full',
            compact ? 'max-w-[360px]' : 'max-w-[520px] xl:max-w-[600px]'
          )}
        >
          <div className="absolute -bottom-2 left-1/2 h-8 w-[78%] -translate-x-1/2 rounded-full bg-slate-950/10 blur-md" />

          <div className="absolute bottom-0 right-[10%] h-[56%] w-[24%] rounded-t-[999px] rounded-b-2xl bg-amber-300 shadow-sm">
            <Face tone="dark" mouth="flat" compact={compact} />
          </div>

          <div className="absolute bottom-0 left-[10%] h-[70%] w-[36%] rounded-2xl bg-primary shadow-sm">
            <div className="absolute inset-x-3 top-2 h-2 rounded-full bg-white/15" />
            <Face tone="light" mouth="smile" compact={compact} />
          </div>

          <div className="absolute bottom-0 left-[40%] h-[52%] w-[22%] origin-bottom -rotate-6 rounded-xl bg-slate-800 shadow-sm">
            <div className="absolute left-1/2 top-[18%] flex -translate-x-1/2 gap-1.5">
              <span className="h-1 w-3 rounded-full bg-white/25" />
              <span className="h-1 w-3 rounded-full bg-white/25" />
              <span className="h-1 w-3 rounded-full bg-white/25" />
            </div>
          </div>

          <div
            className={cn(
              'absolute bottom-0 left-1/2 -translate-x-1/2 rounded-t-full bg-sky-300',
              compact ? 'h-[140px] w-[200px]' : 'h-[210px] w-[300px]'
            )}
          >
            <div className="absolute left-[18%] top-[10%] h-4 w-11 -rotate-12 rounded-full bg-white/25" />
            <Face tone="dark" mouth="smile" top="22%" compact={compact} />
            <span className="absolute left-[30%] top-[46%] size-2.5 rounded-full bg-rose-300/70" />
            <span className="absolute right-[30%] top-[46%] size-2.5 rounded-full bg-rose-300/70" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Face({
  tone,
  mouth,
  top = '30%',
  compact = false,
}: {
  tone: 'light' | 'dark';
  mouth: 'smile' | 'flat';
  top?: string;
  compact?: boolean;
}) {
  const dot = tone === 'light' ? 'bg-white' : 'bg-slate-900';
  const mouthColor = tone === 'light' ? 'border-white' : 'border-slate-900';
  return (
    <div className="absolute left-1/2 -translate-x-1/2" style={{ top }}>
      <div className={cn('flex items-center', compact ? 'gap-3' : 'gap-4')}>
        <span
          className={cn(
            'rounded-full',
            compact ? 'size-2.5' : 'size-3.5',
            dot
          )}
        />
        <span
          className={cn(
            'rounded-full',
            compact ? 'size-2.5' : 'size-3.5',
            dot
          )}
        />
      </div>
      {mouth === 'smile' ? (
        <div
          className={cn(
            'mx-auto rounded-b-full border-b-4',
            compact ? 'mt-2 h-2.5 w-5' : 'mt-3 h-3.5 w-7',
            mouthColor
          )}
        />
      ) : (
        <div
          className={cn(
            'mx-auto rounded-full',
            compact ? 'mt-2.5 h-1 w-5' : 'mt-3.5 h-1 w-7',
            tone === 'light' ? 'bg-white' : 'bg-slate-900'
          )}
        />
      )}
    </div>
  );
}
