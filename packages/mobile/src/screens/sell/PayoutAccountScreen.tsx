import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  PrimaryButton,
  SecondaryButton,
  FooterBar,
  GlassKeyboardView,
} from '../../components/glass';
import { BottomSheet } from '../../components/motion';
import { fonts } from '../../constants';
import { payoutService, PayoutError } from '../../services';
import type { Bank } from '../../services';
import { useToastStore } from '../../store/toastStore';
import { Note, TINT } from './onboarding/kit';
import { moneyService, AccountCheck, PayoutAccountFull, shortDay } from './money/api';

/**
 * Payout account (route 'PayoutAccount'): add or change where payouts go, in three steps.
 *  1. Bank and account number. The bank's name for the account shows as soon as it's found, with
 *     whether it matches the registered (CAC) business name; only a match can continue.
 *  2. Confirm with the password. Changing an existing account pauses payouts for 7 days.
 *  3. Done.
 */

const toast = (msg: string, type: 'success' | 'error' = 'success') => useToastStore.getState().show(msg, type);
const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

type Step = 1 | 2 | 3;
type Saved = {
  bank_name: string;
  last4: string;
  account_name: string;
  resumes_at: string | null;
  changed: boolean;
};

export const PayoutAccountScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [state, setState] = useState<PayoutAccountFull | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(1);

  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [banksError, setBanksError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [bank, setBank] = useState<Bank | null>(null);

  const [number, setNumber] = useState('');
  const [numberError, setNumberError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<AccountCheck | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await moneyService.payoutAccount());
      setLoadError(null);
    } catch (e) {
      setLoadError(errText(e, "We couldn't load your payout account."));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (step !== 3) load();
    }, [load, step])
  );

  const loadBanks = useCallback(async () => {
    setBanksError(null);
    try {
      const list = await payoutService.banks();
      setBanks(list);
      if (!list.length) setBanksError("We couldn't load the banks. Try again.");
    } catch (e) {
      setBanksError(errText(e, "We couldn't load the banks. Try again."));
    }
  }, []);
  useEffect(() => {
    if (banks === null) loadBanks();
  }, [banks, loadBanks]);

  // Look the account up as soon as there's a bank and 10 digits.
  useEffect(() => {
    setCheck(null);
    setCheckError(null);
    if (!bank || number.length !== 10) {
      setChecking(false);
      return;
    }
    let live = true;
    setChecking(true);
    const t = setTimeout(async () => {
      try {
        const r = await moneyService.checkAccount(bank.code, number);
        if (live) setCheck(r);
      } catch (e) {
        if (live) setCheckError(errText(e, `We couldn't find that account at ${bank.name}. Check the number.`));
      } finally {
        if (live) setChecking(false);
      }
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [bank, number]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (banks ?? []).filter(b => !q || b.name.toLowerCase().includes(q));
  }, [banks, search]);

  const account = state?.account ?? null;
  const business = check?.business_name ?? state?.business_name ?? null;
  /** Same bank and last 4 as the saved one: saving it again doesn't pause payouts. */
  const sameAsNow =
    !!account && !!bank && account.bank_code === bank.code && number.slice(-4) === account.account_number_last4;
  const pauses = !!account && !sameAsNow;
  const canContinue = !!bank && number.length === 10 && !!check?.matches && !checking;

  const save = async () => {
    if (!bank || !check?.matches || !password || saving) return;
    setSaving(true);
    setSaveError(null);
    setPasswordError(null);
    try {
      const res = (await payoutService.save({
        bank_code: bank.code,
        account_number: number,
        password,
      })) as Awaited<ReturnType<typeof payoutService.save>> & {
        payouts_resume_at?: string | null;
      };
      setSaved({
        bank_name: res.bank_name,
        last4: res.account_number_last4,
        account_name: res.account_name,
        resumes_at: pauses ? (res.payouts_resume_at ?? null) : null,
        changed: !!account,
      });
      setPassword('');
      setStep(3);
    } catch (e) {
      const code = e instanceof PayoutError ? e.code : undefined;
      if (code === 'WRONG_PASSWORD') setPasswordError(errText(e, "That password didn't match. Try again."));
      else setSaveError(errText(e, "We couldn't save your payout account. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const back = () => {
    if (step === 2) {
      setStep(1);
      setPassword('');
      setPasswordError(null);
      setSaveError(null);
    } else navigation.goBack();
  };

  if (!state) {
    return (
      <GlassScreen>
        <GlassHeader title="Payout account" onBack={() => navigation.goBack()} />
        {loadError ? (
          <View style={styles.content}>
            <Text style={styles.errorText}>{loadError}</Text>
            <SecondaryButton label="Try again" onPress={load} style={styles.topGap} />
          </View>
        ) : (
          <ActivityIndicator color={G.blue} style={styles.loader} />
        )}
      </GlassScreen>
    );
  }

  return (
    <GlassScreen>
      <GlassHeader title="Payout account" onBack={back} />
      <View style={styles.progress} accessible accessibilityLabel={`Step ${step} of 3`}>
        {[1, 2, 3].map(i => (
          <View key={i} style={[styles.segment, i <= step && styles.segmentOn]} />
        ))}
      </View>

      <GlassKeyboardView>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 1 ? (
            <>
              <Text style={styles.title} accessibilityRole="header">
                {account ? 'Change payout account' : 'Add your payout account'}
              </Text>
              <Text style={styles.sub}>
                {account
                  ? `Now: ${account.bank_name} ••••${account.account_number_last4} · ${account.account_name}`
                  : `It must be in your registered business name${business ? `, ${business}` : ''}.`}
              </Text>
              {state.payouts_resume_at ? (
                <Note tone="amber" style={styles.topGap}>
                  {`Payouts resume on ${shortDay(state.payouts_resume_at)} — your payout account changed recently.`}
                </Note>
              ) : null}

              <Text style={styles.label}>Bank</Text>
              <Pressable
                onPress={() => {
                  setSearch('');
                  setPickerOpen(true);
                  if (!banks?.length) loadBanks();
                }}
                style={({ pressed }) => [styles.input, styles.select, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={bank ? `Bank, ${bank.name}` : 'Choose your bank'}
              >
                <Text style={[styles.selectText, !bank && styles.placeholder]} numberOfLines={1}>
                  {bank ? bank.name : 'Choose your bank'}
                </Text>
                <Ionicons name="chevron-down" size={18} color={G.muted} />
              </Pressable>

              <Text style={styles.label}>Account number</Text>
              <TextInput
                value={number}
                onChangeText={t => {
                  const digits = t.replace(/\D/g, '').slice(0, 10);
                  setNumber(digits);
                  if (numberError) setNumberError(null);
                  // The number pad has no return key: close it once the number is complete so Continue shows.
                  if (digits.length === 10) Keyboard.dismiss();
                }}
                onBlur={() => setNumberError(number && number.length !== 10 ? 'Account numbers are 10 digits.' : null)}
                placeholder="10 digits"
                placeholderTextColor={G.faint}
                keyboardType="number-pad"
                maxLength={10}
                style={[styles.input, styles.digits, numberError && styles.inputError]}
                accessibilityLabel="Account number"
              />
              {numberError ? <Text style={styles.errorText}>{numberError}</Text> : null}

              {checking ? (
                <View style={styles.resolveRow}>
                  <ActivityIndicator color={G.blue} size="small" />
                  <Text style={styles.help}>Checking with {bank?.name}…</Text>
                </View>
              ) : check ? (
                check.matches ? (
                  <View style={[styles.nameBox, { backgroundColor: TINT.green.bg }]} accessibilityLiveRegion="polite">
                    <Text style={styles.nameText}>{check.account_name}</Text>
                    <View style={styles.matchRow}>
                      <Ionicons name="checkmark-circle" size={16} color={TINT.green.text} />
                      <Text style={[styles.matchText, { color: TINT.green.text }]}>Matches your CAC name</Text>
                    </View>
                  </View>
                ) : (
                  <View style={[styles.nameBox, { backgroundColor: TINT.red.bg }]} accessibilityLiveRegion="polite">
                    <Text style={[styles.matchText, { color: TINT.red.text }]}>
                      {`This account is in the name ${check.account_name} — payouts can only go to ${business ?? 'your registered business name'}.`}
                    </Text>
                  </View>
                )
              ) : checkError ? (
                <Text style={styles.errorText}>{checkError}</Text>
              ) : null}
            </>
          ) : step === 2 && bank && check ? (
            <>
              <Text style={styles.title} accessibilityRole="header">
                Check and confirm
              </Text>
              <Text style={styles.sub}>Payouts will go to this account.</Text>

              <GlassCard style={styles.accountCard}>
                <View style={[styles.bankTile, { backgroundColor: TINT.green.bg }]}>
                  <Ionicons name="business-outline" size={20} color={TINT.green.text} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>{check.account_name}</Text>
                  <Text style={styles.rowSub}>
                    {bank.name} · {number}
                  </Text>
                </View>
              </GlassCard>

              {pauses && state.change_resumes_at ? (
                <Note tone="amber" style={styles.topGap}>
                  {`Changing it pauses payouts for ${state.hold_days} days for safety. Payouts resume on ${shortDay(state.change_resumes_at)}.`}
                </Note>
              ) : null}

              <Text style={styles.label}>Your password</Text>
              <TextInput
                value={password}
                onChangeText={t => {
                  setPassword(t);
                  if (passwordError) setPasswordError(null);
                }}
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
                style={[styles.input, passwordError && styles.inputError]}
                accessibilityLabel="Your password"
                onSubmitEditing={save}
              />
              {passwordError ? (
                <Text style={styles.errorText}>{passwordError}</Text>
              ) : (
                <Text style={styles.help}>We ask for it to keep your payouts safe.</Text>
              )}

              {saveError ? (
                <View style={styles.errorBox} accessibilityLiveRegion="polite">
                  <Text style={styles.errorBoxText}>{saveError}</Text>
                </View>
              ) : null}
            </>
          ) : saved ? (
            <View style={styles.done}>
              <View style={styles.doneTile}>
                <Ionicons name="checkmark" size={36} color={TINT.green.text} />
              </View>
              <Text style={[styles.title, styles.center]} accessibilityRole="header">
                {saved.changed ? 'Payout account changed' : 'Payout account added'}
              </Text>
              <Text style={[styles.sub, styles.center]}>
                {`Payouts now go to ${saved.bank_name} ••••${saved.last4}, ${saved.account_name}.`}
                {saved.resumes_at ? ` They resume on ${shortDay(saved.resumes_at)}.` : ''}
              </Text>
              {saved.changed ? (
                <Text style={[styles.help, styles.center]}>We've emailed you about this change.</Text>
              ) : null}
            </View>
          ) : null}

          {!state.two_step_enabled && step !== 2 ? (
            <View style={styles.warn}>
              <Text style={styles.warnText}>Turn on 2-step sign-in before your first payout.</Text>
              <Pressable onPress={() => navigation.navigate('TwoStepSetup')} hitSlop={8} accessibilityRole="button">
                <Text style={styles.link}>Turn on 2-step sign-in</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>

        <FooterBar>
          {step === 1 ? (
            <>
              <PrimaryButton label="Continue" onPress={() => setStep(2)} disabled={!canContinue} />
              {!canContinue && !checking ? (
                <Text style={styles.footerHint}>
                  {check && !check.matches
                    ? 'Use an account in your registered business name.'
                    : 'Choose your bank and enter the 10-digit number.'}
                </Text>
              ) : null}
            </>
          ) : step === 2 ? (
            <>
              <PrimaryButton
                label={saving ? 'Saving…' : account ? 'Change payout account' : 'Save payout account'}
                onPress={save}
                disabled={!password || saving}
              />
              {!password && !saving ? <Text style={styles.footerHint}>Enter your password to confirm.</Text> : null}
            </>
          ) : (
            <PrimaryButton
              label="Done"
              onPress={() => {
                toast(saved?.changed ? 'Payout account changed.' : 'Payout account added.');
                navigation.goBack();
              }}
            />
          )}
        </FooterBar>
      </GlassKeyboardView>

      <BottomSheet visible={pickerOpen} onClose={() => setPickerOpen(false)}>
        <Text style={styles.sheetTitle}>Choose your bank</Text>
        <View style={[styles.input, styles.searchRow]}>
          <Ionicons name="search" size={18} color={G.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search banks"
            placeholderTextColor={G.faint}
            autoCorrect={false}
            style={styles.searchInput}
            accessibilityLabel="Search banks"
          />
        </View>
        {banks === null && !banksError ? (
          <ActivityIndicator color={G.blue} style={styles.loader} />
        ) : banksError ? (
          <View style={styles.sheetEmpty}>
            <Text style={styles.errorText}>{banksError}</Text>
            <SecondaryButton label="Try again" onPress={loadBanks} style={styles.topGap} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={b => `${b.code}-${b.id}`}
            keyboardShouldPersistTaps="handled"
            style={styles.bankList}
            initialNumToRender={20}
            ListEmptyComponent={
              <Text style={[styles.help, styles.sheetEmpty]}>No bank matches “{search.trim()}”.</Text>
            }
            renderItem={({ item }) => {
              const on = item.code === bank?.code;
              return (
                <Pressable
                  onPress={() => {
                    setBank(item);
                    setPickerOpen(false);
                  }}
                  style={({ pressed }) => [styles.bankRow, on && styles.bankRowOn, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.bankName, on && styles.bankNameOn]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {on ? <Ionicons name="checkmark" size={18} color={G.blue} /> : null}
                </Pressable>
              );
            }}
          />
        )}
      </BottomSheet>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  loader: { marginVertical: 32 },
  topGap: { marginTop: 16 },
  pressed: { opacity: 0.75 },

  progress: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(28,31,42,0.08)',
  },
  segmentOn: { backgroundColor: G.blue },

  title: {
    color: G.ink,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.52,
    fontFamily: fonts.medium,
    marginTop: 8,
  },
  sub: {
    color: G.muted,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.regular,
    marginTop: 6,
  },

  label: {
    color: G.slate,
    fontSize: 14,
    fontFamily: fonts.medium,
    marginTop: 20,
    marginBottom: 8,
  },
  input: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: G.ink,
    borderWidth: 1,
    borderColor: '#EDEFF4',
  },
  digits: { fontVariant: ['tabular-nums'], letterSpacing: 1 },
  inputError: { borderColor: '#D9536A' },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  selectText: {
    flex: 1,
    color: G.ink,
    fontSize: 16,
    fontFamily: fonts.regular,
  },
  placeholder: { color: G.faint },
  errorText: {
    color: '#D9536A',
    fontSize: 13,
    fontFamily: fonts.regular,
    marginTop: 8,
    lineHeight: 19,
  },
  help: {
    color: G.muted,
    fontSize: 13,
    fontFamily: fonts.regular,
    marginTop: 8,
    lineHeight: 19,
  },

  resolveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  nameBox: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    gap: 4,
  },
  nameText: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  matchText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.medium },

  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    marginTop: 20,
  },
  bankTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  rowSub: {
    color: G.slate,
    fontSize: 13,
    fontFamily: fonts.regular,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },

  errorBox: {
    marginTop: 16,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#FDF0F2',
  },
  errorBoxText: {
    color: '#D9536A',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.regular,
  },

  done: { alignItems: 'center', paddingTop: 32, paddingHorizontal: 8 },
  doneTile: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: TINT.green.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },

  warn: {
    marginTop: 24,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#FFF6EE',
    gap: 8,
  },
  warnText: {
    color: G.ink,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.regular,
  },
  link: { color: G.blue600, fontSize: 14, fontFamily: fonts.medium },

  footerHint: {
    color: G.muted,
    fontSize: 13,
    fontFamily: fonts.regular,
    textAlign: 'center',
    marginTop: 8,
  },

  sheetTitle: {
    color: G.ink,
    fontSize: 19,
    fontFamily: fonts.medium,
    marginBottom: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    height: 50,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: G.ink,
  },
  bankList: { maxHeight: 420 },
  bankRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  bankRowOn: { backgroundColor: '#F1F5FF' },
  bankName: { flex: 1, color: G.ink, fontSize: 16, fontFamily: fonts.regular },
  bankNameOn: { color: G.blue600, fontFamily: fonts.medium },
  sheetEmpty: { paddingVertical: 16 },
});
