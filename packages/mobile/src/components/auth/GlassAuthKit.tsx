import React, { forwardRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  Pressable,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { fonts } from '../../constants';

/** Pieces shared by the glass auth screens (Log in, Reset password). Same look as sign-up. */

export const A = {
  blue: '#4F7BFF',
  blue600: '#3E6AF0',
  ink: '#1C1F2A',
  slate: '#5C6273',
  muted: '#7C8293',
  faint: '#A9AEBB',
  line: '#E3E6EE',
  green: '#2E9E5E',
  red: '#D9536A',
  disabled: '#EDEFF4',
};

/** Blob background, safe area, keyboard avoidance and the header (back · title). */
export const AuthShell: React.FC<{
  title: string;
  onBack: () => void;
  progress?: { step: number; of: number };
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** To scroll back to the top when the step changes (List a gadget). */
  scrollRef?: React.Ref<ScrollView>;
}> = ({ title, onBack, progress, footer, children, scrollRef }) => (
  <View style={styles.root}>
    <StatusBar style="dark" />
    <Image source={require('../../../assets/backgrounds/glass-bg.jpg')} style={styles.bg} />
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={20} color={A.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={styles.headerSpacer} />
        </View>
        {progress ? (
          <View style={styles.progress} accessibilityLabel={`Step ${progress.step} of ${progress.of}`}>
            {Array.from({ length: progress.of }).map((_, i) => (
              <View key={i} style={[styles.segment, i < progress.step && styles.segmentOn]} />
            ))}
          </View>
        ) : null}
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  </View>
);

export const AuthTitle: React.FC<{ title: string; sub?: React.ReactNode }> = ({ title, sub }) => (
  <View style={styles.titleBlock}>
    <Text style={styles.title} accessibilityRole="header">
      {title}
    </Text>
    {sub ? <Text style={styles.sub}>{sub}</Text> : null}
  </View>
);

export const Strong: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text style={styles.strong}>{children}</Text>
);

/** Label above, input, and a written error below (shown after the person leaves the field). */
export const Field: React.FC<{ label: string; error?: string | null; children: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({
  label,
  error,
  children,
  style,
}) => (
  <View style={[styles.field, style]}>
    <Text style={styles.fieldLabel}>{label}</Text>
    {children}
    {error ? (
      <Text style={styles.fieldError} accessibilityRole="alert">
        {error}
      </Text>
    ) : null}
  </View>
);

export const TextField = forwardRef<TextInput, TextInputProps & { invalid?: boolean }>(({ invalid, style, onFocus, onBlur, ...props }, ref) => {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={A.faint}
      {...props}
      onFocus={e => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={e => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[styles.input, focused && styles.inputFocused, invalid && styles.inputInvalid, style]}
    />
  );
});

/** textToggle: a "Show" / "Hide" chip instead of the eye (seller log in). */
export const PasswordField = forwardRef<TextInput, TextInputProps & { invalid?: boolean; textToggle?: boolean }>(({ invalid, textToggle, onFocus, onBlur, ...props }, ref) => {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.inputRow, focused && styles.inputFocused, invalid && styles.inputInvalid]}>
      <TextInput
        ref={ref}
        placeholderTextColor={A.faint}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
        onFocus={e => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={e => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[styles.input, styles.inputBare]}
      />
      {textToggle ? (
        <Pressable
          onPress={() => setShow(s => !s)}
          hitSlop={6}
          style={({ pressed }) => [styles.showChip, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={show ? 'Hide password' : 'Show password'}
        >
          <Text style={styles.showChipText}>{show ? 'Hide' : 'Show'}</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => setShow(s => !s)}
          hitSlop={10}
          style={styles.eye}
          accessibilityRole="button"
          accessibilityLabel={show ? 'Hide password' : 'Show password'}
        >
          <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={A.muted} />
        </Pressable>
      )}
    </View>
  );
});

/** 8+ characters, a number, a letter — matches the server's rule. */
export const passwordRules = (pw: string) => ({
  length: pw.length >= 8,
  number: /[0-9]/.test(pw),
  letter: /[A-Za-z]/.test(pw),
});

/** Seller accounts handle money: 10+ characters, a number, a capital letter (the server checks the same). */
export const sellerPasswordRules = (pw: string) => ({
  length: pw.length >= 10,
  number: /[0-9]/.test(pw),
  capital: /[A-Z]/.test(pw),
});

export const PasswordRules: React.FC<{ password: string; seller?: boolean }> = ({ password, seller }) => {
  if (seller) {
    const r = sellerPasswordRules(password);
    return (
      <View style={styles.rules}>
        <Rule ok={r.length} label="10 characters or more" />
        <Rule ok={r.number} label="A number" />
        <Rule ok={r.capital} label="A capital letter" />
      </View>
    );
  }
  const r = passwordRules(password);
  return (
    <View style={styles.rules}>
      <Rule ok={r.length} label="8 characters or more" />
      <Rule ok={r.number} label="A number" />
      <Rule ok={r.letter} label="A letter" />
    </View>
  );
};

const Rule: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  <View style={styles.rule}>
    {ok ? <Ionicons name="checkmark-circle" size={14} color={A.green} /> : <View style={styles.ruleDot} />}
    <Text style={[styles.ruleText, ok && styles.ruleTextOk]}>{label}</Text>
  </View>
);

