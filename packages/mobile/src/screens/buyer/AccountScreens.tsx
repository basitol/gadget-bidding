import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Switch,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { G, GlassScreen, GlassHeader, GlassCard, SectionLabel, PrimaryButton, Chip } from '../../components/glass';
import { BottomSheet } from '../../components/motion';
import { fonts } from '../../constants';
import { authService, meService, SavedCard, SavedSearch } from '../../services';
import { useAuthStore, useWalletStore } from '../../store';
import { useToastStore } from '../../store/toastStore';
import { formatCurrency, realPhone } from '../../utils';
import { CATEGORY_CHIPS } from './categories';

const toast = (msg: string, type: 'success' | 'error' = 'success') => useToastStore.getState().show(msg, type);
const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/* ================= Alerts & saved searches ================= */

export const AlertsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [items, setItems] = useState<SavedSearch[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [maxPrice, setMaxPrice] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await meService.savedSearches());
    } catch {
      setItems([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const price = Number(maxPrice.replace(/[^0-9]/g, ''));
      await meService.saveSearch({
        query: query.trim() || undefined,
        category_slug: category ?? undefined,
        max_price: price > 0 ? price : undefined,
      });
      setAdding(false);
      setQuery('');
      setCategory(null);
      setMaxPrice('');
      toast("We'll tell you when it's listed");
      load();
    } catch (e) {
      toast(errText(e, "Couldn't save that alert"), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = (s: SavedSearch) =>
    Alert.alert('Remove alert?', `You'll stop hearing about "${s.label}".`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setItems(list => list?.filter(x => x.id !== s.id) ?? null);
          await meService.deleteSearch(s.id).catch(() => load());
        },
      },
    ]);

  const categoryName = (slug: string | null) => CATEGORY_CHIPS.find(c => c.slug === slug)?.label;

  return (
    <GlassScreen>
      <GlassHeader title="Alerts" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lead}>
          Tell us what you're hunting for. We'll send a notification the moment a matching auction goes live.
        </Text>
        {items === null ? (
          <ActivityIndicator color={G.blue} style={styles.loader} />
        ) : items.length ? (
          <GlassCard style={styles.group}>
            {items.map((s, i) => (
              <View key={s.id} style={[styles.listRow, i < items.length - 1 && styles.divider]}>
                <Ionicons name="notifications-outline" size={18} color={G.blue} />
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>{s.query || categoryName(s.category_slug) || s.label}</Text>
                  <Text style={styles.rowSub}>
                    {[s.query && categoryName(s.category_slug), s.max_price ? `Up to ${formatCurrency(s.max_price)}` : null]
                      .filter(Boolean)
                      .join(' · ') || 'Any price'}
                  </Text>
                </View>
                <Pressable onPress={() => remove(s)} hitSlop={10} accessibilityLabel={`Remove ${s.label} alert`}>
                  <Ionicons name="trash-outline" size={18} color={G.muted} />
                </Pressable>
              </View>
            ))}
          </GlassCard>
        ) : (
          <GlassCard style={styles.empty}>
            <Image source={require('../../../assets/icons/bell.png')} style={styles.emptyIcon} />
            <Text style={styles.emptyTitle}>No alerts yet</Text>
            <Text style={styles.emptyText}>Add one for the gadget you can't find.</Text>
          </GlassCard>
        )}
        <PrimaryButton label="Add an alert" onPress={() => setAdding(true)} style={styles.topGap} />
      </ScrollView>

      <BottomSheet visible={adding} onClose={() => setAdding(false)}>
        <Text style={styles.sheetTitle}>New alert</Text>
        <Text style={styles.label}>What are you looking for?</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="e.g. PS5 Slim, iPhone 15 Pro"
          placeholderTextColor={G.faint}
          style={styles.input}
          autoFocus
        />
        <Text style={styles.label}>Category (optional)</Text>
        <View style={styles.chipWrap}>
          {CATEGORY_CHIPS.filter(c => c.slug).map(c => (
            <Chip key={c.label} label={c.label} selected={category === c.slug} onPress={() => setCategory(category === c.slug ? null : c.slug)} />
          ))}
        </View>
        <Text style={styles.label}>Most you'd pay (optional)</Text>
        <TextInput
          value={maxPrice}
          onChangeText={setMaxPrice}
          placeholder="₦"
          placeholderTextColor={G.faint}
          keyboardType="number-pad"
          style={styles.input}
        />
        <PrimaryButton label={saving ? 'Saving…' : 'Save alert'} onPress={save} disabled={saving || (!query.trim() && !category)} style={styles.topGap} />
      </BottomSheet>
    </GlassScreen>
  );
};

