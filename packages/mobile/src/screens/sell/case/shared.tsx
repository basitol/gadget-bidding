import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Image, ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { G, GlassScreen, GlassHeader, GlassCard, GadgetImage } from '../../../components/glass';
import { fonts } from '../../../constants';
import { caseService, Case, clipLength } from '../../../services/case.service';
import { useToastStore } from '../../../store/toastStore';
import { formatCurrency, mediaUrl } from '../../../utils';
import { ICONS, TINT, whenLabel } from '../onboarding/kit';

/** Pieces shared by the seller's case screens (Case D-115, Your reply, Reply sent, Case closed). */

export const toast = (m: string, t: 'success' | 'error' = 'error') => useToastStore.getState().show(m, t);
export const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export const CASE_ICONS = {
  shield: ICONS.shield,
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  box: require('../../../../assets/icons/box.png') as ImageSourcePropType,
};

/* ---------- dates ---------- */

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** "Today" / "Yesterday" / "Nov 24" */
export const dayLabel = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return 'Today';
  if (sameDay(d, new Date(now.getTime() - 86_400_000))) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/** "Just now" for the last couple of minutes, else "Today, 2:41 pm" / "Nov 24, 9:05 am". */
export const sinceLabel = (iso: string) => (Date.now() - new Date(iso).getTime() < 2 * 60_000 ? 'Just now' : whenLabel(iso));

/** "6:00 pm" */
export const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();

/** "today 6:00 pm" / "tomorrow 6:00 pm" / "Mon 6:00 pm" */
export const soonLabel = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const day = sameDay(d, now)
    ? 'today'
    : sameDay(d, new Date(now.getTime() + 86_400_000))
      ? 'tomorrow'
      : d.toLocaleDateString('en-US', { weekday: 'short' });
  return `${day} ${timeLabel(iso)}`;
};

/** "1d 22h 54m", "3h 05m", "12m 09s" */
export const countdown = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
};

/* ---------- words ---------- */

/** "phone", "laptop"… for sentences; falls back to "item". */
export const thingOf = (c: Case) => {
  const t = (c.order.gadget?.title ?? '').toLowerCase();
  if (/iphone|pixel|galaxy s|phone|redmi|tecno|infinix/.test(t)) return 'phone';
  if (/macbook|laptop|thinkpad|xps|zenbook/.test(t)) return 'laptop';
  if (/ipad|tablet|tab /.test(t)) return 'tablet';
  if (/airpods|headphone|wh-1000|buds|earbuds/.test(t)) return 'headphones';
  if (/watch/.test(t)) return 'watch';
  if (/playstation|ps5|xbox|switch|console/.test(t)) return 'console';
  return 'item';
};

/** "didn't match the listing", "had a fault"… from what the buyer reported. */
export const problemPhrase = (type: string) =>
  ({
    item_not_as_described: "didn't match the listing",
    not_working: "didn't work properly",
    missing_parts: 'was missing parts',
    wrong_item: 'was the wrong item',
    item_damaged: 'arrived damaged',
    item_not_received: "didn't arrive",
  })[type] ?? 'had a problem';

export const goHome = (navigation: any) => navigation.navigate('MainTabs', { screen: 'Home' });

/* ---------- data ---------- */

export const useSellerCase = (disputeId: string) => {
  const [c, setC] = useState<Case | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setC(await caseService.get(disputeId));
      setError(null);
    } catch (e) {
      setError(errText(e, "We couldn't load this case. Pull to try again."));
    }
  }, [disputeId]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  return { c, setC, load, error };
};

