import React, { useCallback, useMemo, useState } from 'react';
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
  Chip,
  PrimaryButton,
  SecondaryButton,
  FooterBar,
} from '../../components/glass';
import { BottomSheet } from '../../components/motion';
import { fonts } from '../../constants';
import { addressService } from '../../services';
import { useAuthStore } from '../../store';
import { useToastStore } from '../../store/toastStore';
import { realPhone } from '../../utils';
import type { UserAddress } from '../../types';

const toast = (msg: string, type: 'success' | 'error' = 'success') => useToastStore.getState().show(msg, type);
const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export const HUB_PICKUP = '2nd floor, 14 Ola-Ayeni Street, Computer Village, Ikeja';

/** Where riders go in Lagos. Saved as the address's city; the state is always Lagos. */
const LAGOS_AREAS = [
  'Agege', 'Ajah', 'Alimosho', 'Amuwo Odofin', 'Anthony', 'Apapa', 'Badagry', 'Ebute Metta', 'Egbeda', 'Epe',
  'Festac', 'Gbagada', 'Ikeja', 'Ikeja GRA', 'Ikorodu', 'Ikotun', 'Ikoyi', 'Ilupeju', 'Ipaja', 'Isolo', 'Ketu',
  'Lagos Island', 'Lekki', 'Lekki Phase 1', 'Magodo', 'Maryland', 'Mushin', 'Ogba', 'Ogudu', 'Ojo', 'Ojodu', 'Ojota',
  'Opebi', 'Oshodi', 'Sangotedo', 'Surulere', 'Victoria Island', 'Yaba',
];
const LABELS = ['Home', 'Work', 'Other'] as const;

/** +2348030004521 → "0803 ••• 4521" */
const maskPhone = (p?: string) => {
  const d = (p ?? '').replace(/\D/g, '');
  if (d.length < 8) return p ?? '';
  const local = d.startsWith('234') ? `0${d.slice(3)}` : d;
  return `${local.slice(0, 4)} ••• ${local.slice(-4)}`;
};

/** "08030004521" from anything the person typed or we stored (+234…). */
const localPhone = (p?: string | null) => {
  const d = (p ?? '').replace(/\D/g, '');
  if (d.startsWith('234')) return `0${d.slice(3)}`;
  if (d.length === 10) return `0${d}`;
  return d;
};
const phoneOk = (p: string) => /^0[789][01]\d{8}$/.test(localPhone(p));

const addressLine = (a: UserAddress) => [a.address_line1, a.city, a.state].filter(Boolean).join(', ');

/* ================= Delivery addresses ================= */

