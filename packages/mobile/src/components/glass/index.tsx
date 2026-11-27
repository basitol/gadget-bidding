import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  ViewStyle,
  StyleProp,
  Platform,
  ImageSourcePropType,
} from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { fonts } from '../../constants';
import { requireOptionalNativeModule } from 'expo';
import { formatCurrency, mediaUrl } from '../../utils';

/**
 * Real backdrop blur needs expo-blur's native view, which only exists in builds made after it
 * was added. Older dev builds fall back to the plain translucent fill instead of crashing.
 */
export const BlurView: React.ComponentType<any> | null = requireOptionalNativeModule('ExpoBlurView')
  ? // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('expo-blur').BlurView
  : null;
/** ≈ blur(22px). expo-blur can't set saturation; iOS's light material already boosts it. */
export const BLUR_INTENSITY = 45;

/**
 * The light "glass" look used by the buyer app (Home, Explore, Watchlist, My bids, Profile)
 * and sign-up: soft colour background, translucent white cards, blue accents.
 */

export const G = {
  blue: '#4F7BFF',
  blue600: '#3E6AF0',
  blueTint: '#EEF2FF',
  tile: '#E8EEFF',
  ink: '#1C1F2A',
  slate: '#5C6273',
  muted: '#7C8293',
  faint: '#A9AEBB',
  line: 'rgba(28,31,42,0.07)',
  // Glass container spec: fill #FFF 56%, border 1px #FFF 75%, radius 18, shadow 0 1 2,
  // backdrop blur(22px) saturate(170%).
  card: 'rgba(255,255,255,0.56)',
  cardBorder: 'rgba(255,255,255,0.75)',
  orange: '#FF7A1A',
  orangeInk: '#DB7A2E',
  green: '#2E9E5E',
  greenTint: '#EEF9F2',
  red: '#D9536A',
  redTint: '#FDF0F2',
  pink: '#F0456B',
  dangerSoft: '#C8485C',
};
/** Labels use Satoshi too (all type is Satoshi); kept as a name so callers don't change. */
export const MONO = 'Satoshi-Medium';

/** Full-screen glass background with safe area. */
export const GlassScreen: React.FC<{
  children: React.ReactNode;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
}> = ({ children, edges = ['top'], style }) => (
  <View style={styles.root}>
    <StatusBar style="dark" />
    <Image source={require('../../../assets/backgrounds/glass-bg.jpg')} style={styles.bg} />
    <SafeAreaView style={[styles.flex, style]} edges={edges}>
      <View style={styles.flex}>{children}</View>
    </SafeAreaView>
  </View>
);

/** Centered screen title row, optional back button and right action. */
export const GlassHeader: React.FC<{
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
}> = ({ title, onBack, right }) => (
  <View style={styles.header}>
    {onBack ? (
      <Pressable onPress={onBack} style={styles.iconButton} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={20} color={G.ink} />
      </Pressable>
    ) : (
      <View style={styles.headerSide} />
    )}
    <Text style={styles.headerTitle} accessibilityRole="header">
      {title}
    </Text>
    {right ?? <View style={styles.headerSide} />}
  </View>
);

export const GlassCard: React.FC<{ children: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({
  children,
  style,
}) => (
  <View style={[styles.card, style]}>
    {BlurView ? (
      <BlurView intensity={BLUR_INTENSITY} tint="light" style={[StyleSheet.absoluteFill, styles.blur]} pointerEvents="none" />
    ) : null}
    {BlurView ? <View style={[StyleSheet.absoluteFill, styles.blurFill]} pointerEvents="none" /> : null}
    {children}
  </View>
);

export const SectionLabel: React.FC<{ children: string; right?: React.ReactNode; plain?: boolean }> = ({
  children,
  right,
  plain,
}) => (
  <View style={styles.sectionRow}>
    <Text style={plain ? styles.sectionLabelPlain : styles.sectionLabel}>{children.toUpperCase()}</Text>
    {right}
  </View>
);

/** Filter chip; dark when selected. */
export const Chip: React.FC<{
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}> = ({ label, selected, onPress, icon }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && styles.pressed]}
    accessibilityRole="button"
    accessibilityState={{ selected }}
  >
    {icon ? <Ionicons name={icon} size={13} color={selected ? '#FFFFFF' : G.muted} /> : null}
    <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
  </Pressable>
);

