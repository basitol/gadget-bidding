import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { G, GlassCard, GadgetImage } from '../../../components/glass';
import { fonts } from '../../../constants';
import { useReloadOnReconnect } from '../../../store/networkStore';
import { useToastStore } from '../../../store/toastStore';
import { HubView, sellerHubService } from '../../../services/sellerHub.service';
import { TINT } from '../onboarding/kit';
import { encodeQr } from './qr';

/** Pieces shared by the hub screens (Sold, Send to hub, Book a rider, codes, inspection). */

export const HUB_ICONS = {
  tag: require('../../../../assets/icons/tag.png') as ImageSourcePropType,
  shield: require('../../../../assets/icons/shield.png') as ImageSourcePropType,
  box: require('../../../../assets/icons/box.png') as ImageSourcePropType,
  store: require('../../../../assets/icons/store.png') as ImageSourcePropType,
};

export const toast = (m: string, t: 'success' | 'error' = 'error') => useToastStore.getState().show(m, t);
export const errText = (e: unknown, fallback = "That didn't work. Try again.") => (e instanceof Error && e.message ? e.message : fallback);
export const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

/** "7h 28m", "6d 23h", "28m". */
export const leftLabel = (iso: string, now: number) => {
  const ms = Math.max(0, new Date(iso).getTime() - now);
  const mins = Math.floor(ms / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
/** "today", "tomorrow", "Mon" */
export const dayWord = (iso: string, now = Date.now()) => {
  const d = new Date(iso);
  return sameDay(d, new Date(now))
    ? 'today'
    : sameDay(d, new Date(now + 86_400_000))
      ? 'tomorrow'
      : d.toLocaleDateString('en-US', { weekday: 'short' });
};
/** "6:00 pm today", "6:00 pm tomorrow", "6:00 pm Mon" */
export const byLabel = (iso: string, now = Date.now()) =>
  `${new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()} ${dayWord(iso, now)}`;
/** "Mon 30 Nov" */
export const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/** The item's short name for sentences: "Galaxy S23" from "Galaxy S23 · 256 GB". */
export const shortTitle = (title: string) => title.split(' · ')[0] || title;

/** Loads the hub view for an order; reloads when the screen comes back into view or the connection does. */
export const useHubView = (orderId: string) => {
  const [view, setView] = useState<HubView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!orderId) return setError("We couldn't find this order.");
    try {
      setView(await sellerHubService.view(orderId));
      setError(null);
    } catch (e) {
      setError(errText(e, "We couldn't load this order."));
    }
  }, [orderId]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useReloadOnReconnect(load);
  return { view, setView, error, load };
};

/** The item: photo, name and one line under it. */
export const ItemRow: React.FC<{ title: string; image: string | null; sub: string; style?: StyleProp<ViewStyle> }> = ({ title, image, sub, style }) => (
  <GlassCard style={[hs.card, hs.itemRow, style]}>
    <GadgetImage uri={image} size={56} style={hs.thumb} />
    <View style={hs.flex}>
      <Text style={hs.itemTitle} numberOfLines={2}>
        {title}
      </Text>
      <Text style={hs.sub}>{sub}</Text>
    </View>
  </GlassCard>
);

/** Key on the left, value on the right, a hairline between rows. */
export const KeyRow: React.FC<{ k: string; v: string; last?: boolean; strong?: boolean; vColor?: string }> = ({ k, v, last, strong, vColor }) => (
  <View style={[hs.keyRow, !last && hs.line]}>
    <Text style={hs.key}>{k}</Text>
    <Text style={[strong ? hs.valueStrong : hs.value, vColor ? { color: vColor } : null]}>{v}</Text>
  </View>
);

