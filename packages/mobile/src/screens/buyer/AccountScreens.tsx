import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  SectionLabel,
  PrimaryButton,
  SecondaryButton,
  FooterBar,
  Chip,
} from '../../components/glass';
import { BottomSheet } from '../../components/motion';
import { fonts } from '../../constants';
import { authService, meService, SavedCard, SavedSearch } from '../../services';
import type { AlertCondition, PersonalProfile } from '../../services/me.service';
import {
  getAlertPrefs,
  getPushPermission,
  openSystemNotificationSettings,
  saveAlertPrefs,
  NotificationSettings,
  NotificationSettingsChange,
} from '../../services/pushNotifications';
import { useAuthStore, useWalletStore } from '../../store';
import { useToastStore } from '../../store/toastStore';
import { formatCurrency, mediaUrl } from '../../utils';
import { CATEGORY_CHIPS } from './categories';

const toast = (msg: string, type: 'success' | 'error' = 'success') => useToastStore.getState().show(msg, type);
const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** ₦300k · ₦1.5M */
const shortNaira = (n: number) =>
  n >= 1_000_000 ? `₦${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `₦${Math.round(n / 1000)}k` : formatCurrency(n);

/** "Dec 27" */
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/* ================= Alerts ("Tell me when it's listed") ================= */

const PRICE_CHIPS: { label: string; value: number | null }[] = [
  { label: 'Any', value: null },
  { label: '₦300k', value: 300_000 },
  { label: '₦800k', value: 800_000 },
  { label: '₦1.5M', value: 1_500_000 },
];
const CONDITION_CHIPS: { label: string; value: AlertCondition | null }[] = [
  { label: 'Any', value: null },
  { label: 'New', value: 'new' },
  { label: 'A or better', value: 'a_or_better' },
  { label: 'B or better', value: 'b_or_better' },
];
const CONDITION_TEXT: Record<AlertCondition, string> = {
  new: 'New',
  a_or_better: 'Grade A or better',
  b_or_better: 'Grade B or better',
};

const alertTitle = (s: SavedSearch) =>
  s.query || CATEGORY_CHIPS.find(c => c.slug === s.category_slug)?.label || s.label;

const alertSub = (s: SavedSearch) =>
  [
    s.max_price ? `Under ${shortNaira(s.max_price)}` : 'Any price',
    s.condition ? CONDITION_TEXT[s.condition] : 'any condition',
    s.new_this_week ? `${s.new_this_week} new this week` : null,
  ]
    .filter(Boolean)
    .join(' · ');

export const AlertsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [items, setItems] = useState<SavedSearch[] | null>(null);
  const [query, setQuery] = useState('');
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [condition, setCondition] = useState<AlertCondition | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await meService.savedSearches());
    } catch {
      setItems(list => list ?? []);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const create = async () => {
    if (!query.trim()) return;
    setSaving(true);
    try {
      await meService.saveSearch({ query: query.trim(), max_price: maxPrice ?? undefined, condition });
      setQuery('');
      setMaxPrice(null);
      setCondition(null);
      toast("Done. We'll tell you the moment it's listed.");
      load();
    } catch (e) {
      toast(errText(e, "We couldn't save that alert. Try again."), 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (s: SavedSearch, enabled: boolean) => {
    setItems(list => list?.map(x => (x.id === s.id ? { ...x, enabled } : x)) ?? null);
    try {
      const updated = await meService.setSearchEnabled(s.id, enabled);
      setItems(list => list?.map(x => (x.id === s.id ? updated : x)) ?? null);
    } catch (e) {
      setItems(list => list?.map(x => (x.id === s.id ? { ...x, enabled: !enabled } : x)) ?? null);
      toast(errText(e, "We couldn't change that alert. Try again."), 'error');
    }
  };

  const remove = (s: SavedSearch) =>
    Alert.alert(`Remove the "${alertTitle(s)}" alert?`, "You'll stop hearing about new listings for it.", [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setItems(list => list?.filter(x => x.id !== s.id) ?? null);
          await meService.deleteSearch(s.id).catch(() => load());
        },
      },
    ]);

  return (
    <GlassScreen>
      <GlassHeader title="Alerts" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title} accessibilityRole="header">
            Tell me when it's listed
          </Text>
          <Text style={styles.lead}>We'll notify you the moment a matching auction goes live.</Text>

          <GlassCard style={styles.formCard}>
            <Text style={[styles.label, styles.labelFirst]}>Looking for</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="e.g. iPhone 15 Pro Max"
              placeholderTextColor={G.faint}
              style={styles.input}
              returnKeyType="done"
              accessibilityLabel="Looking for"
            />
            <Text style={styles.overline}>MAX PRICE</Text>
            <View style={styles.chipWrap} accessibilityRole="radiogroup">
              {PRICE_CHIPS.map(c => (
                <Chip key={c.label} label={c.label} selected={maxPrice === c.value} onPress={() => setMaxPrice(c.value)} />
              ))}
            </View>
            <Text style={styles.overline}>CONDITION</Text>
            <View style={styles.chipWrap} accessibilityRole="radiogroup">
              {CONDITION_CHIPS.map(c => (
                <Chip key={c.label} label={c.label} selected={condition === c.value} onPress={() => setCondition(c.value)} />
              ))}
            </View>
            <PrimaryButton
              label={saving ? 'Saving…' : 'Create alert'}
              onPress={create}
              disabled={saving || !query.trim()}
              style={styles.topGap}
            />
          </GlassCard>

          <View style={styles.section}>
            <SectionLabel>Your alerts</SectionLabel>
          </View>
          {items === null ? (
            <ActivityIndicator color={G.blue} style={styles.loader} />
          ) : items.length ? (
            <GlassCard style={styles.group}>
              {items.map((s, i) => (
                <Pressable
                  key={s.id}
                  onLongPress={() => remove(s)}
                  style={[styles.toggleRow, i < items.length - 1 && styles.divider]}
                  accessibilityHint="Press and hold to remove"
                  accessibilityActions={[{ name: 'delete', label: 'Remove alert' }]}
                  onAccessibilityAction={e => e.nativeEvent.actionName === 'delete' && remove(s)}
                >
                  <View style={styles.flex}>
                    <Text style={[styles.rowTitle, !s.enabled && styles.rowTitleOff]}>{alertTitle(s)}</Text>
                    <Text style={styles.rowSub}>{alertSub(s)}</Text>
                  </View>
                  <Switch
                    value={s.enabled}
                    onValueChange={v => toggle(s, v)}
                    trackColor={{ false: '#EDEFF4', true: G.blue }}
                    thumbColor="#FFFFFF"
                    accessibilityLabel={`${alertTitle(s)} alert`}
                  />
                </Pressable>
              ))}
            </GlassCard>
          ) : (
            <GlassCard style={styles.empty}>
              <Image source={require('../../../assets/icons/bell.png')} style={styles.emptyIcon} />
              <Text style={styles.emptyTitle}>No alerts yet</Text>
              <Text style={styles.emptyText}>Add one above for the gadget you can't find.</Text>
            </GlassCard>
          )}
          {items?.length ? <Text style={styles.help}>Press and hold an alert to remove it.</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </GlassScreen>
  );
};

/* ================= Payment methods ================= */

const BrandTile: React.FC<{ brand: string }> = ({ brand }) => {
  const b = brand.toLowerCase();
  const isVisa = b.includes('visa');
  const isMc = b.includes('master');
  return (
    <View style={[styles.brandTile, isVisa ? styles.brandVisa : isMc ? styles.brandMc : styles.brandOther]}>
      <Text style={styles.brandText}>{isVisa ? 'VISA' : isMc ? 'MC' : b.includes('verve') ? 'VERVE' : 'CARD'}</Text>
    </View>
  );
};

export const PaymentMethodsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { wallet, fetchWallet } = useWalletStore();
  const [cards, setCards] = useState<SavedCard[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    fetchWallet().catch(() => {});
    try {
      setCards(await meService.cards());
    } catch {
      setCards(list => list ?? []);
    }
  }, [fetchWallet]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const makeDefault = async (c: SavedCard) => {
    setBusy(c.id);
    try {
      setCards(await meService.defaultCard(c.id));
      toast(`${c.label} is now your default card.`);
    } catch (e) {
      toast(errText(e, "We couldn't change your default card. Try again."), 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = (c: SavedCard) =>
    Alert.alert(`Remove ${c.label}?`, "It's deleted from your account. You can save it again next time you pay with it.", [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusy(c.id);
          try {
            setCards(await meService.deleteCard(c.id));
            toast('Card removed.');
          } catch (e) {
            toast(errText(e, "We couldn't remove that card. Try again."), 'error');
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  return (
    <GlassScreen>
      <GlassHeader title="Payment methods" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        {cards === null ? (
          <ActivityIndicator color={G.blue} style={styles.loader} />
        ) : (
          cards.map(c => (
            <GlassCard key={c.id} style={styles.cardBox}>
              <View style={styles.cardTop}>
                <BrandTile brand={c.brand} />
                <View style={styles.flex}>
                  <Text style={styles.cardTitle}>{c.label}</Text>
                  <Text style={styles.rowSub}>
                    {[c.bank, `Expires ${c.exp_month}/${c.exp_year.slice(-2)}`].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {c.is_default ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>Default</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.cardActions}>
                {c.is_default ? null : (
                  <SecondaryButton
                    label="Make default"
                    compact
                    onPress={() => makeDefault(c)}
                    disabled={busy === c.id}
                    style={styles.flex}
                  />
                )}
                <SecondaryButton
                  label="Remove"
                  compact
                  danger
                  onPress={() => remove(c)}
                  disabled={busy === c.id}
                  style={styles.flex}
                />
              </View>
            </GlassCard>
          ))
        )}

        {cards && !cards.length ? (
          <GlassCard style={styles.empty}>
            <Ionicons name="card-outline" size={28} color={G.blue} />
            <Text style={styles.emptyTitle}>No saved cards yet</Text>
            <Text style={styles.emptyText}>
              Pay for a win with a card once and we'll keep it here, so next time is one tap. Paystack holds the card; we
              only keep the last 4 digits.
            </Text>
          </GlassCard>
        ) : cards?.length ? (
          <Text style={styles.help}>New cards are saved when you pay for a win with them.</Text>
        ) : null}

        <GlassCard style={styles.note}>
          <Image source={require('../../../assets/icons/wallet.png')} style={styles.noteIcon} />
          <Text style={styles.noteText}>Bank transfer and USSD are always available at checkout. No setup needed.</Text>
        </GlassCard>

        <View style={styles.section}>
          <SectionLabel>Wallet</SectionLabel>
        </View>
        <GlassCard style={styles.walletCard}>
          <View style={styles.flex}>
            <Text style={styles.rowSub}>Available to bid</Text>
            <Text style={styles.walletValue}>{formatCurrency(wallet?.available_balance ?? wallet?.balance ?? 0)}</Text>
            <Text style={styles.rowSub}>Each auction you bid on holds ₦1,000 until it ends.</Text>
          </View>
          <PrimaryButton label="Manage" compact onPress={() => navigation.navigate('Wallet')} />
        </GlassCard>
      </ScrollView>
    </GlassScreen>
  );
};

/* ================= Personal details ================= */

const initials = (first: string, last: string, fallback?: string | null) =>
  `${first.trim()[0] ?? ''}${last.trim()[0] ?? ''}`.toUpperCase() || (fallback?.[0] ?? '?').toUpperCase();

/** +2348030004521 → "803 000 4521" */
const localDigits = (phone: string | null) => (phone ?? '').replace(/\D/g, '').replace(/^234/, '').replace(/^0/, '');
const groupPhone = (digits: string) =>
  [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)].filter(Boolean).join(' ');
const phoneError = (digits: string) =>
  !digits || /^[789][01]\d{8}$/.test(digits) ? null : 'Check the number. It should look like 803 000 4521.';

export const PersonalDetailsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { setUser, logout } = useAuthStore();
  const [profile, setProfile] = useState<PersonalProfile | null>(null);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneErr, setPhoneErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const loaded = useRef(false);

  const fill = (p: PersonalProfile) => {
    setProfile(p);
    setFirst(p.first_name);
    setLast(p.last_name);
    setUsername(p.username ?? '');
    setPhone(groupPhone(localDigits(p.phone_number)));
  };

  // Reload on focus: after changing email/phone or the photo, show the new ones
  // without throwing away name edits in progress.
  useFocusEffect(
    useCallback(() => {
      meService
        .profile()
        .then(p => {
          if (!loaded.current) {
            loaded.current = true;
            fill(p);
            return;
          }
          setProfile(prev =>
            prev ? { ...prev, email: p.email, email_verified: p.email_verified, phone_number: p.phone_number, avatar_url: p.avatar_url } : p
          );
          // The number is read-only once set, so showing the latest one can't lose an edit.
          if (p.phone_number) setPhone(groupPhone(localDigits(p.phone_number)));
        })
        .catch(e => toast(errText(e, "We couldn't load your details."), 'error'));
    }, [])
  );

  const digits = phone.replace(/\D/g, '').replace(/^0/, '');
  const dirty = useMemo(() => {
    if (!profile) return false;
    return (
      first.trim() !== profile.first_name ||
      last.trim() !== profile.last_name ||
      username !== (profile.username ?? '') ||
      digits !== localDigits(profile.phone_number)
    );
  }, [profile, first, last, username, digits]);
  const usernameLocked = !!profile?.username_change_available_at;
  // Usernames and phone numbers can be changed, not removed.
  const valid =
    first.trim().length > 0 &&
    !phoneError(digits) &&
    (digits ? true : !profile?.phone_number) &&
    (username ? /^[a-z0-9_]{3,20}$/.test(username) : !profile?.username);

  const applyUser = async (user: any) => {
    if (!user) return;
    setUser(user);
    await authService.persistUser(user).catch(() => {});
  };

  const save = async () => {
    if (!profile || !dirty || !valid) return;
    setSaving(true);
    try {
      const fullName = `${first.trim()} ${last.trim()}`.trim();
      const res = await meService.updateProfile({
        ...(fullName !== profile.full_name ? { full_name: fullName } : {}),
        ...(username && username !== profile.username ? { username } : {}),
        ...(digits && digits !== localDigits(profile.phone_number) ? { phone_number: `+234${digits}` } : {}),
      });
      fill(res.profile);
      await applyUser(res.user);
      toast('Saved. Your details are up to date.');
    } catch (e) {
      toast(errText(e, "We couldn't save your details. Try again."), 'error');
    } finally {
      setSaving(false);
    }
  };


  const deleteAccount = () =>
    Alert.alert(
      'Delete your account?',
      "We remove your name, contact details, saved cards, alerts and addresses, then sign you out. Past orders stay on record without your name. This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete my account',
          style: 'destructive',
          onPress: async () => {
            try {
              await meService.deleteAccount();
              toast('Your account is deleted.');
              await logout();
            } catch (e) {
              Alert.alert("We can't delete your account yet", errText(e, 'Try again in a minute.'));
            }
          },
        },
      ]
    );

  if (!profile) {
    return (
      <GlassScreen>
        <GlassHeader title="Personal details" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={G.blue} style={styles.loader} />
      </GlassScreen>
    );
  }

  return (
    <GlassScreen>
      <GlassHeader title="Personal details" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.avatarBlock}>
            <View style={styles.avatar}>
              {profile.avatar_url ? (
                <Image source={{ uri: mediaUrl(profile.avatar_url) }} style={styles.avatarImg} accessibilityLabel="Your photo" />
              ) : (
                <Text style={styles.avatarText}>{initials(first, last, profile.username)}</Text>
              )}
            </View>
            <Pressable onPress={() => navigation.navigate('ProfilePhoto')} hitSlop={8} accessibilityRole="button">
              <Text style={styles.link}>Change photo</Text>
            </Pressable>
          </View>

          <View style={styles.nameRow}>
            <View style={styles.flex}>
              <Text style={styles.label}>First name</Text>
              <TextInput
                value={first}
                onChangeText={setFirst}
                autoCapitalize="words"
                autoComplete="given-name"
                textContentType="givenName"
                style={styles.input}
              />
            </View>
            <View style={styles.flex}>
              <Text style={styles.label}>Last name</Text>
              <TextInput
                value={last}
                onChangeText={setLast}
                autoCapitalize="words"
                autoComplete="family-name"
                textContentType="familyName"
                style={styles.input}
              />
            </View>
          </View>

          <Text style={styles.label}>Username</Text>
          <View style={[styles.inputRow, usernameLocked && styles.inputLocked]}>
            <Text style={styles.at}>@</Text>
            <TextInput
              value={username}
              onChangeText={t => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20))}
              editable={!usernameLocked}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, styles.flex, styles.inputBare, usernameLocked && styles.lockedText]}
              accessibilityLabel="Username"
            />
          </View>
          {username && !/^[a-z0-9_]{3,20}$/.test(username) ? (
            <Text style={styles.errorText}>Usernames are 3–20 letters, numbers or _.</Text>
          ) : null}
          <Text style={styles.help}>
            {usernameLocked
              ? `Usernames can be changed once every 30 days. You can change it again on ${shortDate(
                  profile.username_change_available_at!
                )}.`
              : 'Usernames can be changed once every 30 days.'}
          </Text>

          <Text style={styles.label}>Email</Text>
          <View style={[styles.input, styles.readOnly]}>
            <Text style={styles.readOnlyText} numberOfLines={1}>
              {profile.email || 'Not added'}
            </Text>
            {profile.email_verified ? (
              <View style={styles.verified}>
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.label}>Phone</Text>
          <View style={styles.phoneRow}>
            <View style={[styles.input, styles.prefix]}>
              <Text style={styles.prefixText}>+234</Text>
            </View>
            {profile.phone_number ? (
              <View style={[styles.input, styles.readOnly, styles.flex]} accessibilityLabel={`Phone number ${phone}`}>
                <Text style={styles.readOnlyText}>{phone}</Text>
              </View>
            ) : (
            <TextInput
              value={phone}
              onChangeText={t => {
                setPhone(groupPhone(t.replace(/\D/g, '').replace(/^0/, '').slice(0, 10)));
                if (phoneErr) setPhoneErr(null);
              }}
              onBlur={() => setPhoneErr(phoneError(digits))}
              placeholder="803 000 4521"
              placeholderTextColor={G.faint}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              style={[styles.input, styles.flex, phoneErr && styles.inputError]}
              accessibilityLabel="Phone number"
            />
            )}
          </View>
          {phoneErr ? <Text style={styles.errorText}>{phoneErr}</Text> : null}

          <Pressable
            onPress={() => navigation.navigate('ChangeContact')}
            style={styles.changeLink}
            hitSlop={6}
            accessibilityRole="button"
          >
            <Text style={styles.link}>Change email or phone with a code</Text>
          </Pressable>

          <Pressable onPress={deleteAccount} style={styles.deleteLink} accessibilityRole="button">
            <Text style={styles.deleteText}>Delete my account</Text>
          </Pressable>
        </ScrollView>
        <FooterBar>
          <PrimaryButton label={saving ? 'Saving…' : 'Save changes'} onPress={save} disabled={!dirty || !valid || saving} />
        </FooterBar>
      </KeyboardAvoidingView>
    </GlassScreen>
  );
};

/* ================= Notifications (alert settings) ================= */

type SwitchKey = keyof Omit<NotificationSettings, 'channels' | 'quiet_hours' | 'bids' | 'orders'>;

const SECTIONS: { title: string; rows: { key: SwitchKey; title: string; sub?: string }[] }[] = [
  {
    title: 'Bids',
    rows: [
      { key: 'outbid', title: 'Outbid', sub: 'Straight away, with a one-tap re-bid' },
      { key: 'ending_soon', title: 'Watchlist ending soon', sub: '5 minutes before it ends' },
      { key: 'autobid_max', title: 'Auto-bid hit your max', sub: 'So you can decide to go higher' },
      { key: 'won', title: 'You won', sub: 'With your 24-hour pay deadline' },
    ],
  },
  {
    title: 'Orders',
    rows: [
      { key: 'payment_reminders', title: 'Payment reminders', sub: '6 hours before your deadline' },
      { key: 'delivery_updates', title: 'Hub check and delivery updates' },
      { key: 'dispute_updates', title: 'Dispute updates' },
    ],
  },
  {
    title: 'News',
    rows: [
      { key: 'saved_search', title: 'New listings like your searches', sub: 'From your saved alerts' },
      { key: 'marketing', title: 'Offers and news', sub: 'At most once a week' },
    ],
  },
];

const CHANNELS: { key: keyof NotificationSettings['channels']; label: string }[] = [
  { key: 'push', label: 'Push' },
  { key: 'email', label: 'Email' },
  { key: 'sms', label: 'SMS' },
];

export const NotificationSettingsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuthStore();
  const [prefs, setPrefs] = useState<NotificationSettings | null>(null);
  const [osBlocked, setOsBlocked] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getAlertPrefs()
        .then(setPrefs)
        .catch(e => toast(errText(e, "We couldn't load your alert settings."), 'error'));
      getPushPermission()
        .then(p => setOsBlocked(p === 'denied'))
        .catch(() => {});
    }, [])
  );

  /** Save straight away; put it back if the server says no. */
  const change = async (patch: NotificationSettingsChange, optimistic: NotificationSettings) => {
    const before = prefs;
    setPrefs(optimistic);
    try {
      setPrefs(await saveAlertPrefs(patch));
    } catch (e) {
      setPrefs(before);
      toast(errText(e, "We couldn't save that. Try again."), 'error');
    }
  };

  if (!prefs) {
    return (
      <GlassScreen>
        <GlassHeader title="Notifications" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={G.blue} style={styles.loader} />
      </GlassScreen>
    );
  }

  const hasPhone = !!user?.phone_number && !String(user.phone_number).startsWith('+9');

  return (
    <GlassScreen>
      <GlassHeader title="Notifications" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        {osBlocked && prefs.channels.push ? (
          <View style={styles.warn}>
            <Text style={styles.warnText}>Notifications are off for Gadgets Bidding in your phone's Settings.</Text>
            <Pressable onPress={openSystemNotificationSettings} hitSlop={8} accessibilityRole="button">
              <Text style={styles.link}>Open Settings</Text>
            </Pressable>
          </View>
        ) : null}

        {SECTIONS.map(section => (
          <View key={section.title}>
            <View style={styles.section}>
              <SectionLabel>{section.title}</SectionLabel>
            </View>
            <GlassCard style={styles.group}>
              {section.rows.map((r, i) => (
                <View key={r.key} style={[styles.toggleRow, i < section.rows.length - 1 && styles.divider]}>
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{r.title}</Text>
                    {r.sub ? <Text style={styles.rowSub}>{r.sub}</Text> : null}
                  </View>
                  <Switch
                    value={prefs[r.key]}
                    onValueChange={v => change({ [r.key]: v }, { ...prefs, [r.key]: v })}
                    trackColor={{ false: '#EDEFF4', true: G.blue }}
                    thumbColor="#FFFFFF"
                    accessibilityLabel={r.title}
                  />
                </View>
              ))}
            </GlassCard>
          </View>
        ))}

        <View style={styles.section}>
          <SectionLabel>How we reach you</SectionLabel>
        </View>
        <View style={styles.chipWrap}>
          {CHANNELS.map(c => (
            <Chip
              key={c.key}
              label={c.label}
              selected={prefs.channels[c.key]}
              onPress={() =>
                change(
                  { channels: { [c.key]: !prefs.channels[c.key] } },
                  { ...prefs, channels: { ...prefs.channels, [c.key]: !prefs.channels[c.key] } }
                )
              }
            />
          ))}
        </View>
        {prefs.channels.sms && !hasPhone ? (
          <Text style={styles.help}>Add your phone number in Personal details to get texts.</Text>
        ) : null}
        {!prefs.channels.push && !prefs.channels.email && !prefs.channels.sms ? (
          <Text style={styles.help}>Alerts will only show in the app's notification list.</Text>
        ) : null}

        <GlassCard style={[styles.group, styles.toggleRow, styles.topGap]}>
          <View style={styles.flex}>
            <Text style={styles.rowTitle}>Quiet hours</Text>
            <Text style={styles.rowSub}>10:00 pm – 7:00 am · no sounds</Text>
          </View>
          <Switch
            value={prefs.quiet_hours}
            onValueChange={v => change({ quiet_hours: v }, { ...prefs, quiet_hours: v })}
            trackColor={{ false: '#EDEFF4', true: G.blue }}
            thumbColor="#FFFFFF"
            accessibilityLabel="Quiet hours"
          />
        </GlassCard>
        <Text style={styles.help}>Payment deadlines and security alerts are always sent, even in quiet hours.</Text>
      </ScrollView>
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
              trackColor={{ false: '#EDEFF4', true: G.blue }}
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
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  flex: { flex: 1 },
  loader: { marginVertical: 30 },
  topGap: { marginTop: 16 },
  section: { marginTop: 8 },

  title: { color: G.ink, fontSize: 26, lineHeight: 32, letterSpacing: -0.52, fontFamily: fonts.medium, marginTop: 4 },
  lead: { color: G.muted, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular, marginTop: 6, marginBottom: 16 },

  group: { marginBottom: 16, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, minHeight: 64 },
  divider: { borderBottomWidth: 1, borderBottomColor: 'rgba(28,31,42,0.05)' },
  rowTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  rowTitleOff: { color: G.muted },
  rowSub: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 2, lineHeight: 18 },

  empty: { alignItems: 'center', padding: 20, gap: 6, marginBottom: 16 },
  emptyIcon: { width: 40, height: 40, resizeMode: 'contain' },
  emptyTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  emptyText: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center', lineHeight: 19 },

  formCard: { padding: 16, marginBottom: 20 },
  label: { color: G.slate, fontSize: 14, fontFamily: fonts.medium, marginTop: 16, marginBottom: 8 },
  labelFirst: { marginTop: 0 },
  overline: { color: G.muted, fontSize: 13, fontFamily: fonts.medium, letterSpacing: 0.52, marginTop: 16, marginBottom: 8 },
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
  inputError: { borderColor: '#D9536A' },
  errorText: { color: '#D9536A', fontSize: 13, fontFamily: fonts.regular, marginTop: 6 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EDEFF4',
  },
  inputLocked: { backgroundColor: 'rgba(255,255,255,0.55)' },
  lockedText: { color: G.slate },
  inputBare: { borderWidth: 0, paddingLeft: 2, backgroundColor: 'transparent' },
  at: { color: G.faint, fontSize: 16, paddingLeft: 16 },
  readOnly: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  readOnlyText: { flex: 1, color: G.ink, fontSize: 16, fontFamily: fonts.regular },
  verified: { height: 26, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#EEF9F2', justifyContent: 'center' },
  verifiedText: { color: '#2E9E5E', fontSize: 12, fontFamily: fonts.medium },
  help: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 8, lineHeight: 19 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sheetTitle: { color: G.ink, fontSize: 19, fontFamily: fonts.medium, marginBottom: 4 },
  link: { color: G.blue600, fontSize: 14, fontFamily: fonts.medium },

  avatarBlock: { alignItems: 'center', gap: 10, marginTop: 4, marginBottom: 8 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: G.blue, fontSize: 28, fontFamily: fonts.medium },
  nameRow: { flexDirection: 'row', gap: 12 },
  phoneRow: { flexDirection: 'row', gap: 8 },
  prefix: { justifyContent: 'center', paddingHorizontal: 14 },
  prefixText: { color: G.ink, fontSize: 16, fontFamily: fonts.regular },
  changeLink: { alignItems: 'center', paddingVertical: 10, marginTop: 16 },
  deleteLink: { alignItems: 'center', paddingVertical: 14, marginTop: 12 },
  deleteText: { color: '#D9536A', fontSize: 14, fontFamily: fonts.medium },

  cardBox: { padding: 14, marginBottom: 12, gap: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  cardActions: { flexDirection: 'row', gap: 8 },
  brandTile: { width: 48, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  brandVisa: { backgroundColor: '#3E6AF0' },
  brandMc: { backgroundColor: G.ink },
  brandOther: { backgroundColor: G.slate },
  brandText: { color: '#FFFFFF', fontSize: 11, fontFamily: fonts.medium, letterSpacing: 0.4 },
  badge: { height: 26, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#F1F5FF', justifyContent: 'center' },
  badgeText: { color: '#3E6AF0', fontSize: 12, fontFamily: fonts.medium },
  note: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginTop: 8, marginBottom: 8 },
  noteIcon: { width: 28, height: 28, resizeMode: 'contain' },
  noteText: { flex: 1, color: G.slate, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular },
  walletCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 16 },
  walletValue: { color: G.ink, fontSize: 22, fontFamily: fonts.medium, marginVertical: 2, fontVariant: ['tabular-nums'] },

  warn: { padding: 14, borderRadius: 16, backgroundColor: '#FFF6EE', gap: 6, marginBottom: 12 },
  warnText: { color: G.ink, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
});
