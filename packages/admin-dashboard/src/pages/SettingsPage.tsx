import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { adminApi, clearSession, getStoredUser, setSession } from '@/api';
import { AppControls } from '@/components/AppControls';
import { SectionCard } from '@/components/attention';
import { Icon3d } from '@/components/shell/Icon3d';
import { PageHeader } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** Your account: who you're signed in as, 2-step sign-in, password, sign out. */
export function SettingsPage() {
  const user = getStoredUser() as (ReturnType<typeof getStoredUser> & { email?: string; two_factor_enabled?: boolean }) | null;
  const [twoStep, setTwoStep] = useState(!!user?.two_factor_enabled);
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const res = await adminApi.setTwoFactor(!twoStep, password);
      const on = res.data.two_factor_enabled;
      setTwoStep(on);
      const token = localStorage.getItem('gb_admin_token');
      if (token && user) setSession(token, { ...user, two_factor_enabled: on } as any, localStorage.getItem('gb_admin_refresh_token') || undefined);
      toast.success(on ? '2-step sign-in is on. We’ll email a code each time you sign in.' : '2-step sign-in is off.');
      setAsking(false);
      setPassword('');
    } catch (err: any) {
      toast.error(err.message || "That didn't work. Check your password and try again.");
    } finally {
      setBusy(false);
    }
  };

  const rows: [string, string][] = [
    ['Name', user?.full_name || '—'],
    ['Email', user?.email || '—'],
    ['Role', 'Admin'],
  ];

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Your account, how you sign in, app versions and maintenance."
        path="/settings"
      />
      <div className="grid gap-4">
        <SectionCard icon={<Icon3d name="idcard" size={26} />} title="Your account">
          <dl>
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center gap-6 border-b border-line px-6 py-3.5 last:border-0">
                <dt className="w-40 text-[15px] text-slate">{k}</dt>
                <dd className="text-[15px] font-medium text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>

        <SectionCard icon={<Icon3d name="shield" size={26} />} title="Signing in">
          <div className="flex items-center gap-4 border-b border-line px-6 py-4">
            <div className="flex-1">
              <div className="text-[15px] font-medium text-ink">2-step sign-in</div>
              <div className="text-[13px] text-slate">After your password, we email a 6-digit code to {user?.email || 'your work email'}.</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={twoStep}
              aria-label="2-step sign-in"
              onClick={() => setAsking(true)}
              className={cn(
                'relative h-7 w-12 rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-brand',
                twoStep ? 'bg-blue-brand' : 'bg-line'
              )}
            >
              <span
                className={cn(
                  'shadow-toggle absolute top-0.5 size-6 rounded-full bg-white transition-[left] duration-150',
                  twoStep ? 'left-[22px]' : 'left-0.5'
                )}
              />
            </button>
          </div>
          {asking ? (
            <form
              className="flex flex-wrap items-end gap-3 border-b border-line bg-fill/60 px-6 py-4"
              onSubmit={e => {
                e.preventDefault();
                if (password) save();
              }}
            >
              <div className="min-w-60 flex-1 space-y-2">
                <Label htmlFor="confirm-password">Confirm with your password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="h-11 rounded-[12px] bg-white"
                />
              </div>
              <Button type="button" variant="outline" className="h-11 rounded-[10px]" onClick={() => setAsking(false)}>
                Cancel
              </Button>
              <Button type="submit" className="h-11 rounded-[10px]" disabled={!password || busy}>
                {twoStep ? 'Turn off 2-step sign-in' : 'Turn on 2-step sign-in'}
              </Button>
            </form>
          ) : null}
          <div className="flex items-center gap-4 px-6 py-4">
            <div className="flex-1">
              <div className="text-[15px] font-medium text-ink">Password</div>
              <div className="text-[13px] text-slate">We email you a code, then you choose a new one.</div>
            </div>
            <Button asChild variant="outline" className="h-10 rounded-[10px]">
              <Link to="/forgot-password">Change password</Link>
            </Button>
          </div>
        </SectionCard>

        <h2 className="mt-4 text-[13px] font-medium uppercase tracking-[0.04em] text-hint">The app</h2>
        <AppControls />

        <div>
          <Button
            variant="outline"
            className="h-10 rounded-[10px] border-[#D9536A] text-[#D9536A] hover:bg-[#FDF0F2] hover:text-[#D9536A]"
            onClick={() => {
              clearSession();
              window.location.href = '/login';
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
