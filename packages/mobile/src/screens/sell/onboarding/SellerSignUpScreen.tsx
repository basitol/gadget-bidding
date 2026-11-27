import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, ActionSheetIOS, Platform } from 'react-native';
import {
  A,
  AuthButton,
  AuthShell,
  AuthTitle,
  CodeBoxes,
  Field,
  PasswordField,
  PasswordRules,
  Strong,
  TextField,
  TextLink,
  authStyles,
  sellerPasswordRules,
} from '../../../components/auth/GlassAuthKit';
import { Chip, GlassCard } from '../../../components/glass';
import { fonts } from '../../../constants';
import { useAuthStore } from '../../../store';
import { useToastStore } from '../../../store/toastStore';
import { authService } from '../../../services';
import {
  sellerApplicationService as svc,
  SellerApplication,
  DocumentKind,
  PickedFile,
  SELLER_CATEGORIES,
  pickDocumentPdf,
  pickDocumentPhoto,
  takeDocumentPhoto,
} from '../../../services/sellerApplication.service';
import { isValidEmail } from '../../../utils/validation';
import { DocumentRow, Eyebrow, Label, Note, RuleRow, TINT } from './kit';

const STEP_NAMES = ['Business email', 'Code', 'Password', 'Store details', 'Documents', 'Seller rules'];
const RESEND_SECONDS = 30;

const RULES = [
  {
    key: 'platform_fee',
    title: 'Platform fee',
    sub: "A percentage or fixed fee by price range, taken only when an item sells. You see what you'll receive before listing.",
  },
  {
    key: 'hub_dropoff',
    title: 'Drop at the hub within 24 hours',
    sub: 'Once an item sells, bring it to our Computer Village hub (or book a rider).',
  },
  {
    key: 'inspection',
    title: 'Every item is inspected',
    sub: "If it doesn't match your listing, the buyer is refunded and it counts against your rating.",
  },
  {
    key: 'paid_after_confirm',
    title: "You're paid after the buyer confirms",
    sub: "Or 48 hours after delivery if they don't reply. Payouts go to your business account.",
  },
  {
    key: 'name_hidden',
    title: "Buyers don't see your name",
    sub: 'Deals stay on Gadgets Bidding. Sharing contact details gets listings removed.',
  },
  {
    key: 'cant_buy',
    title: "This account can't buy",
    sub: "Seller accounts can't bid. Use a separate buyer account to shop.",
  },
];

const toast = (m: string, t: 'success' | 'error' = 'error') => useToastStore.getState().show(m, t);
const msg = (e: unknown) => (e instanceof Error ? e.message : "That didn't work. Try again.");

const isPhone = (v: string) => /^(\+?234|0)?[789][01]\d{8}$/.test(v.replace(/[\s-]/g, ''));
const cleanNumber = (v: string) => v.replace(/^\s*(rc|bn)\s*/i, '').replace(/[\s-]/g, '');

type Form = { business_name: string; owner_name: string; plaza: string; shop_number: string; business_phone: string };
const EMPTY: Form = { business_name: '', owner_name: '', plaza: '', shop_number: '', business_phone: '' };

/** The first step with something missing, for a seller coming back to finish. */
const firstOpenStep = (a: SellerApplication) => {
  if (!a.business_name || !a.owner_name || !a.plaza || !a.shop_number || !a.business_phone || !a.categories.length) return 4;
  if (!a.registration_number || a.documents.some(d => !d.uploaded)) return 5;
  return 6;
};

/**
 * Seller sign-up, six steps. 1–3 make the account (business email → code → password); 4–6 fill in the
 * application (details → number and documents → rules) and send it to our team.
 * With `resume`, a signed-in seller picks up where they left off.
 */
