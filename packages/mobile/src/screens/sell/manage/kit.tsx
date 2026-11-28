import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActionSheetIOS, Alert, Platform, StyleProp, ViewStyle } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { G, GlassCard, GadgetImage } from '../../../components/glass';
import { fonts } from '../../../constants';
import { useToastStore } from '../../../store/toastStore';
import { formatCurrency } from '../../../utils';
import { listingManageService, ManageView } from '../../../services/listingManage.service';
import { listingService, pickListingPhoto, takeListingPhoto } from '../../../services/listing.service';
import { TINT } from '../onboarding/kit';

/** Pieces shared by Manage listing, Edit listing, End listing, End early and Relist. */

export const toast = (m: string, t: 'success' | 'error' = 'error') => useToastStore.getState().show(m, t);
export const errText = (e: unknown, fallback = "That didn't work. Try again.") =>
  e instanceof Error && e.message ? e.message : fallback;

/** "Nov 25" */
export const shortDay = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

/** "Sun, 9:00 pm" */
export const weekdayTime = (d: Date) =>
  `${d.toLocaleDateString('en-US', { weekday: 'short' })}, ${d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()}`;

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Loads the manage view and reloads it every time the screen comes back into view. */
export const useManageView = (auctionId: string) => {
  const [view, setView] = useState<ManageView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setView(await listingManageService.view(auctionId));
      setError(null);
    } catch (e) {
      setError(errText(e, "We couldn't load this listing. Try again."));
    }
  }, [auctionId]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  return { view, setView, error, reload: load };
};

/** Thumbnail, title and up to two lines under it. */
export const ItemCard: React.FC<{
  image: string | null;
  title: string;
  lines: string[];
  style?: StyleProp<ViewStyle>;
}> = ({ image, title, lines, style }) => (
  <GlassCard style={[k.item, style]}>
    <GadgetImage uri={image} size={44} style={k.itemThumb} />
    <View style={k.flex}>
      <Text style={k.itemTitle} numberOfLines={1}>
        {title}
      </Text>
      {lines.filter(Boolean).map((l, i) => (
        <Text key={i} style={k.itemSub} numberOfLines={2}>
          {l}
        </Text>
      ))}
    </View>
  </GlassCard>
);

/** One of the four numbers on Manage listing. */
export const Stat: React.FC<{ label: string; value: string; urgent?: boolean }> = ({ label, value, urgent }) => (
  <GlassCard style={k.stat}>
    <Text style={k.statLabel}>{label}</Text>
    <Text style={[k.statValue, urgent && { color: G.orangeInk }]} numberOfLines={1} adjustsFontSizeToFit>
      {value}
    </Text>
  </GlassCard>
);

