import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { A, AuthButton, AuthShell, AuthTitle, CodeBoxes, TextLink, authStyles } from '../../components/auth/GlassAuthKit';
import { fonts } from '../../constants';
import { authService } from '../../services';
import type { TwoFactorStatus, UserWithTwoFactor } from '../../services/auth.service';
import { useAuthStore } from '../../store';
import { useToastStore } from '../../store/toastStore';

/**
 * 2-step sign-in for sellers (route 'TwoStepSetup'): choose a method → add the key / text a code →
 * enter the code → done. Required before the first payout.
 */

const toast = (m: string, t: 'success' | 'error' = 'error') => useToastStore.getState().show(m, t);
const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
// RN core still ships its clipboard module (deprecated, but no extra native dependency or rebuild).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Clipboard: { setString(value: string): void } = require('react-native/Libraries/Components/Clipboard/Clipboard').default;

type Method = 'totp' | 'sms';
type Step = 1 | 2 | 3 | 4;
const RESEND_SECONDS = 30;

/** "ABCD EFGH IJKL …": easier to read and type. */
const groupKey = (key: string) => (key.match(/.{1,4}/g) ?? []).join(' ');

export const TwoStepSetupScreen: React.FC<{ navigation: { goBack: () => void } }> = ({ navigation }) => {
  const setUser = useAuthStore(s => s.setUser);
  const [step, setStep] = useState<Step>(1);
  const [method, setMethod] = useState<Method>('totp');
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const [totp, setTotp] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [sms, setSms] = useState<{ verification_id: string; phone_hint: string } | null>(null);
  const [resendIn, setResendIn] = useState(0);

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  // The user from the confirm call; applied when they leave (Finish, back, or any other way out).
  const confirmed = useRef<UserWithTwoFactor | null>(null);
  useEffect(
    () => () => {
      if (confirmed.current) useAuthStore.getState().setUser(confirmed.current);
    },
    []
  );

  useEffect(() => {
    authService
      .getTwoFactor()
      .then(s => {
        setStatus(s);
        if (s.method === 'sms' && s.sms_phone_hint) setMethod('sms');
        else if (!s.sms_phone_hint) setMethod('totp');
      })
      .catch(() => setStatus({ enabled: false, method: null, email_hint: null, sms_phone_hint: null }));
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const phoneHint = sms?.phone_hint ?? status?.sms_phone_hint ?? null;
  const smsAvailable = !!status?.sms_phone_hint;

  const finish = () => {
    if (confirmed.current) {
      setUser(confirmed.current);
      confirmed.current = null;
    }
    navigation.goBack();
  };

  const back = () => {
    if (step === 4) return finish();
    if (step === 1) return navigation.goBack();
    setCode('');
    setCodeError(null);
    setStep((step - 1) as Step);
  };

  /* ---- Step 1 → 2 ---- */
  const chooseMethod = async () => {
    if (method === 'sms') return setStep(2);
    setBusy(true);
    try {
      setTotp(await authService.setupAuthenticator());
      setStep(2);
    } catch (e) {
      toast(errText(e, "We couldn't start that. Try again."));
    } finally {
      setBusy(false);
    }
  };

  /* ---- SMS: text a code (step 2, and "Send a new code" on step 3) ---- */
  const sendCode = async () => {
    setBusy(true);
    try {
      setSms(await authService.sendTwoFactorSetupCode());
      setResendIn(RESEND_SECONDS);
      setCode('');
      setCodeError(null);
      if (step === 3) toast('We sent a new code', 'success');
      setStep(3);
    } catch (e) {
      toast(errText(e, "We couldn't send the code. Try again."));
    } finally {
      setBusy(false);
    }
  };

  /* ---- Step 3 → 4 ---- */
  const confirm = async (value = code) => {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    setCodeError(null);
    try {
      confirmed.current = await authService.confirmTwoFactor(method, value, method === 'sms' ? sms?.verification_id : undefined);
      setStep(4);
    } catch (e) {
      setCode('');
      setCodeError(errText(e, "That code didn't match. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const copyKey = () => {
    if (!totp) return;
    Clipboard.setString(totp.secret);
    toast('Key copied', 'success');
  };

  const openApp = () => {
    if (!totp) return;
    Linking.openURL(totp.otpauth_uri).catch(() =>
      toast("We couldn't find an authenticator app. Install one, or copy the key into it.")
    );
  };

  const footer =
    step === 1 ? (
      <AuthButton label="Continue" onPress={chooseMethod} busy={busy} disabled={method === 'sms' && !smsAvailable} />
    ) : step === 2 ? (
      method === 'totp' ? (
        <AuthButton label="Continue" onPress={() => setStep(3)} />
      ) : (
        <AuthButton label="Send code" onPress={sendCode} busy={busy} />
      )
    ) : step === 3 ? (
      <AuthButton label="Turn on 2-step sign-in" onPress={() => confirm()} disabled={code.length !== 6} busy={busy} />
    ) : (
      <AuthButton label="Finish" onPress={finish} />
    );

  return (
    <AuthShell title="2-step sign-in" onBack={back} progress={{ step, of: 4 }} footer={footer}>
      {step === 1 ? (
        <>
          <AuthTitle
            title="Protect your payouts"
            sub="Each time you sign in on a new phone, we'll ask for a code too. Required before your first payout."
          />
          <View style={styles.options} accessibilityRole="radiogroup">
            <MethodCard
              title="Authenticator app"
              sub="Recommended · works without signal"
              selected={method === 'totp'}
              onPress={() => setMethod('totp')}
            />
            <MethodCard
              title="Text message (SMS)"
              sub={
                status === null
                  ? 'Codes sent to your business phone'
                  : smsAvailable
                    ? `Codes sent to ${status.sms_phone_hint}`
                    : 'Add a business phone to your seller details first'
              }
              selected={method === 'sms'}
              disabled={status !== null && !smsAvailable}
              onPress={() => setMethod('sms')}
            />
          </View>
        </>
      ) : null}

      {step === 2 && method === 'totp' && totp ? (
        <>
          <AuthTitle
            title="Add this key to your app"
            sub="In your authenticator app, add an account with a setup key and paste this one. Or open the app from here."
          />
          <View style={styles.card}>
            <Text style={styles.overline}>Setup key</Text>
            <Text style={styles.key} selectable accessibilityLabel={`Setup key ${totp.secret.split('').join(' ')}`}>
              {groupKey(totp.secret)}
            </Text>
            <Pressable
              onPress={copyKey}
              hitSlop={8}
              style={({ pressed }) => [styles.copy, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Copy key"
            >
              <Ionicons name="copy-outline" size={16} color={A.blue600} />
              <Text style={styles.copyText}>Copy key</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={openApp}
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Ionicons name="open-outline" size={18} color={A.ink} />
            <Text style={styles.secondaryText}>Open authenticator app</Text>
          </Pressable>
          <View style={styles.note}>
            <Text style={styles.noteText}>Keep this key private. Anyone who has it can make your codes.</Text>
          </View>
        </>
      ) : null}

      {step === 2 && method === 'sms' ? (
        <>
          <AuthTitle title="Text a code to your phone" sub="We'll send a 6-digit code to your business phone to check it's yours." />
          <View style={[styles.card, styles.phoneCard]}>
            <Image source={require('../../../assets/icons/phonecheck.png')} style={styles.phoneIcon} />
            <View style={styles.flex}>
              <Text style={styles.cardSub}>Business phone</Text>
              <Text style={styles.cardTitle}>{phoneHint}</Text>
            </View>
          </View>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <AuthTitle
            title="Enter the 6-digit code"
            sub={
              method === 'totp'
                ? 'Type the code your authenticator app shows for Gadgets Bidding. It changes every 30 seconds.'
                : `We texted a code to ${phoneHint}. It works for 10 minutes.`
            }
          />
          <CodeBoxes
            value={code}
            onChange={v => {
              setCode(v);
              if (codeError) setCodeError(null);
            }}
            onComplete={confirm}
            error={!!codeError}
          />
          {codeError ? (
            <Text style={authStyles.error} accessibilityRole="alert">
              {codeError}
            </Text>
          ) : null}
          {method === 'sms' ? (
            resendIn > 0 ? (
              <Text style={authStyles.resend}>Send a new code in 0:{String(resendIn).padStart(2, '0')}</Text>
            ) : (
              <TextLink label="Send a new code" onPress={sendCode} style={styles.resendLink} />
            )
          ) : null}
        </>
      ) : null}

      {step === 4 ? (
        <View style={styles.hero}>
          <View style={styles.heroTile}>
            <Image source={require('../../../assets/icons/shield.png')} style={styles.heroImg} />
          </View>
          <Text style={styles.heroTitle} accessibilityRole="header">
            2-step sign-in is on
          </Text>
          <Text style={styles.heroSub}>
            {method === 'totp'
              ? "When you sign in on a new phone, we'll ask for a code from your authenticator app."
              : `When you sign in on a new phone, we'll text a code to ${phoneHint}.`}
          </Text>
        </View>
      ) : null}
    </AuthShell>
  );
};

const MethodCard: React.FC<{
  title: string;
  sub: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}> = ({ title, sub, selected, disabled, onPress }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [styles.option, selected && !disabled && styles.optionOn, pressed && styles.pressed]}
    accessibilityRole="radio"
    accessibilityState={{ selected: selected && !disabled, disabled }}
    accessibilityLabel={`${title}. ${sub}`}
  >
    <View style={[styles.radio, selected && !disabled && styles.radioOn]}>
      {selected && !disabled ? <View style={styles.radioDot} /> : null}
    </View>
    <View style={styles.flex}>
      <Text style={[styles.cardTitle, disabled && styles.textOff]}>{title}</Text>
      <Text style={styles.cardSub}>{sub}</Text>
    </View>
  </Pressable>
);

const glass = {
  borderRadius: 18,
  backgroundColor: 'rgba(255,255,255,0.56)',
  borderWidth: 1.5,
  borderColor: 'rgba(255,255,255,0.75)',
} as const;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },

  options: { gap: 12 },
  option: { ...glass, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, minHeight: 72 },
  optionOn: { backgroundColor: '#FFFFFF', borderColor: A.blue },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#CED3DF', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: A.blue, backgroundColor: A.blue },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  cardTitle: { color: A.ink, fontSize: 16, fontFamily: fonts.medium },
  cardSub: { color: A.slate, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, marginTop: 2 },
  textOff: { color: A.faint },

  card: { ...glass, padding: 16 },
  overline: { color: A.slate, fontSize: 13, letterSpacing: 0.52, textTransform: 'uppercase', fontFamily: fonts.medium },
  key: { color: A.ink, fontSize: 19, lineHeight: 28, letterSpacing: 1, fontFamily: fonts.medium, fontVariant: ['tabular-nums'], marginTop: 8 },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 44, marginTop: 4 },
  copyText: { color: A.blue600, fontSize: 14, fontFamily: fonts.medium },

  secondary: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  secondaryText: { color: A.ink, fontSize: 16, fontFamily: fonts.medium },

  note: { marginTop: 16, padding: 16, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.6)' },
  noteText: { color: A.slate, fontSize: 14, lineHeight: 21, fontFamily: fonts.regular },

  phoneCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  phoneIcon: { width: 40, height: 40, resizeMode: 'contain' },

  resendLink: { alignSelf: 'center', marginTop: 20 },

  hero: { alignItems: 'center', marginTop: 32 },
  heroTile: { width: 88, height: 88, borderRadius: 24, backgroundColor: '#F1F5FF', alignItems: 'center', justifyContent: 'center' },
  heroImg: { width: 60, height: 60, resizeMode: 'contain' },
  heroTitle: { color: A.ink, fontSize: 26, lineHeight: 32, letterSpacing: -0.52, fontFamily: fonts.medium, marginTop: 20, textAlign: 'center' },
  heroSub: { color: A.slate, fontSize: 16, lineHeight: 24, fontFamily: fonts.regular, marginTop: 8, textAlign: 'center', paddingHorizontal: 8 },
});
