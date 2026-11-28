import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Switch, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  Chip,
  PrimaryButton,
  FooterBar,
  GlassKeyboardView,
} from '../../../components/glass';
import { Field, TextField } from '../../../components/auth/GlassAuthKit';
import { BottomSheet } from '../../../components/motion';
import { fonts } from '../../../constants';
import {
  sellerStoreService,
  StoreDetails,
  StoreDetailsChange,
  StoreHours,
  Day,
  DAYS,
  clockLabel,
} from '../../../services/sellerStore.service';
import { Note } from '../onboarding/kit';
import { LoadingScreen, Overline, toast, errText, s as shared } from './shared';

const DAY_SHORT: Record<Day, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};
const DAY_NAME: Record<Day, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

/** Suggested until the seller saves their own: Mon–Sat, 9:00 am – 6:00 pm. */
const SUGGESTED = {
  days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as Day[],
  open: '09:00',
  close: '18:00',
};

const STEP = 30;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
/** 5:00 am to 11:30 pm in half hours. */
const TIMES = Array.from({ length: (23 * 60 + 30 - 5 * 60) / STEP + 1 }, (_, i) => toTime(5 * 60 + i * STEP));

const isPhone = (v: string) => /^(\+?234|0)?[789][01]\d{8}$/.test(v.replace(/[\s-]/g, ''));

type HoursForm = { days: Day[]; open: string; close: string };

/**
 * The form shows one time range for the chosen days. Saved hours with different times per day
 * open on the most common range (`mixed` says so, and saving makes them all the same).
 */
const hoursForm = (hours: StoreHours | null): HoursForm & { mixed: boolean; unset: boolean } => {
  if (!hours) return { ...SUGGESTED, mixed: false, unset: true };
  const open = DAYS.filter(d => hours[d]);
  if (!open.length)
    return {
      days: [],
      open: SUGGESTED.open,
      close: SUGGESTED.close,
      mixed: false,
      unset: false,
    };
  const tally = new Map<string, number>();
  open.forEach(d => {
    const k = `${hours[d]!.open}-${hours[d]!.close}`;
    tally.set(k, (tally.get(k) ?? 0) + 1);
  });
  const [top] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  const [o, c] = top.split('-');
  return { days: open, open: o, close: c, mixed: tally.size > 1, unset: false };
};

const toHours = (f: HoursForm): StoreHours =>
  Object.fromEntries(DAYS.map(d => [d, f.days.includes(d) ? { open: f.open, close: f.close } : null])) as StoreHours;

type Form = {
  plaza: string;
  shop_number: string;
  business_phone: string;
  about: string;
  categories: string[];
} & HoursForm;

const formOf = (d: StoreDetails): Form => {
  const h = hoursForm(d.hours);
  return {
    plaza: d.shop.plaza ?? '',
    shop_number: d.shop.shop_number ?? '',
    business_phone: d.business_phone ?? '',
    about: d.about ?? '',
    categories: d.categories,
    days: h.days,
    open: h.open,
    close: h.close,
  };
};

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));

type Errors = Partial<
  Record<'plaza' | 'shop_number' | 'business_phone' | 'about' | 'categories' | 'hours', string | null>
>;

