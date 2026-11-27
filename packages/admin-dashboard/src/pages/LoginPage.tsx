import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { getStoredUser, login, loginWithCode } from '@/api';
import { AuthField, AuthHeading, AuthLayout, AuthSubmit, authForm, authInput, authLink } from '@/components/AuthLayout';
import { Seo } from '@/components/Seo';
import { PAGES } from '@/lib/site';

const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export function LoginPage() {
  const navigate = useNavigate();
  const existing = getStoredUser();
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
      {twoStep ? (
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
