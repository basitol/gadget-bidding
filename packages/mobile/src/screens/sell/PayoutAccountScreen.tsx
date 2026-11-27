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
  KeyboardAvoidingView,
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
  TextButton,
  FooterBar,
} from '../../components/glass';
import { BottomSheet } from '../../components/motion';
import { fonts } from '../../constants';
import { payoutService, PayoutError } from '../../services';
import type { Bank, PayoutAccountState } from '../../services';
import { useToastStore } from '../../store/toastStore';

/**
 * Payout account (route 'PayoutAccount'): where a seller's withdrawals go. It must be in the
 * registered business name; the server checks the name with the bank and asks for the password.
 */

const toast = (msg: string, type: 'success' | 'error' = 'success') => useToastStore.getState().show(msg, type);
const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** "Nov 27, 2026" */
const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export const PayoutAccountScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [state, setState] = useState<PayoutAccountState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [banksError, setBanksError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [bank, setBank] = useState<Bank | null>(null);

  const [number, setNumber] = useState('');
  const [numberError, setNumberError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<{ name?: string; error?: string } | null>(null);

  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await payoutService.get());
      setLoadError(null);
    } catch (e) {
      setLoadError(errText(e, "We couldn't load your payout account."));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
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

  const showForm = !!state && (editing || !state.account);
  useEffect(() => {
    if (showForm && banks === null) loadBanks();
  }, [showForm, banks, loadBanks]);

  // Look the name up as soon as there's a bank and 10 digits.
  useEffect(() => {
    setResolved(null);
    setSaveError(null);
    if (!bank || number.length !== 10) {
      setResolving(false);
      return;
    }
    let live = true;
    setResolving(true);
    const t = setTimeout(async () => {
      try {
        const name = await payoutService.resolve(bank.code, number);
        if (live) setResolved(name ? { name } : { error: `We couldn't find that account at ${bank.name}. Check the number.` });
      } catch (e) {
        const msg = errText(e, '');
        if (live) {
          setResolved({
            error: /limit|too many|connection/i.test(msg)
              ? "We couldn't check that account just now. Try again in a few minutes."
              : `We couldn't find that account at ${bank.name}. Check the number.`,
          });
        }
      } finally {
        if (live) setResolving(false);
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

  const resetForm = () => {
    setBank(null);
    setNumber('');
    setNumberError(null);
    setResolved(null);
    setPassword('');
    setPasswordError(null);
    setSaveError(null);
  };

  const ready = !!bank && number.length === 10 && !!password && !resolving && !saving;

  const save = async () => {
    if (!ready || !bank) return;
    setSaving(true);
    setSaveError(null);
    setPasswordError(null);
    try {
      const account = await payoutService.save({ bank_code: bank.code, account_number: number, password });
      setState(s => (s ? { ...s, account } : s));
      setEditing(false);
      resetForm();
      toast('Payout account saved. Your payouts go here now.');
    } catch (e) {
      const code = e instanceof PayoutError ? e.code : undefined;
      if (code === 'WRONG_PASSWORD') setPasswordError(errText(e, "That password didn't match. Try again."));
      else setSaveError(errText(e, "We couldn't save your payout account. Try again."));
    } finally {
      setSaving(false);
    }
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

  const business = state.business_name;
  const account = state.account;

  return (
    <GlassScreen>
      <GlassHeader title="Payout account" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!showForm && account ? (
            <>
              <GlassCard style={styles.accountCard}>
                <View style={styles.accountTop}>
                  <View style={styles.bankTile}>
                    <Ionicons name="business-outline" size={20} color={G.slate} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{account.bank_name}</Text>
                    <Text style={styles.rowSub} accessibilityLabel={`Account ending ${account.account_number_last4}`}>
                      ••••{account.account_number_last4}
                    </Text>
                  </View>
                  <View style={styles.tag}>
                    <Text style={styles.tagText}>Name checked</Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <Text style={styles.caption}>Account name</Text>
                <Text style={styles.value}>{account.account_name}</Text>
                {account.added_at ? <Text style={styles.caption}>Added {longDate(account.added_at)}</Text> : null}
              </GlassCard>

              <SecondaryButton
                label="Change account"
                onPress={() => {
                  resetForm();
                  setEditing(true);
                }}
              />

              <Text style={styles.help}>
                Payouts only go to this account.{business ? ` It must be in your registered business name, ${business}.` : ''}
              </Text>
            </>
          ) : (
            <>
              <GlassCard style={styles.note}>
                <Ionicons name="information-circle-outline" size={20} color={G.blue600} />
                <Text style={styles.noteText}>
                  Must be in your registered business name: <Text style={styles.noteStrong}>{business || 'your business name'}</Text>
                </Text>
              </GlassCard>

              <Text style={[styles.label, styles.labelFirst]}>Bank</Text>
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
                  setNumber(t.replace(/\D/g, '').slice(0, 10));
                  if (numberError) setNumberError(null);
                }}
                onBlur={() => setNumberError(number && number.length !== 10 ? 'Account numbers are 10 digits.' : null)}
                placeholder="0123456789"
                placeholderTextColor={G.faint}
                keyboardType="number-pad"
                maxLength={10}
                style={[styles.input, styles.digits, numberError && styles.inputError]}
                accessibilityLabel="Account number"
              />
              {numberError ? <Text style={styles.errorText}>{numberError}</Text> : null}

              {resolving ? (
                <View style={styles.resolveRow}>
                  <ActivityIndicator color={G.blue} size="small" />
                  <Text style={styles.rowSub}>Checking with {bank?.name}…</Text>
                </View>
              ) : resolved?.name ? (
                <View style={styles.resolvedBox} accessibilityLabel={`Account name ${resolved.name}`}>
                  <Text style={styles.caption}>Account name</Text>
                  <Text style={styles.value}>{resolved.name}</Text>
                </View>
              ) : resolved?.error ? (
                <Text style={styles.errorText}>{resolved.error}</Text>
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

              {account ? (
                <TextButton
                  label="Keep my current account"
                  onPress={() => {
                    resetForm();
                    setEditing(false);
                  }}
                />
              ) : null}
            </>
          )}

          {!state.two_step_enabled ? (
            <View style={styles.warn}>
              <Text style={styles.warnText}>Turn on 2-step sign-in before your first payout.</Text>
              <Pressable onPress={() => navigation.navigate('TwoStepSetup')} hitSlop={8} accessibilityRole="button">
                <Text style={styles.link}>Turn on 2-step sign-in</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>

        {showForm ? (
          <FooterBar>
            <PrimaryButton label={saving ? 'Checking…' : 'Save payout account'} onPress={save} disabled={!ready} />
            {!ready && !saving ? (
              <Text style={styles.footerHint}>
                {resolving ? 'Checking the account name…' : 'Choose your bank, enter the 10-digit number and your password.'}
              </Text>
            ) : null}
          </FooterBar>
        ) : null}
      </KeyboardAvoidingView>

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
            ListEmptyComponent={<Text style={[styles.rowSub, styles.sheetEmpty]}>No bank matches “{search.trim()}”.</Text>}
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
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  loader: { marginVertical: 32 },
  topGap: { marginTop: 16 },
  pressed: { opacity: 0.75 },

  accountCard: { padding: 16, marginBottom: 16 },
  accountTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bankTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F5F6F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  rowSub: { color: G.slate, fontSize: 13, fontFamily: fonts.regular, marginTop: 2, fontVariant: ['tabular-nums'] },
  tag: { height: 26, paddingHorizontal: 8, borderRadius: 8, backgroundColor: '#EEF9F2', justifyContent: 'center' },
  tagText: { color: '#2E9E5E', fontSize: 13, fontFamily: fonts.medium },
  divider: { height: 1, backgroundColor: '#EDEFF4', marginVertical: 12 },
  caption: { color: G.muted, fontSize: 13, fontFamily: fonts.regular },
  value: { color: G.ink, fontSize: 16, fontFamily: fonts.medium, marginTop: 4, marginBottom: 8 },

  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, marginBottom: 8 },
  noteText: { flex: 1, color: G.slate, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  noteStrong: { color: G.ink, fontFamily: fonts.medium },

  label: { color: G.slate, fontSize: 14, fontFamily: fonts.medium, marginTop: 16, marginBottom: 8 },
  labelFirst: { marginTop: 12 },
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
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  selectText: { flex: 1, color: G.ink, fontSize: 16, fontFamily: fonts.regular },
  placeholder: { color: G.faint },
  errorText: { color: '#D9536A', fontSize: 13, fontFamily: fonts.regular, marginTop: 8, lineHeight: 19 },
  help: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 8, lineHeight: 19 },

  resolveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  resolvedBox: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    borderRadius: 14,
    backgroundColor: '#F5F6F9',
  },

  errorBox: { marginTop: 16, padding: 16, borderRadius: 14, backgroundColor: '#FDF0F2' },
  errorBoxText: { color: '#D9536A', fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },

  warn: { marginTop: 24, padding: 16, borderRadius: 18, backgroundColor: '#FFF6EE', gap: 8 },
  warnText: { color: G.ink, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  link: { color: G.blue600, fontSize: 14, fontFamily: fonts.medium },

  footerHint: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center', marginTop: 8 },

  sheetTitle: { color: G.ink, fontSize: 19, fontFamily: fonts.medium, marginBottom: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  searchInput: { flex: 1, height: 50, fontSize: 16, fontFamily: fonts.regular, color: G.ink },
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