/** Verified facts (locked), the shop, what you sell, opening hours and away mode. */
export const StoreDetailsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [details, setDetails] = useState<StoreDetails | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [away, setAway] = useState(false);
  const [awayBusy, setAwayBusy] = useState(false);
  const [picking, setPicking] = useState<'open' | 'close' | null>(null);

  const apply = (d: StoreDetails) => {
    setDetails(d);
    setForm(formOf(d));
    setAway(d.away);
  };

  const load = useCallback(async () => {
    setFailed(null);
    try {
      apply(await sellerStoreService.details());
    } catch (e) {
      setFailed(errText(e, "Couldn't load your store details"));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const initial = useMemo(() => (details ? formOf(details) : null), [details]);
  const hoursMeta = useMemo(() => (details ? hoursForm(details.hours) : null), [details]);

  if (!details || !form || !initial || !hoursMeta) {
    return <LoadingScreen title="Store details" onBack={() => navigation.goBack()} failed={failed} onRetry={load} />;
  }

  const max = details.about_max;
  const aboutLength = form.about.trim().length;
  const tooLong = aboutLength > max;

  const changed = {
    plaza: form.plaza.trim() !== initial.plaza.trim(),
    shop_number: form.shop_number.trim() !== initial.shop_number.trim(),
    business_phone: form.business_phone.replace(/\D/g, '') !== initial.business_phone.replace(/\D/g, ''),
    about: form.about.trim() !== initial.about.trim(),
    categories: !sameList(form.categories, initial.categories),
    // Never-saved hours count as a change, so the suggestion can be saved as it is.
    hours:
      hoursMeta.unset ||
      !sameList(form.days, initial.days) ||
      form.open !== initial.open ||
      form.close !== initial.close,
  };
  const dirty = Object.values(changed).some(Boolean);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm(f => (f ? { ...f, [key]: value } : f));
    const errorKey = (['days', 'open', 'close'].includes(key) ? 'hours' : key) as keyof Errors;
    if (errors[errorKey]) setErrors(e => ({ ...e, [errorKey]: null }));
  };

  const check = (): Errors => ({
    plaza: form.plaza.trim() ? null : 'Enter the plaza or building your shop is in.',
    shop_number: form.shop_number.trim() ? null : 'Enter your shop number, like Shop 14, 2nd floor.',
    business_phone: isPhone(form.business_phone) ? null : 'Enter a Nigerian mobile number, like 0803 000 0000.',
    about: tooLong ? `Keep it to ${max} characters.` : null,
    categories: form.categories.length ? null : 'Pick at least one thing you sell.',
    hours: form.days.length ? null : "Pick the days you're open.",
  });

  const save = async () => {
    const next = check();
    setErrors(next);
    if (Object.values(next).some(Boolean)) {
      toast('Check the highlighted fields.');
      return;
    }
    const changes: StoreDetailsChange = {};
    if (changed.plaza) changes.plaza = form.plaza.trim();
    if (changed.shop_number) changes.shop_number = form.shop_number.trim();
    if (changed.business_phone) changes.business_phone = form.business_phone.trim();
    if (changed.about) changes.about = form.about.trim() || null;
    if (changed.categories) changes.categories = form.categories;
    if (changed.hours) changes.hours = toHours(form);
    setSaving(true);
    try {
      apply(await sellerStoreService.saveDetails(changes));
      setErrors({});
      toast('Saved. Buyers see the changes on your seller page.', 'success');
    } catch (e) {
      const message = errText(e, "We couldn't save that. Try again.");
      // Problems with a field go under it; anything else as a toast.
      if (/plaza/i.test(message)) setErrors({ plaza: message });
      else if (/shop number/i.test(message)) setErrors({ shop_number: message });
      else if (/mobile number/i.test(message)) setErrors({ business_phone: message });
      else if (/you sell|categor/i.test(message)) setErrors({ categories: message });
      else if (/leave|characters/i.test(message)) setErrors({ about: message });
      else if (/close|open|hours/i.test(message)) setErrors({ hours: message });
      else toast(message);
    } finally {
      setSaving(false);
    }
  };

  const toggleAway = async (on: boolean) => {
    setAway(on);
    setAwayBusy(true);
    try {
      const d = await sellerStoreService.saveDetails({ away: on });
      setDetails(prev => (prev ? { ...prev, away: d.away } : d));
      setAway(d.away);
      toast(on ? "You're away. New listings are paused." : "You're back. Away mode is off.", 'success');
    } catch (e) {
      setAway(!on);
      toast(errText(e, "We couldn't change that. Try again."));
    } finally {
      setAwayBusy(false);
    }
  };

  const toggleDay = (d: Day) =>
    set(
      'days',
      form.days.includes(d) ? form.days.filter(x => x !== d) : DAYS.filter(x => x === d || form.days.includes(x))
    );
  const toggleCategory = (c: string) =>
    set(
      'categories',
      form.categories.includes(c)
        ? form.categories.filter(x => x !== c)
        : details.category_options.filter(x => x === c || form.categories.includes(x))
    );

  const pickTime = (t: string) => {
    if (picking === 'open') {
      // Keep closing after opening.
      const close = toMin(form.close) > toMin(t) ? form.close : toTime(Math.min(toMin(t) + 9 * 60, 23 * 60 + 30));
      setForm(f => (f ? { ...f, open: t, close } : f));
    } else if (picking === 'close') {
      set('close', t);
    }
    setErrors(e => ({ ...e, hours: null }));
    setPicking(null);
  };
  const timeOptions = picking === 'close' ? TIMES.filter(t => toMin(t) > toMin(form.open)) : TIMES.slice(0, -1);

  return (
    <GlassScreen>
      <GlassHeader title="Store details" onBack={() => navigation.goBack()} />
      <GlassKeyboardView>
        <ScrollView contentContainerStyle={shared.content} keyboardShouldPersistTaps="handled">
          <Overline style={styles.first}>Verified — can't edit here</Overline>
          <GlassCard style={shared.group}>
            <LockedRow label="Registered business name" value={details.business_name || '—'} />
            <LockedRow label="Seller ID buyers see" value={`Verified seller ${details.seller_code}`} />
            <LockedRow label="Area" value={details.area || '—'} last />
          </GlassCard>
          <Text style={styles.lockNote}>
            To change your registered name,{' '}
            <Text style={styles.link} onPress={() => navigation.navigate('SupportChat')} accessibilityRole="link">
              contact us
            </Text>{' '}
            — we'll need new CAC documents.
          </Text>

          <Overline>Shop</Overline>
          <View style={styles.pair}>
            <Field label="Plaza or building" error={errors.plaza} style={styles.plaza}>
              <TextField
                value={form.plaza}
                onChangeText={v => set('plaza', v)}
                onBlur={() =>
                  !form.plaza.trim() &&
                  setErrors(e => ({
                    ...e,
                    plaza: 'Enter the plaza or building.',
                  }))
                }
                placeholder="Otigba Tech Plaza"
                autoCapitalize="words"
                maxLength={120}
                invalid={!!errors.plaza}
                accessibilityLabel="Plaza or building"
              />
            </Field>
            <Field label="Shop number" error={errors.shop_number} style={styles.shopNo}>
              <TextField
                value={form.shop_number}
                onChangeText={v => set('shop_number', v)}
                onBlur={() =>
                  !form.shop_number.trim() &&
                  setErrors(e => ({
                    ...e,
                    shop_number: 'Enter your shop number.',
                  }))
                }
                placeholder="Shop 14"
                maxLength={60}
                invalid={!!errors.shop_number}
                accessibilityLabel="Shop number"
              />
            </Field>
          </View>
          <Field label="Business phone" error={errors.business_phone}>
            <TextField
              value={form.business_phone}
              onChangeText={v => set('business_phone', v)}
              onBlur={() =>
                setErrors(e => ({
                  ...e,
                  business_phone: isPhone(form.business_phone)
                    ? null
                    : 'Enter a Nigerian mobile number, like 0803 000 0000.',
                }))
              }
              placeholder="0803 000 0000"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              maxLength={20}
              invalid={!!errors.business_phone}
              accessibilityLabel="Business phone"
            />
          </Field>
          <Field label="About your shop" error={errors.about} style={styles.aboutField}>
            <TextField
              value={form.about}
              onChangeText={v => set('about', v)}
              onBlur={() =>
                tooLong &&
                setErrors(e => ({
                  ...e,
                  about: `Keep it to ${max} characters.`,
                }))
              }
              multiline
              maxLength={Math.max(max, form.about.length)}
              invalid={!!errors.about}
              textAlignVertical="top"
              style={styles.about}
              placeholder="What you sell and how you check it"
              accessibilityLabel="About your shop"
            />
          </Field>
          <Text style={[shared.help, styles.counter, tooLong && { color: G.red }]}>
            {aboutLength}/{max} · buyers see this on your seller page, without your name
          </Text>

          <Overline>What you sell</Overline>
          <View style={styles.chips}>
            {details.category_options.map(c => (
              <Chip key={c} label={c} selected={form.categories.includes(c)} onPress={() => toggleCategory(c)} />
            ))}
          </View>
          {errors.categories ? <Text style={styles.error}>{errors.categories}</Text> : null}

          <Overline>Opening hours</Overline>
          {hoursMeta.unset ? (
            <Note style={styles.note}>Suggested hours. Save to show them on your seller page.</Note>
          ) : hoursMeta.mixed ? (
            <Note style={styles.note}>Some days had other hours. Saving sets these hours for every day you pick.</Note>
          ) : null}
          <View style={styles.chips} accessibilityLabel="Days you're open">
            {DAYS.map(d => (
              <Chip key={d} label={DAY_SHORT[d]} selected={form.days.includes(d)} onPress={() => toggleDay(d)} />
            ))}
          </View>
          <View style={[styles.pair, styles.times]}>
            <TimeSelect label="Opens" value={form.open} onPress={() => setPicking('open')} />
            <TimeSelect label="Closes" value={form.close} onPress={() => setPicking('close')} />
          </View>
          {errors.hours ? <Text style={styles.error}>{errors.hours}</Text> : null}

          <Overline>Away mode</Overline>
          <GlassCard style={styles.awayCard}>
            <View style={shared.flex}>
              <Text style={styles.awayTitle}>I'm away</Text>
              <Text style={styles.awaySub}>Pauses new listings. Running auctions and sold items still need you.</Text>
            </View>
            <Switch
              value={away}
              onValueChange={toggleAway}
              disabled={awayBusy}
              trackColor={{ false: '#EDEFF4', true: G.blue }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#EDEFF4"
              accessibilityRole="switch"
              accessibilityLabel="I'm away"
              accessibilityState={{ checked: away, disabled: awayBusy }}
            />
          </GlassCard>
        </ScrollView>
        <FooterBar>
          <PrimaryButton label={saving ? 'Saving…' : 'Save changes'} onPress={save} disabled={!dirty || saving} />
        </FooterBar>
      </GlassKeyboardView>

      <BottomSheet visible={!!picking} onClose={() => setPicking(null)}>
        <Text style={styles.sheetTitle}>{picking === 'close' ? 'Closes at' : 'Opens at'}</Text>
        <Text style={styles.sheetSub}>
          {form.days.length
            ? `For ${form.days.length === 7 ? 'every day' : form.days.map(d => DAY_NAME[d]).join(', ')}.`
            : 'Pick your days too.'}
        </Text>
        <ScrollView style={styles.timeList} contentContainerStyle={styles.timeListInner}>
          {timeOptions.map(t => {
            const on = (picking === 'close' ? form.close : form.open) === t;
            return (
              <Pressable
                key={t}
                onPress={() => pickTime(t)}
                style={({ pressed }) => [styles.timeRow, on && styles.timeRowOn, pressed && shared.pressed]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.timeText, on && styles.timeTextOn]}>{clockLabel(t)}</Text>
                {on ? <Ionicons name="checkmark" size={18} color={G.blue600} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>
    </GlassScreen>
  );
};

/** A verified fact with a lock: it changes only through our team. */
const LockedRow: React.FC<{ label: string; value: string; last?: boolean }> = ({ label, value, last }) => (
  <View
    style={[styles.locked, !last && shared.divider]}
    accessibilityLabel={`${label}: ${value}. Verified, can't edit here`}
  >
    <View style={shared.flex}>
      <Text style={styles.lockedLabel}>{label}</Text>
      <Text style={styles.lockedValue}>{value}</Text>
    </View>
    <Ionicons name="lock-closed-outline" size={17} color={G.muted} />
  </View>
);

/** Looks like an input; opens the list of times. */
const TimeSelect: React.FC<{
  label: string;
  value: string;
  onPress: () => void;
}> = ({ label, value, onPress }) => (
  <View style={styles.timeField}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.select, pressed && shared.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${clockLabel(value)}. Change`}
    >
      <Text style={styles.selectText}>{clockLabel(value)}</Text>
      <Ionicons name="chevron-down" size={16} color={G.slate} />
    </Pressable>
  </View>
);

const styles = StyleSheet.create({
  first: { marginTop: 8 },
  locked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  lockedLabel: { color: G.muted, fontSize: 13, fontFamily: fonts.regular },
  lockedValue: {
    color: G.ink,
    fontSize: 16,
    fontFamily: fonts.medium,
    marginTop: 2,
  },
  lockNote: {
    color: G.muted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.regular,
    marginTop: 8,
  },
  link: {
    color: G.blue600,
    fontFamily: fonts.medium,
    textDecorationLine: 'underline',
  },

  pair: { flexDirection: 'row', gap: 12 },
  plaza: { flex: 1.5 },
  shopNo: { flex: 1 },
  aboutField: { marginBottom: 8 },
  about: { height: 112, paddingTop: 14, paddingBottom: 14, lineHeight: 22 },
  counter: { marginTop: 0 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: {
    color: G.red,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.regular,
    marginTop: 8,
  },
  note: { marginBottom: 12 },

  times: { marginTop: 16 },
  timeField: { flex: 1, gap: 8 },
  fieldLabel: { color: G.slate, fontSize: 14, fontFamily: fonts.medium },
  select: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectText: {
    color: G.ink,
    fontSize: 16,
    fontFamily: fonts.regular,
    fontVariant: ['tabular-nums'],
  },

  awayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
  },
  awayTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  awaySub: {
    color: G.muted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.regular,
    marginTop: 2,
  },

  sheetTitle: {
    color: G.ink,
    fontSize: 19,
    letterSpacing: -0.2,
    fontFamily: fonts.medium,
  },
  sheetSub: {
    color: G.muted,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.regular,
    marginTop: 4,
    marginBottom: 12,
  },
  timeList: { maxHeight: 360 },
  timeListInner: { paddingBottom: 8 },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  timeRowOn: { backgroundColor: '#F1F5FF' },
  timeText: {
    color: G.ink,
    fontSize: 16,
    fontFamily: fonts.regular,
    fontVariant: ['tabular-nums'],
  },
  timeTextOn: { color: G.blue600, fontFamily: fonts.medium },
});
