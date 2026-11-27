import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Animated,
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { FadeInView, PopIn, useShake } from '../../components';
import { PasswordField, TextField } from '../../components/auth/GlassAuthKit';
import { fonts } from '../../constants';
import { authService } from '../../services';
import { registerForPush } from '../../services/pushNotifications';
import { useAuthStore } from '../../store';
import { isValidEmail } from '../../utils';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'SignUpFlow'>;
};

const C = {
  blue: '#4F7BFF',
  blue600: '#3E6AF0',
  blueTint: '#EEF2FF',
  ink: '#1C1F2A',
  slate: '#5C6273',
  muted: '#7C8293',
  faint: '#A9AEBB',
  line: '#E3E6EE',
  green: '#2E9E5E',
  red: '#D9536A',
  disabled: '#EDEFF4',
};
const MONO = 'Satoshi-Medium';

const STEPS = ['EMAIL', 'CODE', 'PASSWORD', 'NAME', 'INTERESTS'] as const;
const RESEND_SECONDS = 30;

const CATEGORIES = [
  { key: 'phones', label: 'Phones', img: require('../../../assets/devices/phone.png') },
  { key: 'laptops', label: 'Laptops', img: require('../../../assets/devices/laptop.png') },
  { key: 'audio', label: 'Audio', img: require('../../../assets/devices/headphones.png') },
  { key: 'gaming', label: 'Gaming', img: require('../../../assets/devices/gamepad.png') },
  { key: 'wearables', label: 'Wearables', img: require('../../../assets/devices/watch.png') },
  { key: 'tablets', label: 'Tablets', img: require('../../../assets/devices/tablet.png') },
];
const BUDGETS = [
  { key: 'under_300k', label: 'Under ₦300k' },
  { key: '300k_800k', label: '₦300k–₦800k' },
  { key: '800k_plus', label: '₦800k+' },
  { key: 'any', label: 'Any' },
];
const ALERTS = [
  { label: "You've been outbid", icon: require('../../../assets/icons/gavel.png') },
  { label: 'An auction you watch ends soon', icon: require('../../../assets/icons/bell.png') },
  { label: 'Time to pay for a win', icon: require('../../../assets/icons/wallet.png') },
];

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/** True while the keyboard is up, so the footer can drop its home-indicator padding. */
const useKeyboardOpen = () => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
};

