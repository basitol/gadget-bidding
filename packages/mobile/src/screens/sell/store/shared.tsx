import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { G, GlassScreen, GlassHeader, GlassCard, PrimaryButton } from '../../../components/glass';
import { fonts } from '../../../constants';
import { useToastStore } from '../../../store/toastStore';

/** Pieces shared by the screens under the seller's Store tab. */

export const toast = (message: string, type: 'success' | 'error' = 'error') => useToastStore.getState().show(message, type);
export const errText = (e: unknown, fallback = "That didn't work. Try again.") => (e instanceof Error && e.message) || fallback;

/** Header + spinner while the first load runs; a retry card if it failed. */
export const LoadingScreen: React.FC<{ title: string; onBack: () => void; failed?: string | null; onRetry?: () => void }> = ({
  title,
  onBack,
  failed,
  onRetry,
}) => (
  <GlassScreen>
    <GlassHeader title={title} onBack={onBack} />
    {failed ? (
      <View style={s.pad}>
        <GlassCard style={s.failed}>
          <Text style={s.failedTitle}>{failed}</Text>
          <Text style={s.failedText}>Check your connection, then try again.</Text>
          {onRetry ? <PrimaryButton label="Try again" compact onPress={onRetry} style={s.retry} /> : null}
        </GlassCard>
      </View>
    ) : (
      <ActivityIndicator color={G.blue} style={s.loader} />
    )}
  </GlassScreen>
);

/** "LABEL" above a group, with room before it. */
export const Overline: React.FC<{ children: string; right?: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({
  children,
  right,
  style,
}) => (
  <View style={[s.overlineRow, style]}>
    <Text style={s.overline}>{children.toUpperCase()}</Text>
    {right}
  </View>
);

/** Key / value row inside a card ("Shop · Shop 14, Otigba Tech Plaza"). */
export const FactRow: React.FC<{ k: string; v: string; last?: boolean }> = ({ k, v, last }) => (
  <View style={[s.fact, !last && s.divider]}>
    <Text style={s.factKey}>{k}</Text>
    <Text style={s.factValue}>{v}</Text>
  </View>
);

/** Blue text link with a chevron ("Ask our team to change these"). */
export const LinkRow: React.FC<{ label: string; onPress: () => void; style?: StyleProp<ViewStyle> }> = ({ label, onPress, style }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [s.link, pressed && s.pressed, style]}
    accessibilityRole="link"
    hitSlop={6}
  >
    <Text style={s.linkText}>{label}</Text>
    <Ionicons name="chevron-forward" size={15} color={G.blue600} />
  </Pressable>
);

export const Stars: React.FC<{ score: number; size?: number }> = ({ score, size = 14 }) => (
  <View style={s.stars} accessibilityLabel={`${score} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map(n => (
      <Ionicons key={n} name={n <= score ? 'star' : 'star-outline'} size={size} color={n <= score ? '#F5A524' : G.faint} />
    ))}
  </View>
);

export const s = StyleSheet.create({
  flex: { flex: 1 },
  pad: { paddingHorizontal: 20 },
  pressed: { opacity: 0.7 },
  loader: { marginTop: 48 },
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 40 },
  failed: { padding: 20, alignItems: 'center', gap: 6, marginTop: 12 },
  failedTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium, textAlign: 'center' },
  failedText: { color: G.muted, fontSize: 14, fontFamily: fonts.regular, textAlign: 'center' },
  retry: { marginTop: 10 },
  overlineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 10 },
  overline: { color: G.muted, fontSize: 12, letterSpacing: 0.6, fontFamily: fonts.medium },
  group: { overflow: 'hidden' },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(28,31,42,0.08)' },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingHorizontal: 16, paddingVertical: 14 },
  factKey: { color: G.muted, fontSize: 14, fontFamily: fonts.regular },
  factValue: { flex: 1, color: G.ink, fontSize: 14, fontFamily: fonts.medium, textAlign: 'right' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', minHeight: 44 },
  linkText: { color: G.blue600, fontSize: 14, fontFamily: fonts.medium },
  stars: { flexDirection: 'row', gap: 2 },
  help: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, marginTop: 8 },
  empty: { padding: 20, alignItems: 'center', gap: 6 },
  emptyTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium, textAlign: 'center' },
  emptyText: { color: G.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, textAlign: 'center' },
});