/** Pill tabs with counts (Watchlist, My bids). */
export function PillTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <View style={styles.pills} accessibilityRole="tablist">
      {tabs.map(t => {
        const on = t.key === value;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            style={[styles.pill, on && styles.pillOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.pillText, on && styles.pillTextOn]}>{t.label}</Text>
            {t.count !== undefined ? (
              <View style={[styles.pillCount, on && styles.pillCountOn]}>
                <Text style={[styles.pillCountText, on && styles.pillCountTextOn]}>{t.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------------- Time ---------------- */

/** "03:47" under an hour, "2h 42m" under a day, else "3d 4h". */
export const timeLeft = (iso: string, now = Date.now()) => {
  const ms = Math.max(0, new Date(iso).getTime() - now);
  const s = Math.floor(ms / 1000);
  if (s < 3600) return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const h = Math.floor(s / 3600);
  if (h < 24) return `${h}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
};

export const isUrgent = (iso: string, now = Date.now()) => new Date(iso).getTime() - now < 3600_000;

/** "Starts tomorrow, 10:00 am" / "Starts Fri, 2:30 pm". */
export const startsLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400_000);
  const time = d.toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  if (d.toDateString() === today.toDateString()) return `Starts today, ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Starts tomorrow, ${time}`;
  return `Starts ${d.toLocaleDateString('en-NG', { weekday: 'short' })}, ${time}`;
};

/** Re-renders every second (for countdowns). */
export const useNow = (intervalMs = 1000) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
};

/** Orange pill when under an hour, white otherwise. */
export const TimerChip: React.FC<{ end: string; now: number; style?: StyleProp<ViewStyle> }> = ({ end, now, style }) => {
  const urgent = isUrgent(end, now);
  return (
    <View style={[styles.timer, urgent ? styles.timerUrgent : styles.timerCalm, style]}>
      <Text style={[styles.timerText, urgent && styles.timerTextUrgent]}>{timeLeft(end, now)}</Text>
    </View>
  );
};

/* ---------------- Auctions ---------------- */

export const CONDITION_LABEL: Record<string, string> = {
  new: 'New · sealed',
  like_new: 'Like new',
  excellent: 'Grade A',
  good: 'Grade B',
  fair: 'Grade C',
  for_parts: 'For parts',
};

/** Product image on the soft blue tile. */
export const GadgetImage: React.FC<{ uri?: string | null; size?: number; style?: StyleProp<ViewStyle> }> = ({
  uri,
  size = 96,
  style,
}) => {
  const src = mediaUrl(uri);
  return (
    <View style={[styles.imageTile, style]}>
      {src ? (
        <Image source={{ uri: src }} style={{ width: size, height: size }} resizeMode="contain" />
      ) : (
        <Ionicons name="phone-portrait-outline" size={size * 0.4} color={G.faint} />
      )}
    </View>
  );
};

export const HeartButton: React.FC<{ on: boolean; onPress: () => void; size?: number }> = ({ on, onPress, size = 36 }) => (
  <Pressable
    onPress={onPress}
    hitSlop={6}
    style={({ pressed }) => [styles.heart, { width: size, height: size, borderRadius: Math.round(size / 3) }, pressed && styles.pressed]}
    accessibilityRole="button"
    accessibilityLabel={on ? 'Remove from watchlist' : 'Add to watchlist'}
    accessibilityState={{ selected: on }}
  >
    <Ionicons name={on ? 'heart' : 'heart-outline'} size={size * 0.5} color={on ? G.pink : G.muted} />
  </Pressable>
);

/** Two-column grid card (Explore). */
export const AuctionTile: React.FC<{
  title: string;
  image?: string | null;
  subtitle?: string | null;
  price: number;
  end: string;
  now: number;
  onPress: () => void;
}> = ({ title, image, subtitle, price, end, now, onPress }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={title}>
    <GadgetImage uri={image} size={92} style={styles.tileImage} />
    <View style={styles.tileBody}>
      <Text style={styles.tileTitle} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? <Text style={styles.tileSub}>{subtitle}</Text> : null}
      <View style={styles.tileFoot}>
        <Text style={styles.tilePrice}>{formatCurrency(price)}</Text>
        <Text style={[styles.tileTime, isUrgent(end, now) && styles.urgentText]}>{timeLeft(end, now)}</Text>
      </View>
    </View>
  </Pressable>
);

/** One row in the profile menu. */
export const MenuRow: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string | null;
  onPress: () => void;
  danger?: boolean;
  last?: boolean;
}> = ({ icon, title, subtitle, onPress, danger, last }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.menuRow, !last && styles.menuDivider, pressed && styles.menuPressed]}
    accessibilityRole="button"
  >
    <View style={styles.menuIconTile}>
      <Ionicons
        name={icon}
        size={19}
        color={danger ? G.dangerSoft : '#4B5163'}
        // Log out: arrow leaves the door to the left, as in the design.
        style={danger && icon === 'log-out-outline' ? styles.flipX : undefined}
      />
    </View>
    <View style={styles.flex}>
      <Text style={[styles.menuTitle, danger && { color: G.dangerSoft }]}>{title}</Text>
      {subtitle ? (
        <Text style={styles.menuSub} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
    <Ionicons name="chevron-forward" size={18} color={G.faint} />
  </Pressable>
);

/** 3D icon tile used for empty states and prompts. */
export const IconTile: React.FC<{ source: ImageSourcePropType; size?: number }> = ({ source, size = 40 }) => (
  <Image source={source} style={{ width: size, height: size, resizeMode: 'contain' }} />
);

export const PrimaryButton: React.FC<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}> = ({ label, onPress, disabled, style, compact }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [
      styles.primary,
      compact && styles.primaryCompact,
      disabled && styles.primaryDisabled,
      pressed && !disabled && styles.primaryPressed,
      style,
    ]}
    accessibilityRole="button"
    accessibilityState={{ disabled }}
  >
    <Text style={[styles.primaryText, compact && styles.primaryTextCompact, disabled && styles.primaryTextDisabled]}>
      {label}
    </Text>
  </Pressable>
);

/** White button for the second choice ("Pay another way", "View order"). */
export const SecondaryButton: React.FC<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  danger?: boolean;
}> = ({ label, onPress, disabled, style, compact, danger }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [
      styles.secondary,
      compact && styles.primaryCompact,
      pressed && styles.pressed,
      disabled && styles.secondaryDisabled,
      style,
    ]}
    accessibilityRole="button"
    accessibilityState={{ disabled }}
  >
    <Text style={[styles.secondaryText, compact && styles.primaryTextCompact, danger && styles.dangerText]}>{label}</Text>
  </Pressable>
);

/** Quiet text button under a footer's primary action ("Pay another way"). */
export const TextButton: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => (
  <Pressable onPress={onPress} style={styles.textButton} accessibilityRole="button" hitSlop={6}>
    <Text style={styles.textButtonLabel}>{label}</Text>
  </Pressable>
);

/** Green-tick list of reassurances. */
export const CheckList: React.FC<{ items: React.ReactNode[]; style?: StyleProp<ViewStyle> }> = ({ items, style }) => (
  <View style={[styles.checks, style]}>
    {items.map((item, i) => (
      <View key={i} style={styles.checkRow}>
        <Ionicons name="checkmark" size={16} color="#2E9E5E" style={styles.checkIcon} />
        <Text style={styles.checkText}>{item}</Text>
      </View>
    ))}
  </View>
);

/** Amber banner with a label and a running time ("You still have time to pay · 18h 41m"). */
export const DueBanner: React.FC<{ label: string; value: string; style?: StyleProp<ViewStyle> }> = ({ label, value, style }) => (
  <View style={[styles.due, style]} accessibilityLabel={`${label} ${value}`}>
    <Text style={styles.dueLabel}>{label}</Text>
    <Text style={styles.dueValue}>{value}</Text>
  </View>
);

/** Frosted footer bar that sits above the home indicator. */
export const FooterBar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={styles.footerBar}>{children}</View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EEF2FB' },
  bg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    height: 56,
  },
  headerSide: { width: 40 },
  headerTitle: { color: G.ink, fontSize: 17, fontFamily: fonts.medium },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  card: {
    // With blur, the fill sits on top of the blur layer instead (blurFill).
    backgroundColor: BlurView ? 'transparent' : G.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: G.cardBorder,
    shadowColor: '#141C3C',
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  blur: { borderRadius: 17, overflow: 'hidden' },
  blurFill: { borderRadius: 17, backgroundColor: G.card },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel: { fontFamily: MONO, fontSize: 11, letterSpacing: 0.6, color: G.muted },
  sectionLabelPlain: { fontFamily: fonts.medium, fontSize: 12, letterSpacing: 0.6, color: G.muted },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  chipOn: { backgroundColor: G.ink },
  chipText: { color: G.ink, fontSize: 13, fontFamily: fonts.medium },
  chipTextOn: { color: '#FFFFFF' },

  pills: { flexDirection: 'row', gap: 6 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  pillOn: { backgroundColor: G.ink },
  pillText: { color: G.ink, fontSize: 13, fontFamily: fonts.medium },
  pillTextOn: { color: '#FFFFFF' },
  pillCount: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: G.blueTint, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  pillCountOn: { backgroundColor: 'rgba(255,255,255,0.18)' },
  pillCountText: { fontSize: 11, color: G.blue, fontFamily: fonts.medium },
  pillCountTextOn: { color: '#FFFFFF' },

  timer: { height: 22, paddingHorizontal: 8, borderRadius: 11, justifyContent: 'center', alignSelf: 'flex-start' },
  timerUrgent: { backgroundColor: G.orange },
  timerCalm: { backgroundColor: '#FFFFFF' },
  timerText: { fontSize: 11, fontFamily: fonts.medium, color: G.ink, fontVariant: ['tabular-nums'] },
  timerTextUrgent: { color: '#170A02' },

  imageTile: { backgroundColor: G.tile, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  heart: { backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },

  tile: {
    flex: 1,
    maxWidth: '48.6%',
    borderRadius: 18,
    backgroundColor: G.card,
    borderWidth: 1,
    borderColor: G.cardBorder,
    overflow: 'hidden',
  },
  tileImage: { height: 120, borderTopLeftRadius: 17, borderTopRightRadius: 17 },
  tileBody: { padding: 10, gap: 2 },
  tileTitle: { color: G.ink, fontSize: 13, fontFamily: fonts.medium },
  tileSub: { color: G.muted, fontSize: 11, fontFamily: fonts.regular },
  tileFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 },
  tilePrice: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  tileTime: { color: G.muted, fontSize: 11, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  urgentText: { color: G.orangeInk },

  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 16, minHeight: 66 },
  menuDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(28,31,42,0.05)' },
  menuPressed: { backgroundColor: 'rgba(255,255,255,0.6)' },
  menuIconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F1F3F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flipX: { transform: [{ scaleX: -1 }] },
  menuTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  menuSub: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },

  secondary: { height: 50, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  secondaryDisabled: { opacity: 0.5 },
  secondaryText: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  dangerText: { color: '#D9536A' },
  textButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  textButtonLabel: { color: G.slate, fontSize: 15, fontFamily: fonts.medium },
  checks: { gap: 10 },
  checkRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  checkIcon: { marginTop: 2 },
  checkText: { flex: 1, color: G.slate, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  due: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#FFF6EE',
  },
  dueLabel: { color: '#B5621F', fontSize: 14, fontFamily: fonts.regular },
  dueValue: { color: '#DB7A2E', fontSize: 20, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  footerBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.9)',
  },
  primary: { height: 50, borderRadius: 14, backgroundColor: G.blue, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  primaryCompact: { height: 38, borderRadius: 11, paddingHorizontal: 18 },
  primaryDisabled: { backgroundColor: '#E6E9F1' },
  primaryPressed: { backgroundColor: G.blue600, transform: [{ scale: 0.99 }] },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontFamily: fonts.medium },
  primaryTextCompact: { fontSize: 13 },
  primaryTextDisabled: { color: G.faint },
});