export const DeliveryAddressesScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [list, setList] = useState<UserAddress[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await addressService.listAddresses();
      setList(r.data ?? []);
    } catch (e) {
      setList(l => l ?? []);
      toast(errText(e, "We couldn't load your addresses. Try again in a moment."), 'error');
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const add = () => navigation.navigate('AddressForm', { first: !list?.length });

  const makeDefault = async (a: UserAddress) => {
    setBusy(a.id);
    try {
      await addressService.setDefaultAddress(a.id);
      await load();
      toast(`${a.label} is now your default address.`);
    } catch (e) {
      toast(errText(e, "We couldn't change your default. Try again."), 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = (a: UserAddress) =>
    Alert.alert(`Delete ${a.label}?`, "It's removed from your saved addresses. Orders already on the way keep their address.", [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(a.id);
          try {
            await addressService.deleteAddress(a.id);
            await load();
            toast('Address deleted.');
          } catch (e) {
            toast(errText(e, "We couldn't delete that address. Try again."), 'error');
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  const intro = (
    <>
      <Text style={styles.title}>Delivery addresses</Text>
      <Text style={styles.lead}>We deliver anywhere in Lagos in 1–2 days after the hub check.</Text>
    </>
  );

  if (list && !list.length) {
    return (
      <GlassScreen>
        <GlassHeader title="Delivery addresses" onBack={() => navigation.goBack()} />
        <ScrollView contentContainerStyle={styles.content}>
          {intro}
          <View style={styles.empty}>
            <View style={styles.emptyTile}>
              <Image source={require('../../../assets/icons/truck.png')} style={styles.emptyIcon} accessibilityIgnoresInvertColors />
            </View>
            <Text style={styles.emptyTitle}>No saved addresses yet</Text>
            <Text style={styles.emptyText}>Add one now so checkout takes seconds when you win an auction.</Text>
          </View>
        </ScrollView>
        <FooterBar>
          <PrimaryButton label="Add an address" onPress={add} />
          <SecondaryButton
            label="I'll pick up at the hub"
            onPress={() => {
              toast(`No problem. Choose "Pick up at the hub" at checkout. It's free.`);
              navigation.goBack();
            }}
            style={styles.footerSecond}
          />
        </FooterBar>
      </GlassScreen>
    );
  }

  return (
    <GlassScreen>
      <GlassHeader title="Delivery addresses" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        {intro}
        {list === null ? (
          <ActivityIndicator color={G.blue} style={styles.loader} />
        ) : (
          <View style={styles.list}>
            {list.map(a => (
              <GlassCard key={a.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle}>{a.label}</Text>
                  {a.is_default ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>Default</Text>
                    </View>
                  ) : null}
                  <View style={styles.flex} />
                  <Pressable
                    onPress={() => navigation.navigate('AddressForm', { address: a })}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${a.label}`}
                  >
                    <Text style={styles.link}>Edit</Text>
                  </Pressable>
                </View>
                <Text style={styles.cardLine}>{addressLine(a)}</Text>
                <Text style={styles.cardMeta}>{[a.address_line2, maskPhone(a.phone_number)].filter(Boolean).join(' · ')}</Text>
                <View style={[styles.cardActions, !a.is_default && styles.cardActionsRule]}>
                  {a.is_default ? null : (
                    <SmallButton label="Set as default" onPress={() => makeDefault(a)} disabled={busy === a.id} />
                  )}
                  <SmallButton label="Delete" danger onPress={() => remove(a)} disabled={busy === a.id} />
                </View>
              </GlassCard>
            ))}
            <Pressable onPress={add} style={({ pressed }) => [styles.addRow, pressed && styles.pressed]} accessibilityRole="button">
              <Text style={styles.addText}>+ Add an address</Text>
            </Pressable>
            <View style={styles.hubNote}>
              <Text style={styles.hubNoteText}>Outside Lagos? You can pick up at our hub instead: {HUB_PICKUP}.</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </GlassScreen>
  );
};

const SmallButton: React.FC<{ label: string; onPress: () => void; danger?: boolean; disabled?: boolean }> = ({
  label,
  onPress,
  danger,
  disabled,
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    hitSlop={6}
    style={({ pressed }) => [styles.small, danger && styles.smallDanger, (pressed || disabled) && styles.pressed]}
    accessibilityRole="button"
    accessibilityState={{ disabled }}
  >
    <Text style={[styles.smallText, danger && styles.smallTextDanger]}>{label}</Text>
  </Pressable>
);

/* ================= Add / edit address ================= */

type FormParams = { address?: UserAddress; first?: boolean };

export const AddressFormScreen: React.FC<{ navigation: any; route: { params?: FormParams } }> = ({ navigation, route }) => {
  const { user } = useAuthStore();
  const editing = route.params?.address;
  const wasDefault = Boolean(editing?.is_default);

  const startLabel = editing && (LABELS as readonly string[]).includes(editing.label) ? editing.label : editing ? 'Other' : 'Home';
  const [label, setLabel] = useState<string>(startLabel);
  const [name, setName] = useState(editing?.full_name ?? user?.full_name ?? '');
  const [phone, setPhone] = useState(localPhone(editing?.phone_number ?? realPhone(user)));
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [street, setStreet] = useState(editing?.address_line1 ?? '');
  const [area, setArea] = useState(editing?.city ?? 'Ikeja');
  const [landmark, setLandmark] = useState(editing?.address_line2 ?? '');
  const [note, setNote] = useState(editing?.delivery_note ?? '');
  const [isDefault, setIsDefault] = useState(wasDefault || Boolean(route.params?.first));
  const [areaSheet, setAreaSheet] = useState(false);
  const [saving, setSaving] = useState(false);

  const areas = useMemo(() => (area && !LAGOS_AREAS.includes(area) ? [area, ...LAGOS_AREAS] : LAGOS_AREAS), [area]);
  const phoneErr = phoneTouched && phone && !phoneOk(phone) ? 'Check the number. It should look like 0803 000 0000.' : null;
  const ready = name.trim().length >= 2 && phoneOk(phone) && street.trim().length >= 5 && !!area && landmark.trim().length >= 3;

  const save = async () => {
    if (!ready || saving) return;
    setSaving(true);
    try {
      const data = {
        label: editing && label === 'Other' && !(LABELS as readonly string[]).includes(editing.label) ? editing.label : label,
        full_name: name.trim(),
        phone_number: localPhone(phone),
        address_line1: street.trim(),
        address_line2: landmark.trim(),
        city: area,
        state: 'Lagos',
        country: 'Nigeria',
        delivery_note: note.trim() || undefined,
        is_default: isDefault,
      };
      if (editing) await addressService.updateAddress(editing.id, data);
      else await addressService.createAddress(data);
      toast(editing ? 'Address updated.' : 'Address saved.');
      navigation.goBack();
    } catch (e) {
      toast(errText(e, "We couldn't save that address. Check it and try again."), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassScreen>
      <GlassHeader title={editing ? 'Edit address' : 'Add address'} onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Where should we deliver?</Text>
          <Text style={styles.lead}>Riders only see this for your delivery.</Text>

          <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Address name">
            {LABELS.map(l => (
              <Chip key={l} label={l} selected={label === l} onPress={() => setLabel(l)} />
            ))}
          </View>

          <Text style={styles.label}>Full name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            style={styles.input}
            accessibilityLabel="Full name"
          />

          <Text style={styles.label}>Phone number</Text>
          <TextInput
            value={phone}
            onChangeText={t => setPhone(t.replace(/[^\d+ ]/g, ''))}
            onBlur={() => setPhoneTouched(true)}
            placeholder="0803 000 0000"
            placeholderTextColor={G.faint}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            style={[styles.input, phoneErr && styles.inputError]}
            accessibilityLabel="Phone number"
          />
          {phoneErr ? <Text style={styles.errorText}>{phoneErr}</Text> : null}

          <Text style={styles.label}>House number and street</Text>
          <TextInput
            value={street}
            onChangeText={setStreet}
            placeholder="e.g. 12 Oduduwa Crescent"
            placeholderTextColor={G.faint}
            autoCapitalize="words"
            textContentType="fullStreetAddress"
            style={styles.input}
            accessibilityLabel="House number and street"
          />

          <Text style={styles.label}>Area</Text>
          <Pressable
            onPress={() => setAreaSheet(true)}
            style={({ pressed }) => [styles.input, styles.select, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Area, ${area}`}
            accessibilityHint="Opens the list of Lagos areas"
          >
            <Text style={styles.selectText}>{area}</Text>
            <Ionicons name="chevron-down" size={16} color={G.slate} />
          </Pressable>

          <Text style={styles.label}>Nearest landmark</Text>
          <TextInput
            value={landmark}
            onChangeText={setLandmark}
            placeholder="e.g. Opposite Ikeja City Mall"
            placeholderTextColor={G.faint}
            style={styles.input}
            accessibilityLabel="Nearest landmark"
          />

          <Text style={styles.label}>
            Note for the rider <Text style={styles.optional}>(optional)</Text>
          </Text>
          <TextInput
            value={note}
            onChangeText={t => setNote(t.slice(0, 200))}
            placeholder="e.g. Call when you get to the gate"
            placeholderTextColor={G.faint}
            style={styles.input}
            accessibilityLabel="Note for the rider, optional"
          />

          <GlassCard style={styles.toggleCard}>
            <View style={styles.flex}>
              <Text style={styles.toggleTitle}>Use as my default</Text>
              <Text style={styles.toggleSub}>{wasDefault ? 'This is your default. Set another one as default to change it.' : 'Picked first at checkout'}</Text>
            </View>
            <Switch
              value={isDefault}
              onValueChange={setIsDefault}
              disabled={wasDefault}
              trackColor={{ false: '#E4E7EE', true: G.blue }}
              ios_backgroundColor="#E4E7EE"
              accessibilityLabel="Use as my default"
            />
          </GlassCard>
        </ScrollView>
        <FooterBar>
          <PrimaryButton label={saving ? 'Saving…' : editing ? 'Save changes' : 'Save address'} onPress={save} disabled={!ready || saving} />
        </FooterBar>
      </KeyboardAvoidingView>

      <BottomSheet visible={areaSheet} onClose={() => setAreaSheet(false)}>
        <Text style={styles.sheetTitle}>Area</Text>
        <Text style={styles.sheetSub}>We deliver anywhere in Lagos.</Text>
        <ScrollView style={styles.sheetList}>
          {areas.map(a => (
            <Pressable
              key={a}
              onPress={() => {
                setArea(a);
                setAreaSheet(false);
              }}
              style={({ pressed }) => [styles.areaRow, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityState={{ selected: a === area }}
            >
              <Text style={[styles.areaText, a === area && styles.areaTextOn]}>{a}</Text>
              {a === area ? <Ionicons name="checkmark" size={18} color={G.blue} /> : null}
            </Pressable>
          ))}
        </ScrollView>
      </BottomSheet>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  loader: { marginVertical: 30 },

  title: { color: G.ink, fontSize: 26, lineHeight: 32, letterSpacing: -0.52, fontFamily: fonts.medium, marginTop: 4 },
  lead: { color: G.muted, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular, marginTop: 6, marginBottom: 20 },

  list: { gap: 12 },
  card: { padding: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  badge: { height: 22, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#F1F5FF', justifyContent: 'center' },
  badgeText: { color: G.blue600, fontSize: 12, fontFamily: fonts.medium },
  link: { color: G.blue600, fontSize: 14, fontFamily: fonts.medium },
  cardLine: { color: G.slate, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  cardMeta: { color: G.muted, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular, marginTop: 6 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  cardActionsRule: { borderTopWidth: 1, borderTopColor: G.line, paddingTop: 12, marginTop: 12 },
  small: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEFF4',
    justifyContent: 'center',
  },
  smallDanger: { borderColor: '#F5C9D1' },
  smallText: { color: G.ink, fontSize: 13, fontFamily: fonts.medium },
  smallTextDanger: { color: '#D9536A' },

  addRow: {
    height: 52,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { color: G.blue600, fontSize: 15, fontFamily: fonts.medium },
  hubNote: { padding: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.55)' },
  hubNoteText: { color: G.slate, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular },

  empty: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 12 },
  emptyTile: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyIcon: { width: 60, height: 60, resizeMode: 'contain' },
  emptyTitle: { color: G.ink, fontSize: 20, lineHeight: 26, fontFamily: fonts.medium, textAlign: 'center' },
  emptyText: { color: G.slate, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, textAlign: 'center', marginTop: 8 },
  footerSecond: { marginTop: 10 },

  chips: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  label: { color: G.slate, fontSize: 14, fontFamily: fonts.medium, marginTop: 16, marginBottom: 8 },
  optional: { color: G.muted, fontFamily: fonts.regular },
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
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { color: G.ink, fontSize: 16, fontFamily: fonts.regular },

  toggleCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, marginTop: 20 },
  toggleTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  toggleSub: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, marginTop: 2 },

  sheetTitle: { color: G.ink, fontSize: 19, fontFamily: fonts.medium },
  sheetSub: { color: G.muted, fontSize: 14, fontFamily: fonts.regular, marginTop: 4, marginBottom: 8 },
  sheetList: { maxHeight: 420 },
  areaRow: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: G.line,
  },
  areaText: { color: G.ink, fontSize: 16, fontFamily: fonts.regular },
  areaTextOn: { color: G.blue600, fontFamily: fonts.medium },
});