/* ================= Payment methods ================= */

export const PaymentMethodsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { wallet, fetchWallet } = useWalletStore();
  const [cards, setCards] = useState<SavedCard[] | null>(null);

  const load = useCallback(async () => {
    fetchWallet().catch(() => {});
    try {
      setCards(await meService.cards());
    } catch {
      setCards([]);
    }
  }, [fetchWallet]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const cardActions = (c: SavedCard) =>
    Alert.alert(c.label, `Expires ${c.exp_month}/${c.exp_year.slice(-2)}`, [
      ...(c.is_default
        ? []
        : [
            {
              text: 'Make default',
              onPress: async () => setCards(await meService.defaultCard(c.id).catch(() => cards)),
            },
          ]),
      {
        text: 'Remove card',
        style: 'destructive' as const,
        onPress: async () => {
          try {
            setCards(await meService.deleteCard(c.id));
            toast('Card removed');
          } catch (e) {
            toast(errText(e, "Couldn't remove that card"), 'error');
          }
        },
      },
      { text: 'Cancel', style: 'cancel' as const },
    ]);

  return (
    <GlassScreen>
      <GlassHeader title="Payment methods" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionLabel>Wallet</SectionLabel>
        <GlassCard style={[styles.group, styles.walletCard]}>
          <View style={styles.flex}>
            <Text style={styles.rowSub}>Available to bid</Text>
            <Text style={styles.walletValue}>{formatCurrency(wallet?.available_balance ?? wallet?.balance ?? 0)}</Text>
            <Text style={styles.rowSub}>Each auction you bid on holds ₦1,000 until it ends.</Text>
          </View>
          <PrimaryButton label="Manage" compact onPress={() => navigation.navigate('Wallet')} />
        </GlassCard>

        <SectionLabel>Saved cards</SectionLabel>
        {cards === null ? (
          <ActivityIndicator color={G.blue} style={styles.loader} />
        ) : cards.length ? (
          <GlassCard style={styles.group}>
            {cards.map((c, i) => (
              <Pressable
                key={c.id}
                onPress={() => cardActions(c)}
                style={[styles.listRow, i < cards.length - 1 && styles.divider]}
                accessibilityRole="button"
              >
                <Ionicons name="card-outline" size={20} color={G.slate} />
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>{c.label}</Text>
                  <Text style={styles.rowSub}>
                    {[c.bank, `Expires ${c.exp_month}/${c.exp_year.slice(-2)}`].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {c.is_default ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>Default</Text>
                  </View>
                ) : null}
                <Ionicons name="ellipsis-horizontal" size={16} color={G.faint} />
              </Pressable>
            ))}
          </GlassCard>
        ) : (
          <GlassCard style={styles.empty}>
            <Ionicons name="card-outline" size={28} color={G.blue} />
            <Text style={styles.emptyTitle}>No saved cards</Text>
            <Text style={styles.emptyText}>
              Pay for a win with your card once and we'll keep it here, so next time is one tap. We only store the last 4
              digits; Paystack holds the card.
            </Text>
          </GlassCard>
        )}
      </ScrollView>
    </GlassScreen>
  );
};

/* ================= Personal details ================= */

export const PersonalDetailsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, setUser } = useAuthStore();
  const [name, setName] = useState(user?.full_name ?? '');
  const [username, setUsername] = useState((user as any)?.username ?? '');
  const [phone, setPhone] = useState(realPhone(user));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    meService.summary().then(s => s.username && setUsername(s.username)).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const updated: any = await meService.updateProfile({
        full_name: name.trim(),
        ...(username ? { username } : {}),
        ...(phone.trim() && phone.trim() !== realPhone(user) ? { phone_number: phone.trim() } : {}),
      });
      if (updated) {
        setUser(updated);
        await authService.persistUser(updated);
      }
      toast('Saved');
      navigation.goBack();
    } catch (e) {
      toast(errText(e, "Couldn't save your details"), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassScreen>
      <GlassHeader title="Personal details" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Full name</Text>
          <TextInput value={name} onChangeText={setName} autoCapitalize="words" style={styles.input} />
          <Text style={styles.label}>Username</Text>
          <View style={styles.inputRow}>
            <Text style={styles.at}>@</Text>
            <TextInput
              value={username}
              onChangeText={t => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20))}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, styles.flex, styles.inputBare]}
            />
          </View>
          <Text style={styles.help}>Sellers and other bidders only see your username.</Text>
          <Text style={styles.label}>Phone</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="0801 234 5678"
            placeholderTextColor={G.faint}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            style={styles.input}
          />
          <Text style={styles.help}>For delivery updates. Never shown to sellers.</Text>
          <Text style={styles.label}>Email</Text>
          <View style={[styles.input, styles.readOnly]}>
            <Text style={styles.readOnlyText}>{user?.email || 'Not added'}</Text>
          </View>
          <Text style={styles.help}>To change your email, contact support@gadgetbid.ng.</Text>
          <PrimaryButton
            label={saving ? 'Saving…' : 'Save'}
            onPress={save}
            disabled={saving || name.trim().length < 2}
            style={styles.topGap}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </GlassScreen>
  );
};

