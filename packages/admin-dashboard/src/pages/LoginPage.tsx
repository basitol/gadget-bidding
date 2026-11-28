import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { ApiError, PAUSED_KEY, getStoredUser, login, loginWithCode, type PauseDetails } from '@/api';
import { AuthField, AuthHeading, AuthLayout, AuthSubmit, authForm, authInput, authLink } from '@/components/AuthLayout';
import { Seo } from '@/components/Seo';
import { PAGES } from '@/lib/site';

const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/** "Nov 26 at 10:14 am" (Lagos time). */
const pausedWhen = (iso: string) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Africa/Lagos' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' }).toLowerCase();
  return `${day} at ${time}`;
};

/** A session paused mid-use leaves the details here (see api.ts). */
const readPaused = (): PauseDetails | null => {
  try {
    const raw = sessionStorage.getItem(PAUSED_KEY);
    return raw ? (JSON.parse(raw) as PauseDetails) : null;
  } catch {
    return null;
  }
};

/** The design's "Your admin access is paused": who, when and the reason the admin gave. */
function PausedNotice({ details, onBack }: { details: PauseDetails; onBack: () => void }) {
  return (
    <div className="gb-fade-up flex flex-col items-center text-center" role="alert">
      <span className="grid size-14 place-items-center rounded-[16px] bg-[#FFF6EE] text-[#DB7A2E]">
        <Lock className="size-6" aria-hidden />
      </span>
      <h1 className="mt-5 text-[26px] font-medium leading-[35px] tracking-[-0.02em] text-ink">Your admin access is paused</h1>
      <p className="mt-2 text-[15px] leading-[1.5] text-slate">
        An admin paused {details.email ? <span className="font-medium text-ink">{details.email}</span> : 'your account'}
        {details.paused_at ? ` on ${pausedWhen(details.paused_at)}` : ''}.
      </p>
      {details.reason ? (
        <p className="mt-4 w-full rounded-[12px] bg-[#FFF6EE] px-4 py-3 text-left text-[14px] leading-5 text-[#9A5A1F]">
          <span className="font-medium text-[#DB7A2E]">Reason:</span> “{details.reason}”
        </p>
      ) : (
        <p className="mt-4 w-full rounded-[12px] bg-fill px-4 py-3 text-left text-[14px] leading-5 text-slate">
          No reason was given. Ask the ops lead why, or to switch your access back on.
        </p>
      )}
      <button
        type="button"
        onClick={onBack}
        className="mt-6 h-[50px] w-full rounded-[12px] bg-blue-brand text-[16px] font-medium text-white transition-colors duration-150 hover:bg-blue-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-brand"
      >
        Back to sign in
      </button>
    </div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const existing = getStoredUser();
  const [paused, setPaused] = useState<PauseDetails | null>(() => (params.get('paused') ? readPaused() : null));
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [twoStep, setTwoStep] = useState<{ id: string; hint: string } | null>(null);
  const [code, setCode] = useState('');

  if (existing?.role === 'admin' && localStorage.getItem('gb_admin_token')) {
    return <Navigate to="/" replace />;
  }

  const backToSignIn = () => {
    sessionStorage.removeItem(PAUSED_KEY);
    setPaused(null);
    setPassword('');
    if (params.get('paused')) setParams({}, { replace: true });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!looksLikeEmail(email)) {
      setEmailError('Enter your work email, like name@gadgetsbidding.com.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const res = await login(email.trim().toLowerCase(), password);
      if (res.done) navigate('/');
      else setTwoStep({ id: res.verification_id, hint: res.email_hint });
    } catch (err: any) {
      if (err instanceof ApiError && err.code === 'ADMIN_PAUSED') {
        setPaused((err.data as PauseDetails) ?? { email: email.trim().toLowerCase(), paused_at: null, reason: null });
        return;
      }
      setError(err.message || "That email and password don't match. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!twoStep) return;
    setError('');
    setBusy(true);
    try {
      await loginWithCode(twoStep.id, code.trim());
      navigate('/');
    } catch (err: any) {
      setError(err.message || "That code didn't match. Check the email and try again.");
    } finally {
      setBusy(false);
    }
  };

  const seo = PAGES['/login'];

  return (
    <AuthLayout>
      <Seo title={seo.title} description={seo.description} path={seo.path} noindex={false} />
      {paused ? (
        <PausedNotice details={paused} onBack={backToSignIn} />
      ) : twoStep ? (
        <form onSubmit={submitCode} noValidate className={`${authForm} gb-fade-up`}>
          <AuthHeading title="Check your email">We sent a 6-digit code to {twoStep.hint}.</AuthHeading>
          <AuthField id="code" label="Sign-in code" error={error || undefined}>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                value={code}
                onChange={e => {
                  setCode(e.target.value.replace(/\D/g, ''));
                  setError('');
                }}
                aria-invalid={!!error}
                aria-describedby={error ? 'code-error' : undefined}
                className={`${authInput} tracking-[0.4em] tabular-nums`}
              />
          </AuthField>
          <AuthSubmit busy={busy} disabled={code.length !== 6}>
            {busy ? 'Checking…' : 'Sign in'}
          </AuthSubmit>
          <button
            type="button"
            onClick={() => {
              setTwoStep(null);
              setCode('');
              setError('');
            }}
            className={`${authLink} self-start`}
          >
            Use a different account
          </button>
        </form>
      ) : (
        <form onSubmit={submit} noValidate className={authForm}>
          <AuthHeading title="Sign in">Use your work email.</AuthHeading>
          <AuthField id="email" label="Work email" error={emailError || undefined}>
              <input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="name@gadgetsbidding.com"
                value={email}
                onChange={e => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError('');
                  setError('');
                }}
                onBlur={() => {
                  if (email && !looksLikeEmail(email)) setEmailError('Enter your work email, like name@gadgetsbidding.com.');
                }}
                aria-invalid={!!emailError}
                aria-describedby={emailError ? 'email-error' : undefined}
                className={authInput}
              />
            </AuthField>
            <AuthField id="password" label="Password" error={error || undefined}>
              <div className="relative">
                <input
                  id="password"
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  aria-invalid={!!error}
                  aria-describedby={error ? 'password-error' : undefined}
                  className={`${authInput} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShow(s => !s)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                  className="absolute right-[5px] top-[5px] grid size-10 place-items-center rounded-[10px] text-slate hover:text-ink focus-visible:outline-2 focus-visible:outline-blue-brand"
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
          </AuthField>
          <AuthSubmit busy={busy} disabled={!email || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </AuthSubmit>
          <div className="flex justify-between">
            <Link to="/forgot-password" className={authLink}>
              Forgot password?
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
