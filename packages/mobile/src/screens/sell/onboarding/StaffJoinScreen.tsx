import React, { useEffect, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import {
  AuthButton,
  AuthShell,
  AuthTitle,
  CodeBoxes,
  Field,
  PasswordField,
  PasswordRules,
  Strong,
  TextField,
  authStyles,
  sellerPasswordRules,
} from '../../../components/auth/GlassAuthKit';
import { useAuthStore } from '../../../store';
import { useToastStore } from '../../../store/toastStore';
import { staffService } from '../../../services/staff.service';
import { isValidEmail } from '../../../utils/validation';
import { Eyebrow, Note } from './kit';

const STEP_NAMES = ['Your email', 'Code', 'Password'];
const RESEND_SECONDS = 30;

const toast = (m: string, t: 'success' | 'error' = 'error') => useToastStore.getState().show(m, t);
const msg = (e: unknown) => (e instanceof Error ? e.message : "That didn't work. Try again.");

/**
 * Store staff set up their sign-in from the owner's invite: the email they were added with → the
 * emailed code → a password. Then they're in the staff app; next time they log in with the seller log in.
 */
export const StaffJoinScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { setUser, setInterfaceType } = useAuthStore();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState<string>(route.params?.email ?? '');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendCode = async () => {
    const e = email.trim().toLowerCase();
    if (!isValidEmail(e)) {
      setEmailError('Check your email address. It looks incomplete.');
      return;
    }
    setBusy(true);
    try {
      const r = await staffService.joinStart(e);
      setEmail(r.email);
      setFirstName(r.full_name.split(' ')[0] ?? '');
      setVerificationId(r.verification_id);
      setCode('');
      setCodeError(null);
      setResendIn(RESEND_SECONDS);
      setStep(2);
    } catch (err) {
      setEmailError(msg(err));
    } finally {
      setBusy(false);
    }
  };

  const checkCode = async (value = code) => {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    setCodeError(null);
    try {
      await staffService.joinVerify(verificationId, value);
      setStep(3);
    } catch (err) {
      setCode('');
      setCodeError(msg(err));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (resendIn > 0) return;
    try {
      await staffService.joinResend(verificationId);
      setResendIn(RESEND_SECONDS);
      setCodeError(null);
      toast('We sent a new code', 'success');
    } catch (err) {
      toast(msg(err));
    }
  };

  const pw = sellerPasswordRules(password);
  const passwordOk = pw.length && pw.number && pw.capital;

  const finish = async () => {
    if (!passwordOk) return;
    setBusy(true);
    try {
      const user = await staffService.joinComplete(verificationId, password);
      setPassword('');
      // Into the staff app.
      setInterfaceType('seller');
      setUser(user);
      toast("You're in. Next time, log in with your email and password.", 'success');
    } catch (err) {
      toast(msg(err));
      setBusy(false);
    }
  };

  const back = () => {
    if (step === 1) return navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Splash');
    setStep(1);
  };

  const footer =
    step === 1 ? (
      <AuthButton label="Send code" onPress={sendCode} disabled={!email.trim()} busy={busy} />
    ) : step === 2 ? (
      <AuthButton label="Continue" onPress={() => checkCode()} disabled={code.length !== 6} busy={busy} />
    ) : (
      <AuthButton label="Set up my sign-in" onPress={finish} disabled={!passwordOk} busy={busy} />
    );

  return (
    <AuthShell title="Join a store team" onBack={back} progress={{ step, of: 3 }} footer={footer}>
      <Eyebrow>{`Step ${step} of 3 · ${STEP_NAMES[step - 1]}`}</Eyebrow>

      {step === 1 ? (
        <>
          <AuthTitle
            title="Your email"
            sub="Use the email the store owner added you with. We'll send a 6-digit code to check it's yours."
          />
          <Field label="Email" error={emailError}>
            <TextField
              value={email}
              onChangeText={t => {
                setEmail(t);
                if (emailError) setEmailError(null);
              }}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={sendCode}
              invalid={!!emailError}
              autoFocus
            />
          </Field>
          <Note style={styles.gapTop}>
            No invite? Ask the store owner to add you in their app: Store, then Store staff.
          </Note>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <AuthTitle
            title="Enter your code"
            sub={
              <>
                We sent it to <Strong>{email}</Strong>.
              </>
            }
          />
          <CodeBoxes value={code} onChange={v => (setCode(v), codeError && setCodeError(null))} onComplete={checkCode} error={!!codeError} />
          {codeError ? (
            <Text style={authStyles.error} accessibilityRole="alert">
              {codeError}
            </Text>
          ) : null}
          {resendIn > 0 ? (
            <Text style={authStyles.resend}>Resend code in {resendIn}s</Text>
          ) : (
            <Text style={[authStyles.resend, authStyles.resendOn]} onPress={resend} accessibilityRole="button">
              Resend code
            </Text>
          )}
        </>
      ) : null}

      {step === 3 ? (
        <>
          <AuthTitle
            title={firstName ? `Create a password, ${firstName}` : 'Create a password'}
            sub="You'll log in with your email and this password."
          />
          <Field label="Password">
            <PasswordField
              value={password}
              onChangeText={setPassword}
              placeholder="At least 10 characters"
              autoComplete="password-new"
              textContentType="newPassword"
              returnKeyType="done"
              onSubmitEditing={finish}
              autoFocus
            />
          </Field>
          <PasswordRules password={password} seller />
        </>
      ) : null}
    </AuthShell>
  );
};

const styles = StyleSheet.create({
  gapTop: { marginTop: 16 },
});