/** A row with an icon tile, title, line under it and a chevron. Disabled rows are greyed out. */
export const ActionRow: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub: string;
  onPress?: () => void;
  tone?: 'blue' | 'red';
  disabled?: boolean;
  last?: boolean;
  right?: React.ReactNode;
}> = ({ icon, title, sub, onPress, tone = 'blue', disabled, last, right }) => {
  const color = disabled ? G.faint : tone === 'red' ? G.red : G.blue600;
  const bg = disabled ? TINT.fill : tone === 'red' ? TINT.red.bg : TINT.blue.bg;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [k.action, !last && k.divider, pressed && k.actionPressed]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={`${title}. ${sub}`}
    >
      <View style={[k.actionIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={k.flex}>
        <Text style={[k.actionTitle, tone === 'red' && !disabled && { color: G.red }, disabled && { color: G.faint }]}>
          {title}
        </Text>
        <Text style={[k.actionSub, disabled && { color: G.faint }]}>{sub}</Text>
      </View>
      {right ?? (disabled ? null : <Ionicons name="chevron-forward" size={18} color={G.faint} />)}
    </Pressable>
  );
};

/** Key on the left, value on the right ("Platform fee (5%)  −₦43,250"). */
export const MoneyRow: React.FC<{ k: string; v: string; strong?: boolean; last?: boolean }> = ({
  k: key,
  v,
  strong,
  last,
}) => (
  <View style={[k.moneyRow, !last && k.divider]}>
    <Text style={k.moneyKey}>{key}</Text>
    <Text style={[k.moneyVal, strong && k.moneyStrong]}>{v}</Text>
  </View>
);

/** A one-line radio card (End listing's reasons). Same look as the case screens' RadioCard. */
export const RadioRow: React.FC<{ on: boolean; label: string; onPress: () => void }> = ({ on, label, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [k.radioRow, on && k.radioRowOn, pressed && !on && k.pressed]}
    accessibilityRole="radio"
    accessibilityState={{ selected: on }}
    accessibilityLabel={label}
  >
    <View style={[k.radio, on && k.radioOn]}>{on ? <View style={k.radioDot} /> : null}</View>
    <Text style={k.radioLabel}>{label}</Text>
  </Pressable>
);

/** Small chip on the photo: "● LIVE", "SCHEDULED", "ENDED". */
export const StatusPill: React.FC<{ status: ManageView['status']; sold?: boolean }> = ({ status, sold }) => {
  const live = status === 'active';
  const label = sold
    ? 'SOLD'
    : live
      ? 'LIVE'
      : status === 'scheduled'
        ? 'SCHEDULED'
        : status === 'paused'
          ? 'PAUSED'
          : 'ENDED';
  return (
    <View style={k.pill}>
      {live ? <View style={k.pillDot} /> : null}
      <Text style={k.pillText}>{label}</Text>
    </View>
  );
};

export const naira = (n: number) => formatCurrency(n);

/**
 * Take or pick a photo, upload it and send it to our team for this listing. Returns the new view,
 * or null when the seller backed out.
 */
export const addListingPhoto = (auctionId: string): Promise<ManageView | null> =>
  new Promise(resolve => {
    const run = async (take: boolean) => {
      try {
        const photo = take ? await takeListingPhoto() : await pickListingPhoto();
        if (!photo) return resolve(null);
        const url = await listingService.uploadPhoto(photo);
        resolve(await listingManageService.addPhotos(auctionId, [url]));
      } catch (e) {
        toast(errText(e, "That photo didn't upload. Try again."));
        resolve(null);
      }
    };
    const options = ['Take a photo', 'Choose from library', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 2 }, i =>
        i === 2 ? resolve(null) : run(i === 0)
      );
    } else {
      Alert.alert('Add a photo', undefined, [
        { text: options[0], onPress: () => run(true) },
        { text: options[1], onPress: () => run(false) },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ]);
    }
  });

/** Where the seller lands after ending or relisting. */
export const goToListings = (navigation: any, tab: 'live' | 'unsold') =>
  navigation.navigate('MainTabs', { screen: 'Listings', params: { tab } });

export const k = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 32 },
  pressed: { opacity: 0.75 },
  divider: { borderBottomWidth: 1, borderBottomColor: 'rgba(28,31,42,0.06)' },

  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  itemThumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#FFFFFF' },
  itemTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  itemSub: {
    color: G.muted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.regular,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },

  h1: { color: G.ink, fontSize: 24, lineHeight: 30, letterSpacing: -0.4, fontFamily: fonts.medium, marginTop: 24 },
  lead: { color: G.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, marginTop: 6 },
  label: { color: G.slate, fontSize: 14, fontFamily: fonts.medium, marginTop: 22, marginBottom: 10 },
  caption: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, marginTop: 8 },
  options: { gap: 10 },

  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  stat: { flexBasis: '47%', flexGrow: 1, paddingHorizontal: 14, paddingVertical: 12 },
  statLabel: { color: G.muted, fontSize: 12, fontFamily: fonts.regular },
  statValue: { color: G.ink, fontSize: 20, fontFamily: fonts.medium, marginTop: 4, fontVariant: ['tabular-nums'] },

  card: { overflow: 'hidden' },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 64,
  },
  actionPressed: { backgroundColor: 'rgba(255,255,255,0.5)' },
  actionIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  actionSub: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, marginTop: 2 },

  moneyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  moneyKey: { color: G.muted, fontSize: 14, fontFamily: fonts.regular },
  moneyVal: { color: G.ink, fontSize: 14, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  moneyStrong: { fontSize: 15 },

  pill: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  pillDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: G.green },
  pillText: { color: G.ink, fontSize: 11, letterSpacing: 0.4, fontFamily: fonts.medium },

  input: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: G.ink,
  },
  danger: { backgroundColor: G.red },

  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.75)',
    backgroundColor: 'rgba(255,255,255,0.56)',
  },
  radioRowOn: { borderColor: '#AFC0F6', backgroundColor: 'rgba(241,245,255,0.9)' },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#CED3DF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: G.blue, backgroundColor: G.blue },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  radioLabel: { flex: 1, color: G.ink, fontSize: 15, fontFamily: fonts.medium },
});
