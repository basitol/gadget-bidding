import { Sparkle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BrandMark({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid place-items-center rounded-xl bg-slate-950 text-white',
        size === 'lg' && 'size-12',
        size === 'md' && 'size-10',
        size === 'sm' && 'size-8',
        className
      )}
    >
      <Sparkle
        className={cn(
          size === 'lg' && 'size-5',
          size === 'md' && 'size-4',
          size === 'sm' && 'size-3.5'
        )}
        fill="currentColor"
      />
    </div>
  );
}

export function BrandPill({
  children = 'GadgetBid Ops',
  className,
}: {
  children?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border bg-background px-3.5 py-1.5 text-sm font-semibold text-muted-foreground',
        className
      )}
    >
      <Sparkle className="size-3.5" fill="currentColor" />
      {children}
    </span>
  );
}