/* ================= Password & security ================= */

export const SecurityScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [pending, setPending] = useState<boolean | null>(null); // the value being confirmed
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    meService.summary().then(s => setEnabled(s.two_factor_enabled)).catch(() => setEnabled(false));
  }, []);

  const confirm = async () => {
    if (pending === null) return;
    setBusy(true);
    try {
      const res = await meService.setTwoFactor(pending, password);
      setEnabled(res.two_factor_enabled);
      setPending(null);
      setPassword('');
      toast(res.two_factor_enabled ? '2-step sign-in is on' : '2-step sign-in is off');
    } catch (e) {
      toast(errText(e, "Couldn't change that"), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassScreen>
      <GlassHeader title="Password & security" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <GlassCard style={[styles.group, styles.listRow]}>
          <Ionicons name="shield-checkmark-outline" size={20} color={G.slate} />
          <View style={styles.flex}>
            <Text style={styles.rowTitle}>2-step sign-in</Text>
            <Text style={styles.rowSub}>After your password, we email you a 6-digit code.</Text>
          </View>
          {enabled === null ? (
            <ActivityIndicator color={G.blue} />
          ) : (
            <Switch
              value={enabled}
              onValueChange={v => setPending(v)}
              trackColor={{ false: '#D8DCE6', true: G.blue }}
              thumbColor="#FFFFFF"
              accessibilityLabel="2-step sign-in"
            />
          )}
        </GlassCard>
        <Text style={styles.help}>
          Google and Apple sign-in are already protected by your Google or Apple account.
        </Text>
      </ScrollView>

      <BottomSheet
        visible={pending !== null}
        onClose={() => {
          setPending(null);
          setPassword('');
        }}
      >
        <Text style={styles.sheetTitle}>{pending ? 'Turn on 2-step sign-in' : 'Turn off 2-step sign-in'}</Text>
        <Text style={styles.label}>Enter your password to confirm</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoFocus
          autoComplete="current-password"
          textContentType="password"
          style={styles.input}
          onSubmitEditing={confirm}
        />
        <PrimaryButton label={busy ? 'Checking…' : 'Confirm'} onPress={confirm} disabled={busy || !password} style={styles.topGap} />
      </BottomSheet>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  flex: { flex: 1 },
  lead: { color: G.slate, fontSize: 14, lineHeight: 21, fontFamily: fonts.regular, marginBottom: 16 },
  loader: { marginVertical: 30 },
  group: { marginBottom: 20, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: G.line },
  rowTitle: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  rowSub: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, marginTop: 2, lineHeight: 17 },
  empty: { alignItems: 'center', padding: 20, gap: 6, marginBottom: 20 },
  emptyIcon: { width: 40, height: 40, resizeMode: 'contain' },
  emptyTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  emptyText: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center', lineHeight: 19 },
  topGap: { marginTop: 16 },
  sheetTitle: { color: G.ink, fontSize: 17, fontFamily: fonts.medium, marginBottom: 4 },
  label: { color: G.slate, fontSize: 13, fontFamily: fonts.medium, marginTop: 14, marginBottom: 6 },
  input: {
    height: 50,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: G.ink,
    borderWidth: 1,
    borderColor: 'rgba(28,31,42,0.08)',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(28,31,42,0.08)',
  },
  inputBare: { borderWidth: 0, paddingLeft: 2 },
  at: { color: G.faint, fontSize: 15, paddingLeft: 14 },
  readOnly: { justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.55)' },
  readOnlyText: { color: G.slate, fontSize: 15, fontFamily: fonts.regular },
  help: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, marginTop: 6, lineHeight: 17 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  walletCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  walletValue: { color: G.ink, fontSize: 22, fontFamily: fonts.medium, marginVertical: 2 },
  badge: { height: 20, paddingHorizontal: 8, borderRadius: 10, backgroundColor: G.blueTint, justifyContent: 'center' },
  badgeText: { color: G.blue, fontSize: 11, fontFamily: fonts.medium },
});
