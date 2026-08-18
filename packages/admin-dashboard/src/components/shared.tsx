import { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { BrandPill } from '@/components/BrandMark';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge as ShadcnBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info';

export function statusTone(status?: string | null): Tone {
  const s = (status || '').toLowerCase();
  if (
    [
      'paid',
      'approved',
      'active',
      'delivered',
      'success',
      'resolved',
      'ok',
    ].includes(s)
  ) {
    return 'ok';
  }
  if (
    ['pending', 'scheduled', 'processing', 'investigating', 'warn'].includes(s)
  ) {
    return 'warn';
  }
  if (
    ['rejected', 'cancelled', 'failed', 'danger', 'open', 'disputed'].includes(
      s
    )
  ) {
    return 'danger';
  }
  if (['shipped', 'listed', 'info'].includes(s)) return 'info';
  return 'neutral';
}

const toneClass: Record<Tone, string> = {
  neutral: 'border-transparent bg-slate-500/12 text-slate-700',
  ok: 'border-transparent bg-emerald-500/15 text-emerald-700',
  warn: 'border-transparent bg-amber-500/15 text-amber-800',
  danger: 'border-transparent bg-red-500/15 text-red-700',
  info: 'border-transparent bg-sky-500/15 text-sky-700',
};

export function StatusBadge({
  children,
  tone = 'neutral',
  className,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  title?: string;
}) {
  return (
    <ShadcnBadge
      variant="secondary"
      className={cn(toneClass[tone], className)}
      title={title}
    >
      {children}
    </ShadcnBadge>
  );
}

export { StatusBadge as Badge };

export type SelectOption = {
  value: string;
  label: string;
  /** Tailwind bg class for the status dot, e.g. bg-emerald-500 */
  color?: string;
};

const defaultOptionColor = (value: string) => {
  const v = value.toLowerCase();
  if (
    [
      'paid',
      'approved',
      'active',
      'delivered',
      'success',
      'resolved',
      'true',
    ].includes(v)
  )
    return 'bg-emerald-500';
  if (
    ['pending', 'scheduled', 'processing', 'investigating', 'warn'].includes(v)
  )
    return 'bg-amber-400';
  if (
    [
      'rejected',
      'cancelled',
      'failed',
      'open',
      'disputed',
      'refunded',
      'false',
    ].includes(v)
  )
    return 'bg-rose-500';
  if (['shipped', 'listed', 'info', 'bidder'].includes(v)) return 'bg-sky-500';
  if (['seller', 'admin'].includes(v)) return 'bg-violet-500';
  return 'bg-primary';
};

export function SelectField({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  disabled,
  className,
  triggerClassName,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        className={cn('min-w-[170px]', triggerClassName, className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        position="popper"
        className="z-[100] bg-white dark:bg-popover"
      >
        {options.map(opt => (
          <SelectItem key={opt.value} value={opt.value}>
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  'size-2.5 shrink-0 rounded-full',
                  opt.color || defaultOptionColor(opt.value)
                )}
              />
              {opt.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function StatusTabs({
  value,
  onValueChange,
  items,
}: {
  value: string;
  onValueChange: (value: string) => void;
  items: string[];
}) {
  return (
    <div
      role="tablist"
      className="inline-flex h-14 flex-wrap items-center rounded-2xl bg-muted/80 px-1 py-1.5"
    >
      {items.map(item => {
        const active = value === item;
        return (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(item)}
            className={cn(
              'mx-1 h-11 shrink-0 rounded-xl px-5 text-sm font-medium capitalize transition-all',
              active
                ? 'bg-background text-foreground shadow-toggle'
                : 'bg-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow = 'GadgetBid Ops',
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string | null;
}) {
  return (
    <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {eyebrow ? <BrandPill>{eyebrow}</BrandPill> : null}
        <h1
          className={cn(
            'text-3xl font-semibold tracking-tight text-foreground md:text-4xl',
            eyebrow && 'mt-4'
          )}
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap gap-2 sm:pt-12">{actions}</div>
      ) : null}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border bg-muted/60 p-4">
      {children}
    </div>
  );
}

export function SearchInput(props: React.ComponentProps<typeof Input>) {
  return (
    <div className="relative w-[300px]">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        {...props}
        className={cn('h-11 pl-10', props.className)}
      />
    </div>
  );
}

export function SearchButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button onClick={onClick} disabled={disabled} className="h-11">
      <Search data-icon="inline-start" />
      Search
    </Button>
  );
}

export function FilterChip({
  checked,
  onCheckedChange,
  children,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'inline-flex h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition-colors',
        checked
          ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400'
          : 'border-border bg-background text-foreground hover:bg-muted'
      )}
    >
      <span
        className={cn(
          'flex size-4 items-center justify-center rounded-sm border text-[10px] font-bold',
          checked
            ? 'border-rose-500 bg-rose-500 text-white'
            : 'border-muted-foreground/30 bg-transparent text-transparent'
        )}
      >
        ✓
      </span>
      {children}
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="px-6 py-16 text-center text-base text-muted-foreground">
      {children}
    </div>
  );
}

export function ErrorAlert({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <Alert variant="destructive" className="mb-4">
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function SuccessAlert({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <Alert className="mb-4 border-emerald-500/30 bg-emerald-500/10 text-emerald-800">
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

function pageWindow(n: number, totalPages: number, size = 5) {
  if (totalPages <= size) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const half = Math.floor(size / 2);
  let start = Math.max(1, n - half);
  let end = start + size - 1;
  if (end > totalPages) {
    end = totalPages;
    start = end - size + 1;
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export function Pagination({
  page,
  totalPages,
  total,
  limit,
  onChange,
  onLimitChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  limit?: number;
  onChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
}) {
  const pages = pageWindow(page, Math.max(1, totalPages));
  const from = total === 0 ? 0 : (page - 1) * (limit || 20) + 1;
  const to = Math.min(page * (limit || 20), total);

  return (
    <div className="flex flex-col gap-3 border-t bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>
          {total === 0 ? 'No results' : `Showing ${from}–${to} of ${total}`}
        </span>
        {onLimitChange ? (
          <div className="flex items-center gap-2">
            <Label className="text-muted-foreground">Rows</Label>
            <SelectField
              value={String(limit || 20)}
              onValueChange={v => onLimitChange(Number(v))}
              triggerClassName="min-w-[80px] w-[80px]"
              options={[
                { value: '10', label: '10' },
                { value: '20', label: '20' },
                { value: '50', label: '50' },
                { value: '100', label: '100' },
              ]}
            />
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onChange(1)}
        >
          First
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Prev
        </Button>
        {pages.map(p => (
          <Button
            key={p}
            variant={p === page ? 'default' : 'outline'}
            size="sm"
            onClick={() => onChange(p)}
          >
            {p}
          </Button>
        ))}
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onChange(totalPages)}
        >
          Last
        </Button>
      </div>
    </div>
  );
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={next => !next && onClose()}>
      <DialogContent
        className={cn(
          'flex max-h-[90vh] flex-col overflow-hidden p-0',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'
        )}
      >
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? (
          <DialogFooter className="mx-0 mb-0 rounded-none">
            {footer}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm',
        className
      )}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
