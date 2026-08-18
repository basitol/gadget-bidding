import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { getStoredUser, login } from '@/api';
import { BrandIllustration } from '@/components/BrandIllustration';
import { BrandMark, BrandPill } from '@/components/BrandMark';
import { ErrorAlert } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
          <BrandPill />
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
            <BrandMark size="lg" />
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
