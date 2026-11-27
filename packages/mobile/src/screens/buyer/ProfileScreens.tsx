import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { G, GlassScreen, GlassHeader, GlassCard, PrimaryButton, FooterBar } from '../../components/glass';
import { fonts } from '../../constants';
import { authService, meService } from '../../services';
import type { ContactChange, PersonalProfile } from '../../services/me.service';
import { useAuthStore } from '../../store';
import { useToastStore } from '../../store/toastStore';
import { mediaUrl } from '../../utils';

const toast = (msg: string, type: 'success' | 'error' = 'success') => useToastStore.getState().show(msg, type);
const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** +2348030004521 → "0803 ••• 4521" */
const maskPhone = (p?: string | null) => {
  const d = (p ?? '').replace(/\D/g, '');
  if (d.length < 8) return null;
  const local = d.startsWith('234') ? `0${d.slice(3)}` : d;
  return `${local.slice(0, 4)} ••• ${local.slice(-4)}`;
};
const phoneOk = (v: string) => {
  const d = v.replace(/\D/g, '');
  const local = d.startsWith('234') ? `0${d.slice(3)}` : d.length === 10 ? `0${d}` : d;
  return /^0[789][01]\d{8}$/.test(local);
};
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

const initials = (name?: string | null) =>
  (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase())
    .join('');

/** Keep the signed-in user (header initials, avatar) in step with the server. */
const useApplyUser = () => {
  const { setUser } = useAuthStore();
  return async (user: any) => {
    if (!user) return;
    setUser(user);
    await authService.persistUser(user).catch(() => {});
  };
};

/* ================= Change email or phone ================= */

type Kind = 'phone' | 'email';

/**
 * Three steps: pick what to change and type the new one → enter the code we sent to it → done.
 * The code always goes to the NEW email or number, so only its owner can switch to it.
 */
