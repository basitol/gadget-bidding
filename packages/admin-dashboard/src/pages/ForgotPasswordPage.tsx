import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { passwordReset } from '@/api';
import { AuthField, AuthHeading, AuthLayout, AuthSubmit, authButton, authForm, authInput, authLink } from '@/components/AuthLayout';
import { Seo } from '@/components/Seo';

type Step = 'email' | 'code' | 'password' | 'done';

const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/** Reset by emailed code: email → 6-digit code → new password. */
export function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [id, setId] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (err: any) {
      setError(err.message || "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const start = (e: FormEvent) => {
    e.preventDefault();
    if (!looksLikeEmail(email)) {
      setError('Enter your work email, like name@gadgetsbidding.com.');
      return;
    }
    run(async () => {
      const r = await passwordReset.start(email.trim().toLowerCase());
      setId(r.data.verification_id);
      setStep('code');
    });
  };
  const verify = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await passwordReset.verify(id, code);
      setStep('password');
    });
  };
  // Its own handler so the main button doesn't spin while a new code is sent.
  const resend = async () => {
    setError('');
    try {
      await passwordReset.resend(id);
      setResent(true);
    } catch (err: any) {
      setError(err.message || "Couldn't send it again. Try again in a minute.");
    }
  };
  const finish = (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    run(async () => {
      await passwordReset.finish(id, pw);
      setStep('done');
    });
  };

  return (
    <AuthLayout>
      <Seo title="Reset password" description="Reset your Gadgets Bidding admin password." path="/forgot-password" />
      {step === 'email' ? (
        <form onSubmit={start} noValidate className={authForm}>
          <AuthHeading title="Reset your password">We'll email a 6-digit code to your work email.</AuthHeading>
            <AuthField id="email" label="Work email" error={error || undefined}>
              <input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="name@gadgetsbidding.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                aria-invalid={!!error}
                className={authInput}
              />
            </AuthField>
          <AuthSubmit busy={busy} disabled={!email}>
            {busy ? 'Sending…' : 'Send reset code'}
          </AuthSubmit>
        </form>
      ) : step === 'code' ? (
        <form onSubmit={verify} noValidate className={`${authForm} gb-fade-up`}>
          <AuthHeading title="Check your email">If {email} is on the team, a code is on its way.</AuthHeading>
            <AuthField id="code" label="Reset code" error={error || undefined}>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                aria-invalid={!!error}
                className={`${authInput} tracking-[0.4em] tabular-nums`}
              />
            </AuthField>
          <AuthSubmit busy={busy} disabled={code.length !== 6}>
            {busy ? 'Checking…' : 'Confirm code'}
          </AuthSubmit>
          <button
            type="button"
            disabled={resent}
            onClick={resend}
            className={`${authLink} self-start disabled:text-slate disabled:no-underline`}
          >
            {resent ? 'Code sent again' : 'Send the code again'}
          </button>
        </form>
      ) : step === 'password' ? (
        <form onSubmit={finish} noValidate className={`${authForm} gb-fade-up`}>
          <AuthHeading title="Choose a new password">At least 8 characters.</AuthHeading>
            <AuthField id="new-password" label="New password" error={error || undefined}>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                autoFocus
                value={pw}
                onChange={e => {
                  setPw(e.target.value);
                  setError('');
                }}
                aria-invalid={!!error}
                className={authInput}
              />
            </AuthField>
          <AuthSubmit busy={busy} disabled={!pw}>
            {busy ? 'Saving…' : 'Save new password'}
          </AuthSubmit>
        </form>
      ) : (
        <div className={`${authForm} gb-fade-up`}>
          <AuthHeading title="Password changed">Sign in with your new password.</AuthHeading>
          <Link to="/login" className={`${authButton} grid place-items-center`}>
            Go to sign in
          </Link>
        </div>
      )}
      {step !== 'done' ? (
        <div className="mt-[18px]">
          <Link to="/login" className={authLink}>
            Back to sign in
          </Link>
        </div>
      ) : null}
    </AuthLayout>
  );
}
