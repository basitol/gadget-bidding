import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CircleDollarSign,
  Gavel,
  LockKeyhole,
  Phone,
  ShieldCheck,
  Sparkles,
  Truck,
} from 'lucide-react';
import { getStoredUser, login } from '@/api';
import { ErrorAlert } from '@/components/shared';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  const [phone, setPhone] = useState('08011111111');
  const [password, setPassword] = useState('Admin1234');
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
    <div className="relative min-h-svh overflow-hidden bg-[#f5f7fb] text-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(37,99,235,0.18),transparent_30%),radial-gradient(circle_at_78%_0%,rgba(14,165,233,0.16),transparent_28%),linear-gradient(135deg,#f8fbff_0%,#eef4ff_55%,#f8fafc_100%)]" />
      <div className="pointer-events-none absolute -left-24 top-24 size-72 rounded-full bg-sky-300/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-16 size-80 rounded-full bg-blue-500/15 blur-3xl" />

      <main className="relative z-10 grid min-h-svh p-3 lg:grid-cols-[1.12fr_0.88fr] lg:p-5">
        <section className="relative hidden overflow-hidden rounded-[2.25rem] bg-slate-950 p-7 text-white shadow-2xl shadow-slate-950/20 lg:flex lg:flex-col">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,#020617_0%,#08111f_45%,#0b2540_100%)]" />
          <div className="pointer-events-none absolute left-0 top-0 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-cyan-400/12 blur-3xl" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-sky-300/60 to-transparent" />

          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-2xl bg-white text-base font-black text-slate-950 shadow-lg shadow-white/10">
                GB
              </div>
              <div>
                <div className="text-lg font-semibold tracking-tight">
                  GadgetBid
                </div>
                <div className="text-sm text-slate-400">Admin console</div>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs text-slate-300 backdrop-blur">
              <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.8)]" />
              Live ops
            </div>
          </div>

          <div className="relative mt-16 grid flex-1 content-center gap-8">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-sm text-sky-100 backdrop-blur">
                <Sparkles className="size-4 text-sky-300" />
                Marketplace operations, cleaned up
              </div>
              <h1 className="mt-6 max-w-[720px] text-6xl font-semibold leading-[0.92] tracking-[-0.065em] text-white">
                Control the marketplace without the clutter.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
                One console for auctions, backoffice intake, disputes, payouts,
                and audit trails — designed around how the team actually works.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">
                      Today’s work
                    </div>
                    <div className="text-xs text-slate-400">
                      Prioritized by operations stage
                    </div>
                  </div>
                  <Activity className="size-5 text-sky-300" />
                </div>
                <div className="space-y-3">
                  <PreviewRow
                    icon={<Truck />}
                    label="Backoffice intake"
                    value="12"
                    tone="blue"
                  />
                  <PreviewRow
                    icon={<Gavel />}
                    label="Live auctions"
                    value="8"
                    tone="violet"
                  />
                  <PreviewRow
                    icon={<CircleDollarSign />}
                    label="Payout queue"
                    value="₦2.4m"
                    tone="emerald"
                  />
                  <PreviewRow
                    icon={<AlertTriangle />}
                    label="Open disputes"
                    value="3"
                    tone="amber"
                  />
                </div>
              </div>

              <div className="relative rounded-[2rem] border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">
                      Fulfillment pipeline
                    </div>
                    <div className="text-xs text-slate-400">
                      Seller → Backoffice → Buyer
                    </div>
                  </div>
                  <BadgeCheck className="size-5 text-emerald-300" />
                </div>
                <div className="space-y-4">
                  <PipelineStep
                    active
                    label="Seller sent item"
                    detail="Awaiting backoffice confirmation"
                  />
                  <PipelineStep
                    active
                    label="Received by backoffice"
                    detail="Condition check complete"
                  />
                  <PipelineStep
                    label="Ship to buyer"
                    detail="Courier tracking required"
                  />
                  <PipelineStep
                    label="Release payout"
                    detail="After delivery is cleared"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-2 py-10 sm:px-6 lg:px-12">
          <Card className="w-full max-w-[448px] rounded-[2rem] border-white/90 bg-white/90 p-2 shadow-2xl shadow-slate-950/10 backdrop-blur-xl">
            <CardHeader className="space-y-6 px-6 pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid size-11 place-items-center rounded-2xl bg-slate-950 text-sm font-black text-white shadow-lg shadow-slate-950/15">
                    GB
                  </div>
                  <div className="lg:hidden">
                    <div className="text-sm font-semibold text-slate-950">
                      GadgetBid
                    </div>
                    <div className="text-xs text-slate-500">Admin console</div>
                  </div>
                </div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                  Admin only
                </div>
              </div>
              <div>
                <CardTitle className="text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                  Sign in to operations
                </CardTitle>
                <CardDescription className="mt-2 text-base text-slate-500">
                  Manage backoffice intake, orders, payouts, disputes, and
                  platform controls.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <form className="space-y-5" onSubmit={onSubmit}>
                <ErrorAlert>{error}</ErrorAlert>
                <div className="space-y-2">
                  <Label
                    htmlFor="phone"
                    className="text-sm font-medium text-slate-700"
                  >
                    Phone number
                  </Label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="phone"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="08011111111"
                      autoComplete="username"
                      className="h-12 rounded-2xl border-slate-200 bg-slate-50 pl-11 text-base shadow-inner shadow-slate-950/[0.02] focus-visible:border-blue-500"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="password"
                    className="text-sm font-medium text-slate-700"
                  >
                    Password
                  </Label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete="current-password"
                      className="h-12 rounded-2xl border-slate-200 bg-slate-50 pl-11 text-base shadow-inner shadow-slate-950/[0.02] focus-visible:border-blue-500"
                    />
                  </div>
                </div>
                <Button
                  className="h-12 w-full rounded-2xl bg-blue-600 text-base font-semibold text-white shadow-xl shadow-blue-600/20 hover:bg-blue-700"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                  <ArrowRight className="size-4" />
                </Button>
              </form>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/60 p-4">
                <div className="flex items-start gap-3">
                  <div className="grid size-9 place-items-center rounded-xl bg-blue-500/10 text-blue-600">
                    <ShieldCheck className="size-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Secure admin session
                    </div>
                    <p className="mt-1 text-sm leading-5 text-slate-500">
                      Access is restricted to admin accounts. Activity is
                      recorded in the audit log.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}

function PreviewRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'blue' | 'violet' | 'emerald' | 'amber';
}) {
  const toneClass = {
    blue: 'bg-blue-400/15 text-blue-200',
    violet: 'bg-violet-400/15 text-violet-200',
    emerald: 'bg-emerald-400/15 text-emerald-200',
    amber: 'bg-amber-400/15 text-amber-200',
  }[tone];

  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/20 p-3">
      <div className="flex items-center gap-3">
        <div
          className={`grid size-9 place-items-center rounded-xl ${toneClass}`}
        >
          {icon}
        </div>
        <span className="text-sm text-slate-300">{label}</span>
      </div>
      <span className="text-sm font-semibold text-white">{value}</span>
    </div>
  );
}

function PipelineStep({
  active,
  label,
  detail,
}: {
  active?: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className={`grid size-7 place-items-center rounded-full border ${
            active
              ? 'border-blue-300 bg-blue-400 text-slate-950'
              : 'border-white/15 bg-white/5 text-slate-500'
          }`}
        >
          {active ? <BadgeCheck className="size-4" /> : null}
        </div>
        <div className="mt-2 h-8 w-px bg-white/10 last:hidden" />
      </div>
      <div>
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="text-xs text-slate-400">{detail}</div>
      </div>
    </div>
  );
}