/** Sale price, platform fee and what they'll receive. */
export const MoneyCard: React.FC<{ money: HubView['money']; style?: StyleProp<ViewStyle> }> = ({ money, style }) => (
  <GlassCard style={[hs.rows, style]}>
    <KeyRow k="Sale price" v={naira(money.sale_price)} />
    <KeyRow k={`Platform fee (${money.fee_label})`} v={money.platform_fee > 0 ? `−${naira(money.platform_fee)}` : naira(0)} />
    <KeyRow k="You'll receive" v={naira(money.you_receive)} last strong />
  </GlassCard>
);

/** The hub: pin, name, address and opening hours. */
export const HubCard: React.FC<{ hub: HubView['hub']; style?: StyleProp<ViewStyle> }> = ({ hub, style }) => (
  <GlassCard style={[hs.card, hs.itemRow, style]}>
    <View style={[hs.pinTile, { backgroundColor: TINT.amber.bg }]}>
      <Ionicons name="location-outline" size={20} color={TINT.amber.text} />
    </View>
    <View style={hs.flex}>
      <Text style={hs.itemTitle}>{hub.name}</Text>
      <Text style={hs.sub}>{hub.address}</Text>
      <Text style={hs.sub}>{hub.hours}</Text>
    </View>
  </GlassCard>
);

/** A QR code drawn with Views: each row is runs of dark modules. */
export const QrCode: React.FC<{ value: string; size?: number }> = ({ value, size = 168 }) => {
  const grid = useMemo(() => {
    try {
      return encodeQr(value);
    } catch {
      return null;
    }
  }, [value]);
  if (!grid) return null;
  const quiet = 2;
  const cells = grid.length + quiet * 2;
  const cell = size / cells;
  return (
    <View
      style={[hs.qrTile]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`QR code for ${value.split('').join(' ')}`}
    >
      <View style={{ width: size, height: size, backgroundColor: '#FFFFFF', padding: quiet * cell }}>
        {grid.map((row, y) => {
          const runs: { x: number; w: number }[] = [];
          for (let x = 0; x < row.length; x++) {
            if (!row[x]) continue;
            const start = x;
            while (x + 1 < row.length && row[x + 1]) x++;
            runs.push({ x: start, w: x - start + 1 });
          }
          return (
            <View key={y} style={{ height: cell, flexDirection: 'row' }}>
              {runs.map(r => (
                <View key={r.x} style={{ position: 'absolute', left: r.x * cell, width: r.w * cell + 0.5, height: cell + 0.5, backgroundColor: G.ink }} />
              ))}
            </View>
          );
        })}
      </View>
    </View>
  );
};

export const hs = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 32 },
  pressed: { opacity: 0.75 },
  card: { padding: 16 },
  gap: { marginTop: 12 },
  section: { marginTop: 22, marginBottom: 10 },
  title: { color: G.ink, fontSize: 26, lineHeight: 32, letterSpacing: -0.52, fontFamily: fonts.medium },
  centerTitle: { color: G.ink, fontSize: 26, lineHeight: 32, letterSpacing: -0.52, fontFamily: fonts.medium, textAlign: 'center' },
  lead: { color: G.muted, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular, textAlign: 'center', marginTop: 8 },
  caption: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
  centerCaption: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, textAlign: 'center' },
  question: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 56, height: 56, borderRadius: 12 },
  itemTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  sub: { color: G.slate, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, marginTop: 2, fontVariant: ['tabular-nums'] },
  pinTile: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  rows: { paddingHorizontal: 16 },
  keyRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, paddingVertical: 14 },
  line: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(28,31,42,0.08)' },
  key: { color: G.slate, fontSize: 15, lineHeight: 20, fontFamily: fonts.regular },
  value: { flexShrink: 1, color: G.ink, fontSize: 15, lineHeight: 20, fontFamily: fonts.medium, textAlign: 'right', fontVariant: ['tabular-nums'] },
  valueStrong: { color: G.ink, fontSize: 17, lineHeight: 22, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },

  qrTile: {
    alignSelf: 'center',
    padding: 14,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  bigCode: {
    color: G.ink,
    fontSize: 32,
    letterSpacing: 1.6,
    fontFamily: fonts.medium,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    marginTop: 18,
  },
});
