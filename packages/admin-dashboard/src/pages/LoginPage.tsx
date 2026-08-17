import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Sparkle } from 'lucide-react';
import { getStoredUser, login } from '@/api';
import { ErrorAlert } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.startsWith('234') && digits.length === 13) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) {
    return `+234${digits.slice(1)}`;
  }
  if (digits.length === 10) return `+234${digits}`;
  return input.trim();
}

export function LoginPage() {
  const navigate = useNavigate();
  const existing = getStoredUser();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (existing?.role === 'admin' && localStorage.getItem('gb_admin_token')) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(normalizePhone(phone), password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-2">
      <div className="relative hidden flex-col bg-muted/60 lg:flex">
        <div className="relative z-10 shrink-0 px-16 pt-16 xl:px-20 xl:pt-20">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3.5 py-1.5 text-sm font-semibold text-muted-foreground">
            <Sparkle className="size-3.5" fill="currentColor" />
            GadgetBid Ops
          </span>
          <h2 className="mt-6 max-w-md text-4xl font-bold leading-tight tracking-tight text-foreground xl:text-5xl">
            Run the marketplace, calmly.
          </h2>
          <p className="mt-4 max-w-sm text-base leading-7 text-muted-foreground xl:text-lg">
            Listings, auctions, disputes, and payouts — everything your team
            needs to keep GadgetBid moving, in one console.
          </p>
        </div>
        <div className="relative min-h-0 flex-1">
          <BrandIllustration />
        </div>
      </div>

      <div className="flex flex-col items-center justify-center px-8 py-14 sm:px-14">
        <div className="w-full max-w-[400px]">
          <div className="mb-10 flex flex-col items-center gap-5 text-center">
            <div className="grid size-12 place-items-center rounded-xl bg-slate-950 text-white">
              <Sparkle className="size-5" fill="currentColor" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                Welcome back
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Sign in to GadgetBid operations.
              </p>
            </div>
          </div>

          <form className="space-y-5" onSubmit={onSubmit}>
            <ErrorAlert>{error}</ErrorAlert>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="08011111111"
                autoComplete="username"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="h-11 pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>

            <Button className="h-11 w-full" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Restricted to GadgetBid admin accounts. Activity is recorded in
            the audit log.
          </p>
        </div>
      </div>
    </div>
  );
}


function BrandIllustration() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* scattered decorative accents */}
      <span className="absolute left-[12%] top-[16%] size-2.5 rounded-full bg-primary/25" />
      <span className="absolute left-[68%] top-[10%] size-1.5 rounded-full bg-amber-400/40" />
      <span className="absolute left-[80%] top-[28%] size-3 rounded-full border-2 border-slate-300" />
      <span className="absolute left-[24%] top-[36%] size-1.5 rounded-full bg-slate-300" />
      <Sparkle className="absolute left-[76%] top-[52%] size-4 text-primary/30" />
      <Sparkle className="absolute left-[16%] top-[58%] size-3 text-amber-400/50" />

      <div className="absolute inset-0 flex items-end justify-center">
        <div className="relative -mb-4 h-[92%] w-full max-w-[520px] xl:max-w-[600px]">
          {/* ground shadow */}
          <div className="absolute -bottom-2 left-1/2 h-8 w-[78%] -translate-x-1/2 rounded-full bg-slate-950/10 blur-md" />

          {/* pill shape (amber) */}
          <div className="absolute bottom-0 right-[10%] h-[56%] w-[24%] rounded-t-[999px] rounded-b-2xl bg-amber-300 shadow-sm">
            <Face tone="dark" mouth="flat" />
          </div>

          {/* tall card shape (blue) */}
          <div className="absolute bottom-0 left-[10%] h-[70%] w-[36%] rounded-2xl bg-primary shadow-sm">
            <div className="absolute inset-x-3 top-2 h-2 rounded-full bg-white/15" />
            <Face tone="light" mouth="smile" />
          </div>

          {/* slanted card (slate) */}
          <div className="absolute bottom-0 left-[40%] h-[52%] w-[22%] origin-bottom -rotate-6 rounded-xl bg-slate-800 shadow-sm">
            <div className="absolute left-1/2 top-[18%] flex -translate-x-1/2 gap-1.5">
              <span className="h-1 w-3 rounded-full bg-white/25" />
              <span className="h-1 w-3 rounded-full bg-white/25" />
              <span className="h-1 w-3 rounded-full bg-white/25" />
            </div>
          </div>

          {/* sun / disc — frontmost, covers just the lower third of the others */}
          <div className="absolute bottom-0 left-1/2 h-[210px] w-[300px] -translate-x-1/2 rounded-t-full bg-sky-300">
            <div className="absolute left-[18%] top-[10%] h-4 w-11 -rotate-12 rounded-full bg-white/25" />
            <Face tone="dark" mouth="smile" top="22%" />
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
}: {
  tone: 'light' | 'dark';
  mouth: 'smile' | 'flat';
  top?: string;
}) {
  const dot = tone === 'light' ? 'bg-white' : 'bg-slate-900';
  const mouthColor = tone === 'light' ? 'border-white' : 'border-slate-900';
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2"
      style={{ top }}
    >
      <div className="flex items-center gap-4">
        <span className={cn('size-3.5 rounded-full', dot)} />
        <span className={cn('size-3.5 rounded-full', dot)} />
      </div>
      {mouth === 'smile' ? (
        <div
          className={cn(
            'mx-auto mt-3 h-3.5 w-7 rounded-b-full border-b-4',
            mouthColor
          )}
        />
      ) : (
        <div
          className={cn(
            'mx-auto mt-3.5 h-1 w-7 rounded-full',
            tone === 'light' ? 'bg-white' : 'bg-slate-900'
          )}
        />
      )}
    </div>
  );
}