export const SellerSignUpScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const resume = !!route.params?.resume;
  const { setUser, setInterfaceType } = useAuthStore();
  const [step, setStep] = useState(resume ? 0 : 1);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [verificationId, setVerificationId] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [password, setPassword] = useState('');

  const [app, setApp] = useState<SellerApplication | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [regType, setRegType] = useState<'rc' | 'bn'>('rc');
  const [regNumber, setRegNumber] = useState('');
  const [uploading, setUploading] = useState<DocumentKind | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  const adopt = (a: SellerApplication) => {
    setApp(a);
    setForm({
      business_name: a.business_name ?? '',
      owner_name: a.owner_name ?? '',
      plaza: a.plaza ?? '',
      shop_number: a.shop_number ?? '',
      business_phone: a.business_phone ?? '',
    });
    setCategories(a.categories);
    if (a.registration_type) setRegType(a.registration_type);
    setRegNumber(a.registration_number ?? '');
  };

  const loadForResume = async () => {
    setLoadError(null);
    try {
      const a = await svc.get();
      if (a.status !== 'draft') {
        navigation.replace('SellerStatus');
        return;
      }
      adopt(a);
      setStep(firstOpenStep(a));
    } catch (e) {
      setLoadError(msg(e));
    }
  };

  useEffect(() => {
    if (resume) loadForResume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  /* ---------- steps 1–3: the account ---------- */

  const sendCode = async () => {
    const e = email.trim().toLowerCase();
    if (!isValidEmail(e)) {
      setEmailError('Check your email address. It looks incomplete.');
      return;
    }
    setBusy(true);
    try {
      const r = await svc.signupStart(e);
      setEmail(r.email);
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
      await svc.signupVerify(verificationId, value);
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
      await svc.signupResend(verificationId);
      setResendIn(RESEND_SECONDS);
      setCodeError(null);
      toast('We sent a new code', 'success');
    } catch (err) {
      toast(msg(err));
    }
  };

  const pw = sellerPasswordRules(password);
  const passwordOk = pw.length && pw.number && pw.capital;

  const createAccount = async () => {
    if (!passwordOk) return;
    setBusy(true);
    try {
      await svc.signupComplete(verificationId, password);
      setPassword('');
      try {
        adopt(await svc.get());
      } catch {
        // The details save creates it anyway.
      }
      setStep(4);
    } catch (err) {
      toast(msg(err));
    } finally {
      setBusy(false);
    }
  };

  /* ---------- steps 4–6: the application ---------- */

  const setField = (k: keyof Form) => (v: string) => setForm(f => ({ ...f, [k]: v }));
  const detailsReady =
    !!form.business_name.trim() &&
    !!form.owner_name.trim() &&
    !!form.plaza.trim() &&
    !!form.shop_number.trim() &&
    isPhone(form.business_phone) &&
    categories.length > 0;

  const saveDetails = async () => {
    if (!isPhone(form.business_phone)) {
      setPhoneError('Enter a Nigerian mobile number, like 0803 000 0000.');
      return;
    }
    if (!detailsReady) return;
    setBusy(true);
    try {
      const a = await svc.update({ ...form, categories });
      adopt(a);
      setStep(5);
    } catch (err) {
      toast(msg(err));
    } finally {
      setBusy(false);
    }
  };

  const numberOk = /^\d{4,8}$/.test(cleanNumber(regNumber));
  const docsReady = !!app && app.documents.every(d => d.uploaded);
  const documentsReady = numberOk && docsReady;

  const upload = async (kind: DocumentKind, pick: () => Promise<PickedFile | null>) => {
    let file: PickedFile | null;
    try {
      file = await pick();
    } catch (err) {
      toast(msg(err));
      return;
    }
    if (!file) return;
    setUploading(kind);
    try {
      // Only the documents change here; the number being typed stays as it is.
      setApp(await svc.uploadDocument(kind, file));
    } catch (err) {
      toast(msg(err));
    } finally {
      setUploading(null);
    }
  };

  const chooseFile = (kind: DocumentKind, label: string) => {
    const choices: [string, () => Promise<PickedFile | null>][] = [
      ['Take a photo', takeDocumentPhoto],
      ['Choose a photo', pickDocumentPhoto],
      ['Choose a PDF', pickDocumentPdf],
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: label, options: [...choices.map(c => c[0]), 'Cancel'], cancelButtonIndex: choices.length },
        i => {
          if (i < choices.length) upload(kind, choices[i][1]);
        }
      );
    } else {
      Alert.alert(label, undefined, [
        ...choices.map(([text, fn]) => ({ text, onPress: () => upload(kind, fn) })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  };

  const saveDocuments = async () => {
    if (!documentsReady) return;
    setBusy(true);
    try {
      setApp(await svc.update({ registration_type: regType, registration_number: cleanNumber(regNumber) }));
      setStep(6);
    } catch (err) {
      toast(msg(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleRule = (key: string) =>
    setTicked(t => {
      const next = new Set(t);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const allTicked = RULES.every(r => ticked.has(r.key));

  const send = async () => {
    if (!allTicked) return;
    setBusy(true);
    try {
      await svc.submit();
      if (resume) {
        navigation.replace('SellerStatus');
        return;
      }
      // Into the seller app, which opens on "Under review".
      const user = await svc.account();
      setInterfaceType('seller');
      setUser(user);
    } catch (err) {
      toast(msg(err));
    } finally {
      setBusy(false);
    }
  };

  /* ---------- navigation ---------- */

  const back = () => {
    if (step <= 1) return navigation.canGoBack() ? navigation.goBack() : navigation.navigate('SellWithUs');
    if (step === 2 || step === 3) return setStep(1);
    if (step === 4) {
      if (resume) return navigation.canGoBack() ? navigation.goBack() : navigation.replace('MainTabs');
      Alert.alert('Finish later?', 'Your seller account is saved. Log in with your business email to carry on.', [
        { text: 'Keep going', style: 'cancel' },
        {
          text: 'Finish later',
          onPress: async () => {
            await authService.logout().catch(() => {});
            navigation.popToTop();
          },
        },
      ]);
      return;
    }
    setStep(step - 1);
  };

  const footer = (() => {
    switch (step) {
      case 1:
        return <AuthButton label="Send code" onPress={sendCode} disabled={!email.trim()} busy={busy} />;
      case 2:
        return <AuthButton label="Continue" onPress={() => checkCode()} disabled={code.length !== 6} busy={busy} />;
      case 3:
        return <AuthButton label="Continue" onPress={createAccount} disabled={!passwordOk} busy={busy} />;
      case 4:
        return <AuthButton label="Continue" onPress={saveDetails} disabled={!detailsReady} busy={busy} />;
      case 5:
        return (
          <AuthButton
            label={documentsReady ? 'Continue' : 'Add your number and all 3 documents'}
            onPress={saveDocuments}
            disabled={!documentsReady || !!uploading}
            busy={busy}
          />
        );
      case 6:
        return (
          <AuthButton
            label={allTicked ? 'Send application' : 'Tick all 6 to continue'}
            onPress={send}
            disabled={!allTicked}
            busy={busy}
          />
        );
      default:
        return null;
    }
  })();

  const eyebrow = step >= 1 ? <Eyebrow>{`Step ${step} of 6 · ${STEP_NAMES[step - 1]}`}</Eyebrow> : null;

  return (
    <AuthShell title="Seller sign up" onBack={back} progress={step >= 1 ? { step, of: 6 } : undefined} footer={footer}>
      {step === 0 ? (
        <View style={styles.center}>
          {loadError ? (
            <>
              <Text style={styles.loadError}>{loadError}</Text>
              <TextLink label="Try again" onPress={loadForResume} />
            </>
          ) : (
            <ActivityIndicator color={A.blue} />
          )}
        </View>
      ) : null}

      {step === 1 ? (
        <>
          {eyebrow}
          <AuthTitle title="Your business email" sub="We'll send a 6-digit code. This email can't also be used for a buyer account." />
          <Field label="Business email" error={emailError}>
            <TextField
              value={email}
              onChangeText={t => {
                setEmail(t);
                if (emailError) setEmailError(null);
              }}
              placeholder="sales@yourbusiness.com"
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
        </>
      ) : null}

      {step === 2 ? (
        <>
          {eyebrow}
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
          {eyebrow}
          <AuthTitle title="Create a password" sub="Seller accounts handle money, so we ask for a stronger one." />
          <Field label="Password">
            <PasswordField
              value={password}
              onChangeText={setPassword}
              placeholder="At least 10 characters"
              autoComplete="password-new"
              textContentType="newPassword"
              returnKeyType="done"
              onSubmitEditing={createAccount}
              autoFocus
            />
          </Field>
          <PasswordRules password={password} seller />
          <Note style={styles.gapTop}>After approval you'll also set up 2-step sign-in before your first payout.</Note>
        </>
      ) : null}

      {step === 4 ? (
        <>
          {eyebrow}
          <AuthTitle title="About your business" sub="Buyers never see your business name — they see a verified seller ID." />
          <Field label="Registered business name">
            <TextField value={form.business_name} onChangeText={setField('business_name')} placeholder="As it appears on your CAC certificate" autoCapitalize="words" />
          </Field>
          <Field label="Owner's full name">
            <TextField value={form.owner_name} onChangeText={setField('owner_name')} placeholder="First and last name" autoCapitalize="words" textContentType="name" />
          </Field>
          <Field label="Plaza or building">
            <TextField value={form.plaza} onChangeText={setField('plaza')} placeholder="e.g. Otigba Tech Plaza" autoCapitalize="words" />
          </Field>
          <Field label="Shop number">
            <TextField value={form.shop_number} onChangeText={setField('shop_number')} placeholder="e.g. Shop 14, 2nd floor" />
          </Field>
          <Field label="Business phone" error={phoneError}>
            <TextField
              value={form.business_phone}
              onChangeText={t => {
                setField('business_phone')(t);
                if (phoneError) setPhoneError(null);
              }}
              onBlur={() =>
                setPhoneError(form.business_phone.trim() && !isPhone(form.business_phone) ? 'Enter a Nigerian mobile number, like 0803 000 0000.' : null)
              }
              placeholder="0803 000 0000"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              invalid={!!phoneError}
            />
          </Field>
          <Field label="Area" style={styles.areaField}>
            <TextField value={app?.area ?? 'Computer Village, Ikeja'} editable={false} style={styles.locked} accessibilityState={{ disabled: true }} />
          </Field>
          <Text style={styles.helper}>We're only open to Computer Village sellers for now.</Text>

          <Label style={styles.label}>What do you sell?</Label>
          <View style={styles.chips}>
            {SELLER_CATEGORIES.map(c => (
              <Chip
                key={c}
                label={c}
                selected={categories.includes(c)}
                onPress={() => setCategories(cs => (cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]))}
              />
            ))}
          </View>
        </>
      ) : null}

      {step === 5 ? (
        <>
          {eyebrow}
          <AuthTitle title="Verify your business" sub="Our team checks these by hand. Clear photos get approved faster." />
          <GlassCard style={styles.regCard}>
            <Text style={styles.fieldLabel}>Registration type</Text>
            <View style={styles.segment}>
              <Chip label="RC" selected={regType === 'rc'} onPress={() => setRegType('rc')} />
              <Chip label="BN" selected={regType === 'bn'} onPress={() => setRegType('bn')} />
            </View>
            <Field label={regType === 'rc' ? 'RC number (limited company)' : 'BN number (business name)'} style={styles.regField}>
              <TextField
                value={regNumber}
                onChangeText={setRegNumber}
                placeholder="e.g. 1234567"
                keyboardType="number-pad"
                maxLength={12}
              />
            </Field>
          </GlassCard>

          <Label style={styles.label}>Documents</Label>
          {(app?.documents ?? []).map(d => (
            <GlassCard key={d.kind} style={styles.docCard}>
              <DocumentRow doc={d} busy={uploading === d.kind} onUpload={() => chooseFile(d.kind, d.label)} last />
            </GlassCard>
          ))}
          <Text style={styles.helper}>Files stay private. Only our verification team can see them.</Text>
        </>
      ) : null}

      {step === 6 ? (
        <>
          {eyebrow}
          <AuthTitle title="How selling works" sub="Tick each one so we know you've read it." />
          <GlassCard style={styles.rulesCard}>
            {RULES.map((r, i) => (
              <RuleRow
                key={r.key}
                title={r.title}
                sub={r.sub}
                on={ticked.has(r.key)}
                onToggle={() => toggleRule(r.key)}
                last={i === RULES.length - 1}
              />
            ))}
          </GlassCard>
          <Text style={styles.links}>
            <Text style={styles.link} accessibilityRole="link" onPress={() => navigation.navigate('Policy')}>
              Read the full seller agreement
            </Text>
            {'  ·  '}
            <Text style={styles.link} accessibilityRole="link" onPress={() => navigation.navigate('Policy')}>
              Privacy policy
            </Text>
          </Text>
        </>
      ) : null}
    </AuthShell>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 80 },
  loadError: { color: A.slate, fontSize: 15, fontFamily: fonts.regular, textAlign: 'center' },
  gapTop: { marginTop: 16 },
  areaField: { marginBottom: 8 },
  locked: { backgroundColor: TINT.fill, color: A.slate },
  helper: { color: A.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
  label: { marginTop: 24, marginBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  regCard: { padding: 16 },
  fieldLabel: { color: A.slate, fontSize: 14, fontFamily: fonts.medium },
  segment: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 16 },
  regField: { marginBottom: 0 },
  docCard: { marginBottom: 10, overflow: 'hidden' },
  rulesCard: { overflow: 'hidden' },
  links: { textAlign: 'center', color: A.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 16 },
  link: { color: A.blue600, textDecorationLine: 'underline' },
});