export const ChangeContactScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const applyUser = useApplyUser();
  const [profile, setProfile] = useState<PersonalProfile | null>(null);
  const [kind, setKind] = useState<Kind>('phone');
  const [value, setValue] = useState('');
  const [pending, setPending] = useState<ContactChange | null>(null);
  const [code, setCode] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  useFocusEffect(
    useCallback(() => {
      meService
        .profile()
        .then(setProfile)
        .catch(() => {});
    }, [])
  );

  const step = done ? 3 : pending ? 2 : 1;
  const valid = kind === 'phone' ? phoneOk(value) : emailOk(value);

  const send = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      setPending(await meService.startContactChange(kind, value.trim()));
      setCode('');
    } catch (e) {
      setError(errText(e, "We couldn't send a code. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!pending || code.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await meService.verifyContactChange(pending.verification_id, code);
      await applyUser(res.user);
      setProfile(res.profile);
      setDone(true);
    } catch (e) {
      setError(errText(e, "That code didn't work. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!pending) return;
    setError(null);
    try {
      setPending(await meService.resendContactCode(pending.verification_id));
      setResent(true);
    } catch (e) {
      setError(errText(e, "We couldn't send a new code. Try again in a minute."));
    }
  };

  const nowPhone = maskPhone(profile?.phone_number);
  const label = kind === 'phone' ? 'phone number' : 'email';

  return (
    <GlassScreen>
      <GlassHeader
        title="Change email or phone"
        onBack={() => (pending && !done ? (setPending(null), setError(null)) : navigation.goBack())}
      />
      <View style={styles.bars} accessibilityLabel={`Step ${step} of 3`}>
        {[1, 2, 3].map(n => (
          <View key={n} style={[styles.bar, n <= step && styles.barOn]} />
        ))}
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 1 ? (
            <>
              <Text style={styles.title} accessibilityRole="header">
                What do you want to change?
              </Text>
              <Text style={styles.lead}>We'll send a code to the new one to make sure it's yours.</Text>
              <View style={styles.options}>
                <Option
                  on={kind === 'phone'}
                  title="Phone number"
                  sub={nowPhone ? `Now ${nowPhone}` : 'Not added yet'}
                  onPress={() => {
                    setKind('phone');
                    setValue('');
                    setError(null);
                  }}
                />
                <Option
                  on={kind === 'email'}
                  title="Email"
                  sub={profile?.email ? `Now ${profile.email}` : 'Not added yet'}
                  onPress={() => {
                    setKind('email');
                    setValue('');
                    setError(null);
                  }}
                />
              </View>
              <Text style={styles.label}>{kind === 'phone' ? 'New phone number' : 'New email'}</Text>
              <TextInput
                key={kind}
                value={value}
                onChangeText={t => {
                  setValue(t);
                  if (error) setError(null);
                }}
                placeholder={kind === 'phone' ? '0803 000 0000' : 'name@example.com'}
                placeholderTextColor={G.faint}
                keyboardType={kind === 'phone' ? 'phone-pad' : 'email-address'}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete={kind === 'phone' ? 'tel' : 'email'}
                textContentType={kind === 'phone' ? 'telephoneNumber' : 'emailAddress'}
                style={[styles.input, error && styles.inputError]}
                accessibilityLabel={kind === 'phone' ? 'New phone number' : 'New email'}
              />
            </>
          ) : step === 2 ? (
            <>
              <Text style={styles.title} accessibilityRole="header">
                Enter the code
              </Text>
              <Text style={styles.lead}>
                We sent a 6-digit code to {pending?.sent_to}. It works for {pending?.expires_in_minutes} minutes.
              </Text>
              <Text style={styles.label}>Code</Text>
              <TextInput
                value={code}
                onChangeText={t => {
                  setCode(t.replace(/\D/g, '').slice(0, 6));
                  if (error) setError(null);
                }}
                placeholder="000000"
                placeholderTextColor={G.faint}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                autoFocus
                style={[styles.input, styles.codeInput, error && styles.inputError]}
                accessibilityLabel="6-digit code"
              />
              <Pressable onPress={resend} disabled={resent} hitSlop={8} style={styles.resend} accessibilityRole="button">
                <Text style={[styles.link, resent && styles.linkOff]}>{resent ? 'New code sent' : 'Send a new code'}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title} accessibilityRole="header">
                Your {label} is updated
              </Text>
              <Text style={styles.lead}>
                {pending?.kind === 'email'
                  ? `We'll send receipts and codes to ${profile?.email} from now on.`
                  : `We'll use ${maskPhone(profile?.phone_number)} for delivery and codes from now on.`}{' '}
                If you didn't do this, contact support straight away.
              </Text>
            </>
          )}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </ScrollView>
        <FooterBar>
          {step === 1 ? (
            <PrimaryButton label={busy ? 'Sending…' : 'Send code'} onPress={send} disabled={!valid || busy} />
          ) : step === 2 ? (
            <PrimaryButton label={busy ? 'Checking…' : 'Confirm'} onPress={confirm} disabled={code.length !== 6 || busy} />
          ) : (
            <PrimaryButton label="Done" onPress={() => navigation.goBack()} />
          )}
        </FooterBar>
      </KeyboardAvoidingView>
    </GlassScreen>
  );
};

const Option: React.FC<{ on: boolean; title: string; sub: string; onPress: () => void }> = ({ on, title, sub, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && styles.pressed]}
    accessibilityRole="radio"
    accessibilityState={{ selected: on }}
  >
    <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
    <View style={styles.flex}>
      <Text style={styles.optionTitle}>{title}</Text>
      <Text style={styles.optionSub} numberOfLines={1}>
        {sub}
      </Text>
    </View>
  </Pressable>
);

/* ================= Profile photo ================= */