/** Email-first buyer sign-up: email → code → password → name → interests → notifications. */
export const SignUpFlowScreen: React.FC<Props> = ({ navigation }) => {
  const [step, setStep] = useState(0); // 0–4 = steps, 5 = welcome
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [code, setCode] = useState('');
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [usernameTaken, setUsernameTaken] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [budget, setBudget] = useState<string | null>(null);
  const [createdUser, setCreatedUser] = useState<any>(null);

  const { shakeStyle, shake } = useShake(10);
  const codeInput = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardOpen();
  // Footer is a frosted bar that runs under the home indicator (design guide: Layout).
  const footerInset = { paddingBottom: keyboardOpen ? 8 : insets.bottom + 8 };

  // Resend countdown on the code step
  useEffect(() => {
    if (step !== 1 || resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [step, resendIn]);

  // Username availability (debounced)
  useEffect(() => {
    setUsernameTaken(false);
    if (!USERNAME_RE.test(username)) return;
    const t = setTimeout(async () => {
      setUsernameTaken(!(await authService.usernameAvailable(username)));
    }, 400);
    return () => clearTimeout(t);
  }, [username]);

  const pw = {
    length: password.length >= 8,
    number: /[0-9]/.test(password),
    letter: /[A-Za-z]/.test(password),
  };

  const canContinue = useMemo(() => {
    switch (step) {
      case 0:
        return isValidEmail(email.trim());
      case 1:
        return code.length === 6;
      case 2:
        return pw.length && pw.number && pw.letter;
      case 3:
        return !!firstName.trim() && !!lastName.trim() && USERNAME_RE.test(username) && !usernameTaken;
      case 4:
        return categories.length > 0;
      default:
        return true;
    }
  }, [step, email, code, pw.length, pw.number, pw.letter, firstName, lastName, username, usernameTaken, categories]);

  const go = (next: number) => {
    setError(null);
    setStep(next);
  };

  const fail = (e: unknown) => {
    setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    shake();
  };

  const verifyCode = async (value: string) => {
    setBusy(true);
    try {
      await authService.signupVerify(verificationId, value);
      go(2);
    } catch (e) {
      setCode('');
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!canContinue || busy) return;
    if (step === 1) return verifyCode(code);
    if (step === 2 || step === 3) return go(step + 1);

    setBusy(true);
    try {
      if (step === 0) {
        const res = await authService.signupStart(email.trim());
        setVerificationId(res.verification_id);
        setCode('');
        setResendIn(RESEND_SECONDS);
        go(1);
      } else if (step === 4) {
        const user = await authService.signupComplete({
          verification_id: verificationId,
          password,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          username,
          interests: { categories, budget },
        });
        setCreatedUser(user);
        go(5);
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (resendIn > 0) return;
    try {
      await authService.signupResend(verificationId);
      setResendIn(RESEND_SECONDS);
      setError(null);
    } catch (e) {
      fail(e);
    }
  };

  const back = () => {
    if (step > 0 && step < 5) return go(step - 1);
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Splash');
  };

  // The account already exists by now; this only decides when to show the app.
  const enterApp = async (askForNotifications: boolean) => {
    if (askForNotifications) {
      // Prompt, then save this phone's push token (the session is already stored).
      setBusy(true);
      await registerForPush({ ask: true });
      setBusy(false);
    }
    const store = useAuthStore.getState();
    store.setInterfaceType('buyer');
    store.setUser(createdUser);
  };

  const toggleCategory = (key: string) =>
    setCategories(c => (c.includes(key) ? c.filter(k => k !== key) : [...c, key]));

  const buttonLabel = [
    'Send code',
    'Continue',
    'Continue',
    'Continue',
    categories.length
      ? `Continue with ${categories.length} ${categories.length === 1 ? 'category' : 'categories'}`
      : 'Pick at least one',
  ][step];

  /* ---------------- Welcome ---------------- */
  if (step === 5) {
    return (
      <View style={styles.root}>
        <StatusBar style="dark" />
        <Image source={require('../../../assets/backgrounds/glass-bg.jpg')} style={styles.bg} />
        <SafeAreaView style={styles.safe} edges={['top']}>
          <View style={styles.welcome}>
            <PopIn>
              <View style={styles.bellTile}>
                <Image source={require('../../../assets/icons/bell.png')} style={styles.bellIcon} />
              </View>
            </PopIn>
            <FadeInView delay={120} offset={12}>
              <Text style={styles.welcomeTitle} accessibilityRole="header">
                You're in, {firstName.trim()}!
              </Text>
              <Text style={styles.welcomeSub}>
                Turn on notifications so you know the second you're outbid or win. Auctions move
                fast.
              </Text>
            </FadeInView>
            <FadeInView delay={220} offset={12} style={styles.alertCard}>
              {ALERTS.map((a, i) => (
                <View key={a.label} style={[styles.alertRow, i > 0 && styles.alertRowBorder]}>
                  <Image source={a.icon} style={styles.alertIcon} />
                  <Text style={styles.alertText}>{a.label}</Text>
                </View>
              ))}
            </FadeInView>
          </View>
          <View style={[styles.footer, footerInset]}>
            <Pressable
              onPress={() => enterApp(true)}
              disabled={busy}
              style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryText}>Turn on notifications</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => enterApp(false)}
              disabled={busy}
              style={styles.textButton}
              accessibilityRole="button"
            >
              <Text style={styles.textButtonLabel}>Not now</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  /* ---------------- Steps 1–5 ---------------- */
  const header = [
    { title: "What's your email?", sub: "We'll send a 6-digit code to confirm it's you." },
    { title: 'Enter your code', sub: null },
    { title: 'Create a password', sub: "You'll use it to log in and to confirm bids." },
    { title: "What's your name?", sub: null },
    { title: 'What are you hunting for?', sub: "Pick a few and we'll fill your Home with auctions you'll care about." },
  ][step];

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Image source={require('../../../assets/backgrounds/glass-bg.jpg')} style={styles.bg} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <Pressable
              onPress={back}
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back" size={20} color={C.ink} />
            </Pressable>
            <Text style={styles.headerTitle}>Sign up</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.progress} accessibilityLabel={`Step ${step + 1} of 5`}>
            {STEPS.map((s, i) => (
              <View key={s} style={[styles.segment, i <= step && styles.segmentOn]} />
            ))}
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <FadeInView key={step} offset={10}>
              <Text style={styles.stepLabel}>
                STEP {step + 1} OF 5 · {STEPS[step]}
              </Text>
              <Text style={styles.title} accessibilityRole="header">
                {header.title}
              </Text>
              {step === 1 ? (
                <Text style={styles.sub}>
                  We sent a 6-digit code to <Text style={styles.subStrong}>{email.trim()}</Text>. Check
                  spam if you can't see it.
                </Text>
              ) : step === 3 ? (
                <Text style={styles.sub}>
                  Sellers only see your username.{' '}
                  <Text
                    style={styles.link}
                    onPress={() =>
                      Alert.alert(
                        'Why we ask',
                        "Your real name stays private and is only used for delivery and payments. Sellers and other bidders only ever see your username."
                      )
                    }
                  >
                    Why we ask
                  </Text>
                </Text>
              ) : (
                <Text style={styles.sub}>{header.sub}</Text>
              )}

              <Animated.View style={[styles.body, shakeStyle]}>
                {step === 0 && (
                  <Field label="Email">
                    <TextField
                      value={email}
                      onChangeText={t => {
                        setEmail(t);
                        setError(null);
                      }}
                      placeholder="you@example.com"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      spellCheck={false}
                      autoComplete="email"
                      textContentType="emailAddress"
                      autoFocus
                      returnKeyType="send"
                      onSubmitEditing={submit}
                      invalid={!!error}
                    />
                  </Field>
                )}

                {step === 1 && (
                  <>
                    <Pressable style={styles.codeRow} onPress={() => codeInput.current?.focus()}>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <View
                          key={i}
                          style={[
                            styles.codeBox,
                            i === Math.min(code.length, 5) && styles.codeBoxActive,
                            !!error && styles.codeBoxError,
                          ]}
                        >
                          <Text style={styles.codeDigit}>{code[i] ?? ''}</Text>
                        </View>
                      ))}
                      <TextInput
                        ref={codeInput}
                        value={code}
                        onChangeText={t => {
                          const v = t.replace(/\D/g, '').slice(0, 6);
                          setCode(v);
                          setError(null);
                          if (v.length === 6) verifyCode(v);
                        }}
                        keyboardType="number-pad"
                        textContentType="oneTimeCode"
                        autoComplete="one-time-code"
                        maxLength={6}
                        autoFocus
                        style={styles.hiddenInput}
                        accessibilityLabel="6-digit code"
                      />
                    </Pressable>
                    <Pressable onPress={resend} disabled={resendIn > 0} hitSlop={8}>
                      <Text style={[styles.resend, resendIn === 0 && styles.link]}>
                        {resendIn > 0
                          ? `Resend code in 0:${String(resendIn).padStart(2, '0')}`
                          : 'Resend code'}
                      </Text>
                    </Pressable>
                  </>
                )}

                {step === 2 && (
                  <>
                    <Field label="Password">
                      <PasswordField
                        value={password}
                        onChangeText={setPassword}
                        placeholder="At least 8 characters"
                        autoComplete="password-new"
                        textContentType="newPassword"
                        autoFocus
                        onSubmitEditing={submit}
                      />
                    </Field>
                    <View style={styles.rules}>
                      <Rule ok={pw.length} label="8 characters or more" />
                      <Rule ok={pw.number} label="A number" />
                      <Rule ok={pw.letter} label="A letter" />
                    </View>
                  </>
                )}

                {step === 3 && (
                  <>
                    <View style={styles.nameRow}>
                      <Field label="First name" style={styles.flex}>
                        <TextField
                          value={firstName}
                          onChangeText={setFirstName}
                          autoCapitalize="words"
                          autoComplete="given-name"
                          textContentType="givenName"
                          autoFocus
                        />
                      </Field>
                      <Field label="Last name" style={styles.flex}>
                        <TextField
                          value={lastName}
                          onChangeText={setLastName}
                          autoCapitalize="words"
                          autoComplete="family-name"
                          textContentType="familyName"
                        />
                      </Field>
                    </View>
                    <Field label="Username">
                      <View
                        style={[
                          styles.inputRow,
                          usernameFocused && styles.inputFocused,
                          usernameTaken && styles.inputInvalid,
                        ]}
                      >
                        <Text style={styles.at}>@</Text>
                        <TextInput
                          value={username}
                          onChangeText={t => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20))}
                          onFocus={() => setUsernameFocused(true)}
                          onBlur={() => setUsernameFocused(false)}
                          autoCapitalize="none"
                          autoCorrect={false}
                          autoComplete="username-new"
                          textContentType="username"
                          style={[styles.input, styles.inputFlex, styles.inputAt]}
                          accessibilityLabel="Username"
                        />
                      </View>
                    </Field>
                    <Text style={[styles.helper, usernameTaken && styles.helperError]}>
                      {usernameTaken ? `@${username} is taken. Try another.` : '3–20 letters, numbers or _'}
                    </Text>
                  </>
                )}

                {step === 4 && (
                  <>
                    <View style={styles.grid}>
                      {CATEGORIES.map(c => {
                        const on = categories.includes(c.key);
                        return (
                          <Pressable
                            key={c.key}
                            onPress={() => toggleCategory(c.key)}
                            style={({ pressed }) => [styles.catCard, on && styles.catCardOn, pressed && styles.pressed]}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: on }}
                            accessibilityLabel={c.label}
                          >
                            <Image source={c.img} style={styles.catImg} />
                            <Text style={styles.catLabel}>{c.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={styles.sectionLabel}>BUDGET</Text>
                    <View style={styles.chips}>
                      {BUDGETS.map(b => {
                        const on = budget === b.key;
                        return (
                          <Pressable
                            key={b.key}
                            onPress={() => setBudget(on ? null : b.key)}
                            style={[styles.chip, on && styles.chipOn]}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: on }}
                          >
                            <Text style={[styles.chipText, on && styles.chipTextOn]}>{b.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                )}

                {error && (
                  <Text style={styles.error} accessibilityRole="alert">
                    {error}
                    {/already exists|Log in to continue/i.test(error) && (
                      <Text
                        style={styles.link}
                        onPress={() => navigation.navigate('Login', { interfaceType: 'buyer' })}
                      >
                        {'  '}Log in
                      </Text>
                    )}
                  </Text>
                )}
              </Animated.View>
            </FadeInView>
          </ScrollView>

          <View style={[styles.footer, footerInset]}>
            <Pressable
              onPress={submit}
              disabled={!canContinue || busy}
              style={({ pressed }) => [
                styles.primary,
                (!canContinue || busy) && styles.primaryDisabled,
                pressed && canContinue && styles.primaryPressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canContinue || busy }}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={[styles.primaryText, !canContinue && styles.primaryTextDisabled]}>{buttonLabel}</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const Field: React.FC<{ label: string; style?: object; children: React.ReactNode }> = ({ label, style, children }) => (
  <View style={[styles.field, style]}>
    <Text style={styles.fieldLabel}>{label}</Text>
    {children}
  </View>
);

const Rule: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  <View style={styles.rule}>
    {ok ? (
      <Ionicons name="checkmark-circle" size={14} color={C.green} />
    ) : (
      <View style={styles.ruleDot} />
    )}
    <Text style={[styles.ruleText, ok && styles.ruleTextOk]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EEF2FB' },
  bg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  safe: { flex: 1 },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    height: 60,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#141C3C',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  headerTitle: { color: C.ink, fontSize: 17, fontFamily: fonts.medium },
  headerSpacer: { width: 44 },

  progress: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginTop: 12 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.75)' },
  segmentOn: { backgroundColor: C.blue },

  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  stepLabel: { fontFamily: MONO, fontSize: 11, letterSpacing: 0.6, color: C.muted },
  title: {
    color: C.ink,
    fontSize: 28,
    lineHeight: 34,
    fontFamily: fonts.medium,
    letterSpacing: -0.5,
    marginTop: 12,
  },
  sub: { color: C.muted, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular, marginTop: 8 },
  subStrong: { color: C.ink, fontFamily: fonts.medium },
  link: { color: C.blue, fontFamily: fonts.medium, textDecorationLine: 'underline' },
  body: { marginTop: 24 },

  field: { gap: 8, marginBottom: 16 },
  fieldLabel: { color: C.slate, fontSize: 14, fontFamily: fonts.medium },
  input: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: C.ink,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  inputFocused: { borderColor: C.blue },
  inputInvalid: { borderColor: C.red },
  inputFlex: { flex: 1, backgroundColor: 'transparent' },
  inputAt: { paddingLeft: 2 },
  at: { color: C.faint, fontSize: 16, fontFamily: fonts.regular, paddingLeft: 16 },

  codeRow: { flexDirection: 'row', gap: 8 },
  codeBox: {
    flex: 1,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBoxActive: { borderColor: C.blue },
  codeBoxError: { borderColor: C.red },
  codeDigit: { fontSize: 22, color: C.ink, fontFamily: fonts.medium },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  resend: { textAlign: 'center', color: C.muted, fontSize: 14, fontFamily: fonts.regular, marginTop: 20 },

  rules: { gap: 8, marginTop: 4 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleDot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 3, backgroundColor: C.line },
  ruleText: { color: C.muted, fontSize: 14, fontFamily: fonts.regular },
  ruleTextOk: { color: C.ink },

  nameRow: { flexDirection: 'row', gap: 12 },
  helper: { color: C.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: -8 },
  helperError: { color: C.red },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catCard: {
    width: '31.5%',
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  catCardOn: { borderColor: C.blue, backgroundColor: C.blueTint },
  catImg: { width: 48, height: 48, resizeMode: 'contain' },
  catLabel: { color: C.ink, fontSize: 13, fontFamily: fonts.medium },
  sectionLabel: { fontFamily: MONO, fontSize: 11, letterSpacing: 0.6, color: C.muted, marginTop: 24, marginBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: C.ink },
  chipText: { color: C.ink, fontSize: 14, fontFamily: fonts.medium },
  chipTextOn: { color: '#FFFFFF' },

  error: { color: C.red, fontSize: 14, fontFamily: fonts.regular, marginTop: 12, lineHeight: 20 },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.8)',
  },
  primary: {
    height: 52,
    borderRadius: 14,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryPressed: { backgroundColor: C.blue600, transform: [{ scale: 0.99 }] },
  primaryDisabled: { backgroundColor: C.disabled },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontFamily: fonts.medium },
  primaryTextDisabled: { color: C.faint },
  textButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  textButtonLabel: { color: C.slate, fontSize: 15, fontFamily: fonts.medium },

  welcome: { flex: 1, justifyContent: 'center', paddingHorizontal: 20, alignItems: 'center' },
  bellTile: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    shadowColor: '#141C3C',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  bellIcon: { width: 60, height: 60, resizeMode: 'contain' },
  welcomeTitle: {
    color: C.ink,
    fontSize: 26,
    lineHeight: 32,
    fontFamily: fonts.medium,
    letterSpacing: -0.5,
    textAlign: 'center',
    marginTop: 24,
  },
  welcomeSub: {
    color: C.muted,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.regular,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 8,
  },
  alertCard: {
    alignSelf: 'stretch',
    marginTop: 28,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    paddingHorizontal: 16,
  },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  alertRowBorder: { borderTopWidth: 1, borderTopColor: 'rgba(28,31,42,0.06)' },
  alertIcon: { width: 28, height: 28, resizeMode: 'contain' },
  alertText: { color: C.slate, fontSize: 14, fontFamily: fonts.regular },
});
