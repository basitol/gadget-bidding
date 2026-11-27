import React from 'react';
import { View, Text, Image, Pressable, StyleSheet, ActivityIndicator, ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { G, GlassCard } from '../../../components/glass';
import { fonts } from '../../../constants';
import type { ApplicationDocument } from '../../../services/sellerApplication.service';

/** Seller onboarding pieces shared by sign-up and the review result screens. */

export const ICONS = {
  store: require('../../../../assets/icons/store.png') as ImageSourcePropType,
  idcard: require('../../../../assets/icons/idcard.png') as ImageSourcePropType,
  shield: require('../../../../assets/icons/shield.png') as ImageSourcePropType,
};

/** Status tints from the design guide: tint + dark text. */
export const TINT = {
  amber: { bg: '#FFF6EE', text: '#DB7A2E', line: 'rgba(219,122,46,0.18)' },
  red: { bg: G.redTint, text: G.red, line: 'rgba(217,83,106,0.2)' },
  green: { bg: G.greenTint, text: G.green },
  violet: { bg: '#F5F2FF', text: '#7C68E8' },
  blue: { bg: '#F1F5FF', text: G.blue600 },
  fill: '#F5F6F9',
};

/** "STEP 1 OF 6 · BUSINESS EMAIL" */
export const Eyebrow: React.FC<{ children: string }> = ({ children }) => (
  <Text style={s.eyebrow}>{children.toUpperCase()}</Text>
);

/** Small caps section label ("WHO CAN SELL"). */
export const Label: React.FC<{ children: string; style?: StyleProp<ViewStyle> }> = ({ children, style }) => (
  <View style={style}>
    <Text style={s.label}>{children.toUpperCase()}</Text>
  </View>
);

/** Tinted note: neutral (info), amber (heads-up) or red. */
export const Note: React.FC<{
  tone?: 'neutral' | 'amber' | 'red';
  title?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}> = ({ tone = 'neutral', title, children, style }) => {
  const colors =
    tone === 'amber'
      ? { bg: TINT.amber.bg, border: TINT.amber.line, text: TINT.amber.text }
      : tone === 'red'
        ? { bg: TINT.red.bg, border: TINT.red.line, text: TINT.red.text }
        : { bg: 'rgba(255,255,255,0.6)', border: 'rgba(255,255,255,0.75)', text: G.slate };
  return (
    <View style={[s.note, { backgroundColor: colors.bg, borderColor: colors.border }, style]}>
      {title ? <Text style={[s.noteTitle, { color: colors.text }]}>{title}</Text> : null}
      <Text style={[s.noteText, { color: tone === 'neutral' ? G.slate : colors.text }]}>{children}</Text>
    </View>
  );
};

/** Green-tick lines ("A shop in Computer Village, Ikeja"). */
export const Ticks: React.FC<{ items: string[]; style?: StyleProp<ViewStyle> }> = ({ items, style }) => (
  <View style={[s.ticks, style]}>
    {items.map(item => (
      <View key={item} style={s.tickRow}>
        <Ionicons name="checkmark" size={16} color={G.green} style={s.tickIcon} />
        <Text style={s.tickText}>{item}</Text>
      </View>
    ))}
  </View>
);

/** The big icon at the top of a result screen, on a tinted tile. */
export const HeroIcon: React.FC<{ source: ImageSourcePropType; tint?: string }> = ({ source, tint = '#FFFFFF' }) => (
  <View style={[s.heroTile, { backgroundColor: tint }]}>
    <Image source={source} style={s.heroImage} />
  </View>
);

export const Hero: React.FC<{ icon: ImageSourcePropType; tint?: string; title: string; sub: string }> = ({
  icon,
  tint,
  title,
  sub,
}) => (
  <View style={s.hero}>
    <HeroIcon source={icon} tint={tint} />
    <Text style={s.heroTitle} accessibilityRole="header">
      {title}
    </Text>
    <Text style={s.heroSub}>{sub}</Text>
  </View>
);

/** One row of a glass list card: icon tile, title, sub, optional right side. */
export const ListRow: React.FC<{
  icon?: React.ReactNode;
  title: string;
  sub?: React.ReactNode;
  subColor?: string;
  right?: React.ReactNode;
  last?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}> = ({ icon, title, sub, subColor, right, last, onPress, accessibilityLabel }) => {
  const body = (
    <View style={[s.row, !last && s.rowLine]}>
      {icon}
      <View style={s.rowBody}>
        <Text style={s.rowTitle}>{title}</Text>
        {sub ? <Text style={[s.rowSub, subColor ? { color: subColor } : null]}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
  return onPress ? (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => pressed && s.pressed}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
    >
      {body}
    </Pressable>
  ) : (
    body
  );
};

export const IconImage: React.FC<{ source: ImageSourcePropType; size?: number }> = ({ source, size = 36 }) => (
  <Image source={source} style={{ width: size, height: size, resizeMode: 'contain' }} />
);

/** Small blue action button inside a row ("Upload"). White when it's a second go ("Change"). */
export const RowButton: React.FC<{ label: string; onPress: () => void; busy?: boolean; quiet?: boolean; disabled?: boolean }> = ({
  label,
  onPress,
  busy,
  quiet,
  disabled,
}) => (
  <Pressable
    onPress={onPress}
    disabled={busy || disabled}
    style={({ pressed }) => [s.rowButton, quiet && s.rowButtonQuiet, (pressed || disabled) && s.pressed]}
    accessibilityRole="button"
    accessibilityState={{ busy, disabled }}
    hitSlop={6}
  >
    {busy ? (
      <ActivityIndicator size="small" color={quiet ? G.blue : '#FFFFFF'} />
    ) : (
      <Text style={[s.rowButtonText, quiet && s.rowButtonTextQuiet]}>{label}</Text>
    )}
  </Pressable>
);

const docSub: Record<string, string> = {
  cac_certificate: 'Photo or PDF of the full certificate',
  owner_id: "NIN slip, passport or driver's licence",
  shop_address: 'Tenancy, shop receipt or utility bill (last 3 months)',
};

/** A document to upload: empty, uploaded (green tick, file name, Change) or flagged by our team (red note). */
export const DocumentRow: React.FC<{
  doc: ApplicationDocument;
  busy?: boolean;
  onUpload: () => void;
  last?: boolean;
}> = ({ doc, busy, onUpload, last }) => {
  const flagged = doc.status === 'needs_fix';
  const done = doc.uploaded && !flagged;
  return (
    <View style={[s.docRow, !last && s.rowLine]}>
      <View style={[s.docIcon, done && { backgroundColor: TINT.green.bg }, flagged && { backgroundColor: TINT.red.bg }]}>
        <Ionicons
          name={done ? 'checkmark' : 'document-outline'}
          size={18}
          color={done ? G.green : flagged ? G.red : G.muted}
        />
      </View>
      <View style={s.rowBody}>
        <Text style={s.rowTitle}>{doc.label}</Text>
        <Text style={[s.rowSub, flagged && { color: G.red }]} numberOfLines={2}>
          {flagged ? doc.note || 'Upload a new one' : done ? `Uploaded · ${doc.name ?? 'file'}` : docSub[doc.kind]}
        </Text>
      </View>
      <RowButton label={done ? 'Change' : 'Upload'} quiet={done} busy={busy} onPress={onUpload} />
    </View>
  );
};

/** A tick box with a title and a line under it ("Platform fee"). */
export const RuleRow: React.FC<{ title: string; sub: string; on: boolean; onToggle: () => void; last?: boolean }> = ({
  title,
  sub,
  on,
  onToggle,
  last,
}) => (
  <Pressable
    onPress={onToggle}
    style={({ pressed }) => [s.ruleRow, !last && s.rowLine, pressed && s.pressed]}
    accessibilityRole="checkbox"
    accessibilityState={{ checked: on }}
    accessibilityLabel={`${title}. ${sub}`}
  >
    <View style={[s.box, on && s.boxOn]}>{on ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}</View>
    <View style={s.rowBody}>
      <Text style={s.rowTitle}>{title}</Text>
      <Text style={s.rowSub}>{sub}</Text>
    </View>
  </Pressable>
);

export type TimelineStep = { title: string; sub: string; state: 'done' | 'current' | 'todo' };

/** Vertical steps: green when done, a blue ring for the current one, grey after. */
export const Timeline: React.FC<{ steps: TimelineStep[] }> = ({ steps }) => (
  <GlassCard style={s.timeline}>
    {steps.map((st, i) => {
      const next = steps[i + 1];
      return (
        <View key={st.title} style={s.tlRow} accessibilityLabel={`${st.title}. ${st.sub}. ${st.state === 'done' ? 'Done' : st.state === 'current' ? 'In progress' : 'Not yet'}`}>
          <View style={s.tlRail}>
            <View style={[s.dot, st.state === 'done' && s.dotDone, st.state === 'current' && s.dotCurrent]} />
            {next ? <View style={[s.line, st.state === 'done' && next.state === 'done' && s.lineDone]} /> : null}
          </View>
          <View style={[s.tlBody, !next && s.tlBodyLast]}>
            <Text style={[s.tlTitle, st.state === 'current' && { color: G.blue600 }, st.state === 'todo' && { color: G.faint }]}>
              {st.title}
            </Text>
            <Text style={[s.tlSub, st.state === 'todo' && { color: G.faint }]}>{st.sub}</Text>
          </View>
        </View>
      );
    })}
  </GlassCard>
);

/** "Today, 2:41 pm" / "Yesterday, 9:05 am" / "Nov 24, 9:05 am" */
export const whenLabel = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (day === today) return `Today, ${time}`;
  if (day === today - 86_400_000) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
};

const s = StyleSheet.create({
  pressed: { opacity: 0.7 },
  eyebrow: { color: G.muted, fontSize: 12, letterSpacing: 0.6, fontFamily: fonts.medium, marginBottom: 12 },
  label: { color: G.muted, fontSize: 12, letterSpacing: 0.6, fontFamily: fonts.medium },

  note: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, gap: 4 },
  noteTitle: { fontSize: 14, fontFamily: fonts.medium },
  noteText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },

  ticks: { gap: 12 },
  tickRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  tickIcon: { marginTop: 2 },
  tickText: { flex: 1, color: G.slate, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },

  hero: { alignItems: 'center', paddingHorizontal: 8, marginBottom: 24 },
  heroTile: {
    width: 88,
    height: 88,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    shadowColor: '#141C3C',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  heroImage: { width: 60, height: 60, resizeMode: 'contain' },
  heroTitle: { color: G.ink, fontSize: 24, lineHeight: 30, letterSpacing: -0.4, fontFamily: fonts.medium, textAlign: 'center' },
  heroSub: { color: G.muted, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular, textAlign: 'center', marginTop: 8 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(28,31,42,0.08)' },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  rowSub: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },

  rowButton: { minWidth: 72, height: 36, paddingHorizontal: 14, borderRadius: 10, backgroundColor: G.blue, alignItems: 'center', justifyContent: 'center' },
  rowButtonQuiet: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(28,31,42,0.08)' },
  rowButtonText: { color: '#FFFFFF', fontSize: 14, fontFamily: fonts.medium },
  rowButtonTextQuiet: { color: G.ink },

  docRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  docIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: TINT.fill, alignItems: 'center', justifyContent: 'center' },

  ruleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: 'rgba(28,31,42,0.16)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxOn: { backgroundColor: G.blue, borderColor: G.blue },

  timeline: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 6 },
  tlRow: { flexDirection: 'row', gap: 14 },
  tlRail: { width: 16, alignItems: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: 'rgba(28,31,42,0.16)', backgroundColor: '#FFFFFF', marginTop: 3 },
  dotDone: { backgroundColor: G.green, borderColor: G.green },
  dotCurrent: { borderColor: G.blue, borderWidth: 3 },
  line: { flex: 1, width: 2, backgroundColor: 'rgba(28,31,42,0.08)', marginVertical: 2 },
  lineDone: { backgroundColor: G.green },
  tlBody: { flex: 1, paddingBottom: 18 },
  tlBodyLast: { paddingBottom: 12 },
  tlTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  tlSub: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },
});