export const CaseLoading: React.FC<{ title: string; onBack?: () => void; error?: string | null; onRetry?: () => void }> = ({
  title,
  onBack,
  error,
  onRetry,
}) => (
  <GlassScreen>
    <GlassHeader title={title} onBack={onBack} />
    <View style={s.center}>
      {error ? (
        <>
          <Text style={s.centerText}>{error}</Text>
          {onRetry ? (
            <Pressable onPress={onRetry} style={s.retry} accessibilityRole="button" hitSlop={6}>
              <Text style={s.link}>Try again</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <ActivityIndicator color={G.blue} />
      )}
    </View>
  </GlassScreen>
);

export const openFile = (url: string) =>
  WebBrowser.openBrowserAsync(mediaUrl(url)).catch(() => toast("We couldn't open that file. Try again."));

/* ---------- pieces ---------- */

/** Thumbnail, title, "Order X · sold for ₦Y", and the case line. */
export const ItemCard: React.FC<{ c: Case; opened?: boolean; style?: StyleProp<ViewStyle> }> = ({ c, opened = true, style }) => (
  <GlassCard style={[s.item, style]}>
    <GadgetImage uri={c.order.gadget?.images?.[0]} size={44} style={s.itemThumb} />
    <View style={s.flex}>
      <Text style={s.itemTitle} numberOfLines={1}>
        {c.order.gadget?.title ?? 'Your item'}
      </Text>
      <Text style={s.itemSub}>
        Order {c.order.order_number} · sold for {formatCurrency(c.order.item_amount)}
      </Text>
      <Text style={s.itemCase}>
        Case {c.case_number}
        {opened ? ` · opened ${dayLabel(c.created_at).replace(/^(Today|Yesterday)$/, m => m.toLowerCase())}` : ''}
      </Text>
    </View>
  </GlassCard>
);

/** Key on the left, value on the right. */
export const Row: React.FC<{ k: string; v: React.ReactNode; last?: boolean; onPress?: () => void; vColor?: string }> = ({
  k,
  v,
  last,
  onPress,
  vColor,
}) => {
  const body = (
    <View style={[s.row, !last && s.divider]}>
      <Text style={s.rowKey}>{k}</Text>
      <Text style={[s.rowVal, vColor ? { color: vColor } : null]}>{v}</Text>
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${k}: ${typeof v === 'string' ? v : ''}`}>
      {body}
    </Pressable>
  ) : (
    body
  );
};

/** A radio card: title, line under it, optional right side (a price). */
export const RadioCard: React.FC<{
  on: boolean;
  title: string;
  sub: string;
  right?: string;
  onPress: () => void;
  disabled?: boolean;
}> = ({ on, title, sub, right, onPress, disabled }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [s.option, on && s.optionOn, disabled && s.optionOff, pressed && !on && s.pressed]}
    accessibilityRole="radio"
    accessibilityState={{ selected: on, disabled }}
    accessibilityLabel={`${title}. ${sub}${right ? `. ${right}` : ''}`}
  >
    <View style={[s.radio, on && s.radioOn]}>{on ? <View style={s.radioDot} /> : null}</View>
    <View style={s.flex}>
      <Text style={s.optionTitle}>{title}</Text>
      <Text style={s.optionSub}>{sub}</Text>
    </View>
    {right ? <Text style={s.optionRight}>{right}</Text> : null}
  </Pressable>
);

/** Small tinted status chip ("Not as described"). */
export const StatusChip: React.FC<{ label: string; tone: 'red' | 'blue' | 'green' | 'amber' }> = ({ label, tone }) => (
  <View style={[s.chip, { backgroundColor: TINT[tone].bg }]}>
    <Text style={[s.chipText, { color: TINT[tone].text }]}>{label}</Text>
  </View>
);

/** One evidence tile: icon and a short label; tapping opens the file. */
export const EvidenceTile: React.FC<{ icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }> = ({
  icon,
  label,
  onPress,
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [s.tile, pressed && s.pressed]}
    accessibilityRole="button"
    accessibilityLabel={`Open ${label}`}
  >
    <Ionicons name={icon} size={18} color={G.slate} />
    <Text style={s.tileText} numberOfLines={1}>
      {label}
    </Text>
  </Pressable>
);

/** The buyer's photos and video as tiles. */
export const BuyerEvidence: React.FC<{ c: Case }> = ({ c }) => {
  const tiles = [
    ...c.photos.map((url, i) => ({ url, icon: 'image-outline' as const, label: c.photos.length > 1 ? `Photo ${i + 1}` : 'Photo' })),
    ...c.videos.map((url, i) => {
      const sec = c.video_lengths?.[i];
      return { url, icon: 'videocam-outline' as const, label: sec ? `Video · ${clipLength(sec)}` : 'Video' };
    }),
  ];
  if (!tiles.length) return null;
  return (
    <View style={s.tiles}>
      {tiles.map(t => (
        <EvidenceTile key={t.url} icon={t.icon} label={t.label} onPress={() => openFile(t.url)} />
      ))}
    </View>
  );
};

/** "What the buyer says": problem chip, their words, their photos and video. */
export const BuyerSaysCard: React.FC<{ c: Case; style?: StyleProp<ViewStyle> }> = ({ c, style }) => (
  <GlassCard style={[s.card, style]}>
    <View style={s.cardHead}>
      <Text style={s.cardTitle}>What the buyer says</Text>
      <StatusChip label={c.problem.label} tone="red" />
    </View>
    <Text style={s.quote}>“{c.problem.description}”</Text>
    <BuyerEvidence c={c} />
    <Text style={s.caption}>Buyer names are private. You'll only see "the buyer".</Text>
  </GlassCard>
);

/** "What our hub found" rows. Nothing when our team hasn't added any. */
export const HubFoundCard: React.FC<{ c: Case; style?: StyleProp<ViewStyle> }> = ({ c, style }) => {
  const rows = c.hub_findings ?? [];
  if (!rows.length) return null;
  return (
    <GlassCard style={[s.card, style]}>
      <Text style={s.cardTitle}>What our hub found</Text>
      <View style={s.inner}>
        {rows.map((r, i) => (
          <Row key={`${r.label}-${i}`} k={r.label} v={r.value} last={i === rows.length - 1} />
        ))}
      </View>
    </GlassCard>
  );
};

/** "The ₦580,500 payout for this order is on hold until the case is closed." */
export const PayoutHeldNote: React.FC<{ c: Case; style?: StyleProp<ViewStyle> }> = ({ c, style }) => {
  const p = c.seller?.payout;
  if (!p || p.status === 'paid' || p.status === 'sending') return null;
  return (
    <GlassCard style={[s.held, style]}>
      <Image source={CASE_ICONS.shield} style={s.heldIcon} />
      <Text style={s.heldText}>
        The {formatCurrency(p.amount)} payout for this order is on hold until the case is closed.
      </Text>
    </GlassCard>
  );
};

/** Blue-tint tip. */
export const TipNote: React.FC<{ children: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({ children, style }) => (
  <View style={[s.tip, style]}>
    <Text style={s.tipText}>{children}</Text>
  </View>
);

export const cs = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 32 },
  gap: { marginTop: 14 },
  section: { marginTop: 24, marginBottom: 10 },
  caption: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
  centerCaption: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, textAlign: 'center', marginTop: 16 },
  link: { color: G.blue600, fontSize: 14, fontFamily: fonts.medium, textAlign: 'center' },
  linkWrap: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  card: { padding: 16, gap: 10 },
  cardTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  body: { color: G.slate, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  rows: { overflow: 'hidden' },
});

const s = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  centerText: { color: G.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, textAlign: 'center' },
  retry: { minHeight: 44, justifyContent: 'center', marginTop: 8 },
  link: { color: G.blue600, fontSize: 14, fontFamily: fonts.medium },

  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  itemThumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#FFFFFF' },
  itemTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  itemSub: { color: G.slate, fontSize: 13, fontFamily: fonts.regular, marginTop: 3, fontVariant: ['tabular-nums'] },
  itemCase: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, marginTop: 3 },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  divider: { borderBottomWidth: 1, borderBottomColor: 'rgba(28,31,42,0.06)' },
  rowKey: { color: G.muted, fontSize: 14, fontFamily: fonts.regular },
  rowVal: { color: G.ink, fontSize: 14, fontFamily: fonts.medium, flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.75)',
    backgroundColor: 'rgba(255,255,255,0.56)',
  },
  optionOn: { borderColor: '#AFC0F6', backgroundColor: 'rgba(241,245,255,0.9)' },
  optionOff: { opacity: 0.6 },
  optionTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  optionSub: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, marginTop: 2 },
  optionRight: { color: G.ink, fontSize: 15, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#CED3DF', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: G.blue, backgroundColor: G.blue },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },

  chip: { height: 26, paddingHorizontal: 10, borderRadius: 8, justifyContent: 'center' },
  chipText: { fontSize: 12, fontFamily: fonts.medium },

  card: { padding: 16, gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  quote: { color: G.slate, fontSize: 14, lineHeight: 21, fontFamily: fonts.regular },
  caption: { color: G.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.regular },
  inner: { backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 14, overflow: 'hidden' },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    flexBasis: '31%',
    flexGrow: 1,
    maxWidth: '33%',
    height: 76,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
  },
  tileText: { color: G.slate, fontSize: 12, fontFamily: fonts.regular },

  held: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  heldIcon: { width: 30, height: 30, resizeMode: 'contain' },
  heldText: { flex: 1, color: G.ink, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },

  tip: { padding: 14, borderRadius: 14, backgroundColor: TINT.blue.bg },
  tipText: { color: G.ink, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular },
});
