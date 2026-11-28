import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Switch, TextInput, TextInputProps, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Disclosure } from '@gadget-bidding/shared';
import { A } from '../../../components/auth/GlassAuthKit';
import { Chip, G, GlassCard } from '../../../components/glass';
import { fonts } from '../../../constants';
import { TINT } from '../onboarding/kit';

/** "List a gadget" pieces, in the seller sign-up style. */

/** ₦ with commas, no kobo: ₦1,284,800. */
export const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;
export const digitsOnly = (v: string) => v.replace(/\D/g, '');
/** "750000" → "750,000" while typing. */
export const groupDigits = (v: string) => (v ? Number(v).toLocaleString('en-NG') : '');

/** Question / field label above a group ("Has it ever been opened or repaired?"). */
export const Question: React.FC<{ children: React.ReactNode; right?: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({
  children,
  right,
  style,
}) => (
  <View style={[s.qRow, style]}>
    <Text style={s.question}>{children}</Text>
    {right}
  </View>
);

export const Help: React.FC<{ children: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({ children, style }) => (
  <View style={style}>
    <Text style={s.help}>{children}</Text>
  </View>
);

export const Strong: React.FC<{ children: React.ReactNode }> = ({ children }) => <Text style={s.strong}>{children}</Text>;

/** Chips that wrap; one pick (value) or many (values). Selected = ink fill. */
export const ChipGroup: React.FC<{
  options: { key: string; label: string }[];
  value?: string | null;
  values?: string[];
  onPick: (key: string) => void;
  style?: StyleProp<ViewStyle>;
}> = ({ options, value, values, onPick, style }) => (
  <View style={[s.chips, style]}>
    {options.map(o => (
      <Chip key={o.key} label={o.label} selected={values ? values.includes(o.key) : value === o.key} onPress={() => onPick(o.key)} />
    ))}
  </View>
);

/** A category tile: icon + label, blue border when picked. */
export const CategoryTile: React.FC<{
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
}> = ({ label, icon, selected, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [s.tileWrap, pressed && s.pressed]}
    accessibilityRole="button"
    accessibilityState={{ selected }}
    accessibilityLabel={label}
  >
    <GlassCard style={[s.tile, selected && s.tileOn]}>
      <Ionicons name={icon} size={24} color={selected ? G.blue600 : G.ink} />
      <Text style={s.tileLabel} numberOfLines={2}>
        {label}
      </Text>
    </GlassCard>
  </Pressable>
);

/** A tick box with a statement (and an optional line under it). */
export const TickRow: React.FC<{
  label: string;
  sub?: string;
  on: boolean;
  onToggle: () => void;
  last?: boolean;
  /** Regular weight, for a sentence rather than a name. */
  plain?: boolean;
  children?: React.ReactNode;
}> = ({ label, sub, on, onToggle, last, plain, children }) => (
  <View style={[!last && s.rowLine]}>
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [s.tickRow, pressed && s.pressed]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={sub ? `${label}. ${sub}` : label}
    >
      <View style={[s.box, on && s.boxOn]}>{on ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}</View>
      <View style={s.rowBody}>
        <Text style={[s.rowTitle, plain && s.rowPlain]}>{label}</Text>
        {sub ? <Text style={s.rowSub}>{sub}</Text> : null}
      </View>
    </Pressable>
    {children ? <View style={s.tickChildren}>{children}</View> : null}
  </View>
);

/** One choice in a list of cards: radio dot, label and a line of help. */
export const RadioCard: React.FC<{ label: string; help?: string; selected: boolean; onPress: () => void }> = ({
  label,
  help,
  selected,
  onPress,
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => pressed && s.pressed}
    accessibilityRole="radio"
    accessibilityState={{ checked: selected }}
    accessibilityLabel={help ? `${label}. ${help}` : label}
  >
    <GlassCard style={[s.radioCard, selected && s.tileOn]}>
      <View style={[s.radio, selected && s.radioOn]}>{selected ? <View style={s.radioDot} /> : null}</View>
      <View style={s.rowBody}>
        <Text style={s.rowTitle}>{label}</Text>
        {help ? <Text style={s.rowSub}>{help}</Text> : null}
      </View>
    </GlassCard>
  </Pressable>
);

/** Small green "✓ From serial" tag next to a spec label. */
export const FromSerialTag: React.FC = () => (
  <View style={[s.tag, { backgroundColor: TINT.green.bg }]} accessibilityLabel="From serial">
    <Ionicons name="checkmark" size={11} color={G.green} />
    <Text style={[s.tagText, { color: G.green }]}>From serial</Text>
  </View>
);

/** Small amber "REQUIRED" tag on a photo slot. */
export const RequiredTag: React.FC = () => (
  <View style={[s.tag, { backgroundColor: TINT.amber.bg }]}>
    <Text style={[s.tagText, s.tagCaps, { color: TINT.amber.text }]}>REQUIRED</Text>
  </View>
);

const TONES: Record<Disclosure['tone'], { bg: string; text: string }> = {
  amber: { bg: TINT.amber.bg, text: TINT.amber.text },
  blue: { bg: TINT.blue.bg, text: TINT.blue.text },
  red: { bg: TINT.red.bg, text: TINT.red.text },
  neutral: { bg: TINT.fill, text: G.ink },
};

/** A tinted status chip ("Screen replaced · non-genuine part"). */
export const ToneChip: React.FC<{ label: string; tone: Disclosure['tone'] }> = ({ label, tone }) => (
  <View style={[s.toneChip, { backgroundColor: TONES[tone].bg }]}>
    <Text style={[s.toneChipText, { color: TONES[tone].text }]}>{label}</Text>
  </View>
);

export const Disclosures: React.FC<{ items: Disclosure[] }> = ({ items }) => (
  <View style={s.chips}>
    {items.map(d => (
      <ToneChip key={d.label} label={d.label} tone={d.tone} />
    ))}
  </View>
);

/** Plain chip for a value read from the lookup ("M3 Pro"). */
export const ValueChip: React.FC<{ label: string }> = ({ label }) => (
  <View style={[s.toneChip, s.valueChip]}>
    <Text style={[s.toneChipText, { color: G.ink }]}>{label}</Text>
  </View>
);

/** Tinted note with rich text: green (good news), amber (heads-up), neutral. */
export const TintNote: React.FC<{
  tone?: 'green' | 'amber' | 'neutral' | 'red';
  icon?: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}> = ({ tone = 'neutral', icon, children, style }) => {
  const c =
    tone === 'green'
      ? { bg: TINT.green.bg, border: 'rgba(46,158,94,0.16)', icon: G.green, text: G.ink }
      : tone === 'amber'
        ? { bg: TINT.amber.bg, border: TINT.amber.line, icon: TINT.amber.text, text: TINT.amber.text }
        : tone === 'red'
          ? { bg: TINT.red.bg, border: TINT.red.line, icon: G.red, text: G.red }
          : { bg: 'rgba(255,255,255,0.6)', border: 'rgba(255,255,255,0.75)', icon: G.muted, text: G.slate };
  return (
    <View style={[s.note, { backgroundColor: c.bg, borderColor: c.border }, style]}>
      {icon ? <Ionicons name={icon} size={16} color={c.icon} style={s.noteIcon} /> : null}
      <Text style={[s.noteText, { color: c.text }]}>{children}</Text>
    </View>
  );
};

/** ₦ amount input: digits only, shown with commas. */
export const MoneyField: React.FC<
  Omit<TextInputProps, 'value' | 'onChangeText' | 'onChange'> & { value: string; onChange: (digits: string) => void; invalid?: boolean }
> = ({ value, onChange, invalid, onFocus, onBlur, ...props }) => {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[s.money, focused && s.inputFocused, invalid && s.inputInvalid]}>
      <Text style={s.moneySign}>₦</Text>
      <TextInput
        value={groupDigits(value)}
        onChangeText={t => onChange(digitsOnly(t).replace(/^0+/, '').slice(0, 12))}
        keyboardType="number-pad"
        placeholderTextColor={A.faint}
        onFocus={e => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={e => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={s.moneyInput}
        {...props}
      />
    </View>
  );
};

/** Glass card with a title, a line under it and a switch (Lowest price I'll accept). */
export const SwitchCard: React.FC<{
  title: string;
  sub: string;
  on: boolean;
  onChange: (v: boolean) => void;
  children?: React.ReactNode;
}> = ({ title, sub, on, onChange, children }) => (
  <GlassCard style={s.switchCard}>
    <View style={s.switchRow}>
      <View style={s.rowBody}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.rowSub}>{sub}</Text>
      </View>
      <Switch
        value={on}
        onValueChange={onChange}
        trackColor={{ true: G.blue, false: '#E3E6EE' }}
        thumbColor="#FFFFFF"
        ios_backgroundColor="#E3E6EE"
        accessibilityRole="switch"
        accessibilityLabel={title}
        accessibilityState={{ checked: on }}
      />
    </View>
    {children}
  </GlassCard>
);

/** "ITEM ······ Edit" heading of a review section. */
export const ReviewSection: React.FC<{ label: string; onEdit: () => void; children: React.ReactNode }> = ({
  label,
  onEdit,
  children,
}) => (
  <GlassCard style={s.reviewCard}>
    <View style={s.reviewHead}>
      <Text style={s.reviewLabel}>{label.toUpperCase()}</Text>
      <Pressable onPress={onEdit} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Edit ${label.toLowerCase()}`}>
        <Text style={s.edit}>Edit</Text>
      </Pressable>
    </View>
    {children}
  </GlassCard>
);

export const ReviewLine: React.FC<{ children: React.ReactNode; tone?: 'ink' | 'muted' | 'amber' | 'red'; strong?: boolean }> = ({
  children,
  tone = 'ink',
  strong,
}) => (
  <Text
    style={[
      s.reviewLine,
      strong && s.reviewStrong,
      tone === 'muted' && { color: G.muted },
      tone === 'amber' && { color: TINT.amber.text },
      tone === 'red' && { color: G.red },
    ]}
  >
    {children}
  </Text>
);

export const listingStyles = StyleSheet.create({
  gap: { marginTop: 24 },
  gapSm: { marginTop: 12 },
  card: { overflow: 'hidden' },
  error: { color: A.red, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, marginTop: 6 },
  muted: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
});

const s = StyleSheet.create({
  pressed: { opacity: 0.7 },
  qRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
  question: { flex: 1, color: A.slate, fontSize: 14, lineHeight: 20, fontFamily: fonts.medium },
  help: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
  strong: { color: G.ink, fontFamily: fonts.medium },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  tileWrap: { width: '31.6%' },
  tile: { height: 92, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 6 },
  tileOn: { borderColor: G.blue, borderWidth: 1.5 },
  tileLabel: { color: G.ink, fontSize: 13, lineHeight: 16, fontFamily: fonts.medium, textAlign: 'center' },

  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(28,31,42,0.08)' },
  tickRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  tickChildren: { paddingLeft: 52, paddingRight: 16, paddingBottom: 14, marginTop: -4 },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { color: G.ink, fontSize: 15, lineHeight: 21, fontFamily: fonts.medium },
  rowSub: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
  rowPlain: { fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  box: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: 'rgba(28,31,42,0.16)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0,
  },
  boxOn: { backgroundColor: G.blue, borderColor: G.blue },

  radioCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 8 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(28,31,42,0.16)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: G.blue },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: G.blue },

  tag: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 20, paddingHorizontal: 7, borderRadius: 6, alignSelf: 'flex-start' },
  tagText: { fontSize: 11, fontFamily: fonts.medium },
  tagCaps: { letterSpacing: 0.4, fontSize: 10 },

  toneChip: { minHeight: 30, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, justifyContent: 'center' },
  toneChipText: { fontSize: 13, lineHeight: 18, fontFamily: fonts.medium },
  valueChip: { backgroundColor: '#FFFFFF' },

  note: { flexDirection: 'row', gap: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  noteIcon: { marginTop: 2 },
  noteText: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },

  money: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  moneySign: { color: G.ink, fontSize: 18, fontFamily: fonts.medium, marginRight: 6 },
  moneyInput: { flex: 1, height: 52, color: G.ink, fontSize: 18, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  inputFocused: { borderColor: A.blue },
  inputInvalid: { borderColor: A.red },

  switchCard: { padding: 16 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  reviewCard: { padding: 16, marginBottom: 12, gap: 4 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  reviewLabel: { color: G.muted, fontSize: 12, letterSpacing: 0.6, fontFamily: fonts.medium },
  edit: { color: G.blue600, fontSize: 14, fontFamily: fonts.medium },
  reviewLine: { color: G.ink, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  reviewStrong: { fontSize: 15, fontFamily: fonts.medium },
});