export const ProfilePhotoScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const applyUser = useApplyUser();
  const [profile, setProfile] = useState<PersonalProfile | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      meService
        .profile()
        .then(setProfile)
        .catch(e => toast(errText(e, "We couldn't load your photo."), 'error'));
    }, [])
  );

  const save = async (avatarUrl: string | null, done: string) => {
    const res = await meService.updateProfile({ avatar_url: avatarUrl });
    setProfile(res.profile);
    await applyUser(res.user);
    toast(done);
  };

  const upload = async (uri: string) => {
    setBusy(true);
    try {
      const [url] = await meService.uploadPhotos([uri]);
      if (!url) throw new Error("That photo didn't upload. Try another.");
      await save(url, 'Photo updated.');
    } catch (e) {
      toast(errText(e, "That photo didn't upload. Try again."), 'error');
    } finally {
      setBusy(false);
    }
  };

  const pick = async (from: 'camera' | 'library') => {
    try {
      if (from === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          toast('Allow camera access in Settings to take a photo.', 'error');
          return;
        }
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 };
      const res = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets[0]) return;
      await upload(res.assets[0].uri);
    } catch {
      toast(from === 'camera' ? "Your camera isn't available. Choose from your library instead." : "We couldn't open your photos.", 'error');
    }
  };

  const remove = () =>
    Alert.alert('Remove your photo?', 'Your initials show instead.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await save(null, 'Photo removed.');
          } catch (e) {
            toast(errText(e, "We couldn't remove it. Try again."), 'error');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  const photo = profile?.avatar_url ? mediaUrl(profile.avatar_url) : null;

  return (
    <GlassScreen>
      <GlassHeader title="Profile photo" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.photoBlock}>
          <View style={styles.bigAvatar}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.bigAvatarImg} accessibilityLabel="Your photo" />
            ) : (
              <Text style={styles.bigAvatarText}>{initials(profile?.full_name)}</Text>
            )}
            {busy ? <ActivityIndicator color={G.blue} style={StyleSheet.absoluteFill} /> : null}
          </View>
          <Text style={styles.photoNote}>Only you and our support team see your photo. Sellers never see it.</Text>
        </View>
        <GlassCard style={styles.menu}>
          <MenuItem label="Take a photo" onPress={() => pick('camera')} disabled={busy} />
          <MenuItem label="Choose from library" onPress={() => pick('library')} disabled={busy} last={!photo} />
          {photo ? <MenuItem label="Remove photo" danger onPress={remove} disabled={busy} last /> : null}
        </GlassCard>
      </ScrollView>
    </GlassScreen>
  );
};

const MenuItem: React.FC<{ label: string; onPress: () => void; danger?: boolean; disabled?: boolean; last?: boolean }> = ({
  label,
  onPress,
  danger,
  disabled,
  last,
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [styles.menuItem, !last && styles.menuRule, (pressed || disabled) && styles.pressed]}
    accessibilityRole="button"
  >
    <Text style={[styles.menuText, danger && styles.menuDanger]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },

  bars: { flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginBottom: 18 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.7)' },
  barOn: { backgroundColor: G.blue },

  title: { color: G.ink, fontSize: 26, lineHeight: 32, letterSpacing: -0.52, fontFamily: fonts.medium },
  lead: { color: G.muted, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular, marginTop: 6, marginBottom: 18 },
  options: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.56)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.75)',
  },
  optionOn: { borderColor: '#A9BBFF', backgroundColor: 'rgba(255,255,255,0.8)' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#C9CEDA', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: G.blue, backgroundColor: G.blue },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  optionTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  optionSub: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },

  label: { color: G.slate, fontSize: 14, fontFamily: fonts.medium, marginTop: 20, marginBottom: 8 },
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
  codeInput: { letterSpacing: 8, fontVariant: ['tabular-nums'] },
  inputError: { borderColor: '#D9536A' },
  errorText: { color: '#D9536A', fontSize: 13, lineHeight: 19, fontFamily: fonts.regular, marginTop: 8 },
  resend: { marginTop: 14, alignSelf: 'flex-start' },
  link: { color: G.blue600, fontSize: 14, fontFamily: fonts.medium },
  linkOff: { color: G.muted },

  photoBlock: { alignItems: 'center', marginTop: 8, marginBottom: 20 },
  bigAvatar: {
    width: 136,
    height: 136,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bigAvatarImg: { width: '100%', height: '100%' },
  bigAvatarText: { color: G.blue, fontSize: 40, fontFamily: fonts.medium },
  photoNote: { color: G.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, textAlign: 'center', marginTop: 16, paddingHorizontal: 24 },
  menu: { paddingHorizontal: 0 },
  menuItem: { height: 56, justifyContent: 'center', paddingHorizontal: 18 },
  menuRule: { borderBottomWidth: 1, borderBottomColor: G.line },
  menuText: { color: G.ink, fontSize: 16, fontFamily: fonts.regular },
  menuDanger: { color: '#D9536A' },
});