/** Six boxes over one hidden input; calls onComplete when all six digits are in. */
export const CodeBoxes: React.FC<{
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  error?: boolean;
}> = ({ value, onChange, onComplete, error }) => {
  const ref = React.useRef<TextInput>(null);
  return (
    <Pressable style={styles.codeRow} onPress={() => ref.current?.focus()} accessible={false}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={[styles.codeBox, i === Math.min(value.length, 5) && styles.codeBoxActive, error && styles.codeBoxError]}>
          <Text style={styles.codeDigit}>{value[i] ?? ''}</Text>
        </View>
      ))}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={t => {
          const v = t.replace(/\D/g, '').slice(0, 6);
          onChange(v);
          if (v.length === 6) onComplete?.(v);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus
        style={styles.hiddenInput}
        accessibilityLabel="6-digit code"
      />
    </Pressable>
  );
};

export const AuthButton: React.FC<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}> = ({ label, onPress, disabled, busy, style }) => {
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [styles.primary, disabled && styles.primaryDisabled, pressed && !off && styles.primaryPressed, style]}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
    >
      {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[styles.primaryText, disabled && styles.primaryTextDisabled]}>{label}</Text>}
    </Pressable>
  );
};

export const TextLink: React.FC<{ label: string; onPress: () => void; style?: StyleProp<ViewStyle>; muted?: boolean }> = ({
  label,
  onPress,
  style,
  muted,
}) => (
  <Pressable onPress={onPress} hitSlop={8} style={style} accessibilityRole="link">
    <Text style={[styles.link, muted && styles.linkMuted]}>{label}</Text>
  </Pressable>
);

export const authStyles = StyleSheet.create({
  error: { color: A.red, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, marginTop: 4 },
  resend: { textAlign: 'center', color: A.muted, fontSize: 14, fontFamily: fonts.regular, marginTop: 20 },
  resendOn: { color: A.blue600, fontFamily: fonts.medium },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EEF2FB' },
  bg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, height: 60 },
  back: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#141C3C',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  headerTitle: { color: A.ink, fontSize: 17, fontFamily: fonts.medium },
  headerSpacer: { width: 44 },

  progress: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginTop: 12 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.75)' },
  segmentOn: { backgroundColor: A.blue },

  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },

  titleBlock: { marginBottom: 24 },
  title: { color: A.ink, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, fontFamily: fonts.medium },
  sub: { color: A.muted, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular, marginTop: 8 },
  strong: { color: A.ink, fontFamily: fonts.medium },

  field: { gap: 8, marginBottom: 16 },
  fieldLabel: { color: A.slate, fontSize: 14, fontFamily: fonts.medium },
  fieldError: { color: A.red, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
  input: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: A.ink,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  inputBare: { flex: 1, backgroundColor: 'transparent', borderWidth: 0 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: 'transparent' },
  inputFocused: { borderColor: A.blue },
  inputInvalid: { borderColor: A.red },
  eye: { paddingHorizontal: 16, height: 52, justifyContent: 'center' },
  showChip: { height: 36, paddingHorizontal: 14, marginRight: 8, borderRadius: 10, backgroundColor: '#F3F4F8', justifyContent: 'center' },
  showChipText: { color: A.ink, fontSize: 14, fontFamily: fonts.medium },

  rules: { gap: 8, marginTop: -4, marginBottom: 8 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleDot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 3, backgroundColor: A.line },
  ruleText: { color: A.muted, fontSize: 14, fontFamily: fonts.regular },
  ruleTextOk: { color: A.ink },

  codeRow: { flexDirection: 'row', gap: 8 },
  codeBox: {
    flex: 1,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    // Faint edge so the boxes still show on white sheets (2-step sign-in code).
    borderColor: 'rgba(28,31,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBoxActive: { borderColor: A.blue },
  codeBoxError: { borderColor: A.red },
  codeDigit: { fontSize: 22, color: A.ink, fontFamily: fonts.medium },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },

  primary: { height: 52, borderRadius: 14, backgroundColor: A.blue, alignItems: 'center', justifyContent: 'center' },
  primaryPressed: { backgroundColor: A.blue600, transform: [{ scale: 0.99 }] },
  primaryDisabled: { backgroundColor: A.disabled },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontFamily: fonts.medium },
  primaryTextDisabled: { color: A.faint },

  link: { color: A.blue600, fontSize: 14, fontFamily: fonts.medium },
  linkMuted: { color: A.slate },
});
