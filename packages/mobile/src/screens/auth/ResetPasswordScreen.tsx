import React, { useEffect, useState } from 'react';
import { Animated, Pressable, Text } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { FadeInView, useShake } from '../../components';
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
  passwordRules,
} from '../../components/auth/GlassAuthKit';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { authService } from '../../services';
import { useToastStore } from '../../store/toastStore';
import { isValidEmail } from '../../utils';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'ResetPassword'>;
  route: RouteProp<AuthStackParamList, 'ResetPassword'>;
};

const RESEND_SECONDS = 30;

/** Forgot password: email → 6-digit code → new password → back to Log in. */
export const ResetPasswordScreen: React.FC<Props> = ({ navigation, route }) => {
  const { interfaceType } = route.params;
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [email, setEmail] = useState(route.params.email ?? '');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [verificationId, setVerificationId] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { shakeStyle, shake } = useShake(10);

  useEffect(() => {
    if (step !== 1 || resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [step, resendIn]);

  const fail = (e: unknown, fallback: string) => {
    setError(e instanceof Error && e.message ? e.message : fallback);
    shake();
  };
  const go = (next: 0 | 1 | 2) => {
    setError(null);
    setStep(next);
  };

  const sendCode = async () => {
    const value = email.trim();
    if (!isValidEmail(value)) {
      setEmailError('Check your email address. It looks incomplete.');
      return;
    }
    setBusy(true);
    try {
      const res = await authService.passwordForgot(value);
      setVerificationId(res.verification_id);
      setCode('');
      setResendIn(RESEND_SECONDS);
      go(1);
    } catch (e) {
      fail(e, "We couldn't send a code just now. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    setBusy(true);
    try {
      await authService.passwordVerify(verificationId, value);
      go(2);
    } catch (e) {
      setCode('');
      fail(e, "That code didn't match. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (resendIn > 0) return;
    try {
      await authService.passwordResend(verificationId);
      setResendIn(RESEND_SECONDS);
      setError(null);
      useToastStore.getState().show('A new code is on its way', 'success');
    } catch (e) {
      fail(e, "We couldn't send a new code. Try again.");
    }
  };

  const save = async () => {
    const r = passwordRules(password);
    if (!r.length || !r.number || !r.letter) return;
    setBusy(true);
    try {
      const { email: accountEmail } = await authService.passwordReset(verificationId, password);
      useToastStore.getState().show('Password changed. Log in with your new password.', 'success');
      navigation.replace('Login', { interfaceType, email: accountEmail });
    } catch (e) {
      fail(e, "We couldn't save your new password. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    if (step > 0) return go((step - 1) as 0 | 1);
    navigation.goBack();
  };

  const pw = passwordRules(password);

  return (
    <AuthShell title="Reset password" onBack={back} progress={{ step: step + 1, of: 3 }}>
      <FadeInView key={step} offset={10}>
        {step === 0 ? (
          <>
            <AuthTitle title="Forgot your password?" sub="Enter the email you signed up with. We'll send you a 6-digit code." />
            <Field label="Email" error={emailError}>
              <TextField
                value={email}
                onChangeText={t => {
                  setEmail(t);
                  if (emailError) setEmailError(null);
                  setError(null);
                }}
                onBlur={() => setEmailError(email.trim() && !isValidEmail(email.trim()) ? 'Check your email address. It looks incomplete.' : null)}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="email"
                textContentType="emailAddress"
                autoFocus={!email}
                returnKeyType="send"
                onSubmitEditing={sendCode}
                invalid={!!emailError}
              />
            </Field>
            <AuthButton label="Send code" onPress={sendCode} disabled={!isValidEmail(email.trim())} busy={busy} />
          </>
        ) : step === 1 ? (
          <>
            <AuthTitle
              title="Enter your code"
              sub={
                <>
                  If <Strong>{email.trim()}</Strong> has an account, we sent a 6-digit code to it. Check spam if you can't see it.
                </>
              }
            />
            <Animated.View style={shakeStyle}>
              <CodeBoxes
                value={code}
                onChange={v => {
                  setCode(v);
                  setError(null);
                }}
                onComplete={verify}
                error={!!error}
              />
            </Animated.View>
            <Pressable onPress={resend} disabled={resendIn > 0} hitSlop={8} accessibilityRole="button">
              <Text style={[authStyles.resend, resendIn === 0 && authStyles.resendOn]}>
                {resendIn > 0 ? `Resend code in 0:${String(resendIn).padStart(2, '0')}` : 'Resend code'}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <AuthTitle title="Choose a new password" sub="You'll use it to log in and to confirm bids. It signs you out on other phones." />
            <Field label="New password">
              <PasswordField
                value={password}
                onChangeText={t => {
                  setPassword(t);
                  setError(null);
                }}
                placeholder="At least 8 characters"
                autoComplete="password-new"
                textContentType="newPassword"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={save}
              />
            </Field>
            <PasswordRules password={password} />
            <AuthButton
              label="Save new password"
              onPress={save}
              disabled={!(pw.length && pw.number && pw.letter)}
              busy={busy}
              style={{ marginTop: 16 }}
            />
          </>
        )}
        {error ? (
          <Text style={authStyles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </FadeInView>
    </AuthShell>
  );
};
