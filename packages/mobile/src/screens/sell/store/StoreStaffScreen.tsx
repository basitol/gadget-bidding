import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { G, GlassScreen, GlassHeader, GlassCard, Chip, PrimaryButton } from '../../../components/glass';
import { Field, TextField } from '../../../components/auth/GlassAuthKit';
import { BottomSheet } from '../../../components/motion';
import { fonts } from '../../../constants';
import { sellerStoreService, StoreStaffList, StaffIdType, shortDay } from '../../../services/sellerStore.service';
import { initialsOf } from '../../buyer/categories';
import { Note, TINT } from '../onboarding/kit';
import { LoadingScreen, toast, errText, s as shared } from './shared';

const isPhone = (v: string) => /^(\+?234|0)?[789][01]\d{8}$/.test(v.replace(/[\s-]/g, ''));
const nameProblem = (v: string) =>
  v.trim().split(/\s+/).filter(Boolean).length < 2 ? 'Enter their first and last name, as on their ID.' : null;
const phoneProblem = (v: string) => (isPhone(v) ? null : 'Enter a Nigerian mobile number, like 0803 000 0000.');
const emailProblem = (v: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? null : 'Enter their email address. They sign in with it.';

type Person = StoreStaffList['staff'][number];
const STATUS: Record<Person['status'], { label: (p: Person) => string; tone: { bg: string; text: string } }> = {
  invited: {
    label: p => (p.invite_sent_at ? 'Invite sent' : "Invite didn't send"),
    tone: TINT.amber,
  },
  joined: {
    label: p => (p.joined_at ? `Signed in · joined ${shortDay(p.joined_at)}` : 'Signed in'),
    tone: TINT.green,
  },
  no_email: {
    label: () => "No email · can't sign in",
    tone: { bg: TINT.fill, text: G.slate },
  },
};

/** "driver's licence", but "NIN slip" stays as it is. */
const inSentence = (label: string) =>
  /^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label;

/** People who can drop off and collect at the hub for this store. Hub staff check their ID and code. */
export const StoreStaffScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [data, setData] = useState<StoreStaffList | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [idType, setIdType] = useState<StaffIdType | null>(null);
  const [errors, setErrors] = useState<{
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    id?: string | null;
  }>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    try {
      setData(await sellerStoreService.staff());
    } catch (e) {
      setFailed(errText(e, "Couldn't load your staff"));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!data)
    return <LoadingScreen title="Store staff" onBack={() => navigation.goBack()} failed={failed} onRetry={load} />;

  const full = data.staff.length >= data.max;
  const owner = data.owner.full_name;

  const openAdd = () => {
    setName('');
    setEmail('');
    setPhone('');
    setIdType(null);
    setErrors({});
    setAdding(true);
  };

  const add = async () => {
    const next = {
      name: nameProblem(name),
      email: emailProblem(email),
      phone: phoneProblem(phone),
      id: idType ? null : "Choose the ID they'll show at the hub.",
    };
    setErrors(next);
    if (next.name || next.email || next.phone || next.id || !idType) return;
    setBusy('add');
    const to = email.trim().toLowerCase();
    try {
      const res = await sellerStoreService.addStaff({
        full_name: name.trim(),
        email: to,
        phone: phone.trim(),
        id_type: idType,
      });
      setData(res);
      setAdding(false);
      if (res.invite_sent === false)
        toast(`${name.trim()} is added, but the invite email didn't send. Tap Resend invite.`);
      else toast(`Invite sent to ${to}`, 'success');
    } catch (e) {
      const message = errText(e);
      if (/email|account/i.test(message)) setErrors({ email: message });
      else if (/number/i.test(message)) setErrors({ phone: message });
      else if (/name/i.test(message)) setErrors({ name: message });
      else if (/\bID\b/.test(message)) setErrors({ id: message });
      else toast(message);
    } finally {
      setBusy(null);
    }
  };

  const resend = async (p: Person) => {
    setBusy(`invite:${p.id}`);
    try {
      setData(await sellerStoreService.resendInvite(p.id));
      toast(`Invite sent again to ${p.email}`, 'success');
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = (id: string, who: string) =>
    Alert.alert(
      `Remove ${who}?`,
      "Their sign-in and hub code stop working straight away. They won't be able to drop off or collect for your store.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusy(id);
            try {
              setData(await sellerStoreService.removeStaff(id));
              toast(`${who} was removed.`, 'success');
            } catch (e) {
              toast(errText(e));
              load();
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );

  return (
    <GlassScreen>
      <GlassHeader title="Store staff" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={shared.content}>
        <Text style={styles.title} accessibilityRole="header">
          Store staff
        </Text>
        <Text style={styles.sub}>
          People who can drop off and collect gadgets at the hub
          {data.business_name ? ` for ${data.business_name}` : ''}. They sign in with their own email, and hub staff
          check their ID.
        </Text>

        <GlassCard style={styles.person}>
          <Initials name={owner || data.business_name || 'Owner'} />
          <View style={shared.flex}>
            <Text style={styles.name}>{owner || 'You'}</Text>
            <Text style={styles.meta}>Owner · ID on file</Text>
          </View>
          <View style={styles.ownerChip}>
            <Text style={styles.ownerChipText}>Owner</Text>
          </View>
        </GlassCard>

        {data.staff.map(p => (
          <GlassCard key={p.id} style={styles.person}>
            <Initials name={p.full_name} />
            <View style={shared.flex}>
              <Text style={styles.name}>{p.full_name}</Text>
              {p.email ? (
                <Text style={styles.meta} numberOfLines={1}>
                  {p.email}
                </Text>
              ) : null}
              <Text style={styles.meta}>
                {['Staff', p.id_label ? inSentence(p.id_label) : null, `added ${shortDay(p.added_at)}`]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              <View style={styles.statusRow}>
                <View style={[styles.status, { backgroundColor: STATUS[p.status].tone.bg }]}>
                  <Text style={[styles.statusText, { color: STATUS[p.status].tone.text }]}>
                    {STATUS[p.status].label(p)}
                  </Text>
                </View>
                {p.status === 'invited' ? (
                  <Pressable
                    onPress={() => resend(p)}
                    disabled={busy === `invite:${p.id}`}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Resend invite to ${p.full_name}`}
                  >
                    {busy === `invite:${p.id}` ? (
                      <ActivityIndicator size="small" color={G.blue} />
                    ) : (
                      <Text style={styles.resend}>Resend invite</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
            </View>
            <Pressable
              onPress={() => remove(p.id, p.full_name)}
              disabled={busy === p.id}
              style={({ pressed }) => [styles.remove, pressed && shared.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${p.full_name}`}
              hitSlop={4}
            >
              {busy === p.id ? (
                <ActivityIndicator size="small" color={G.red} />
              ) : (
                <Text style={styles.removeText}>Remove</Text>
              )}
            </Pressable>
          </GlassCard>
        ))}

        <Pressable
          onPress={openAdd}
          disabled={full}
          style={({ pressed }) => [styles.addCard, full && styles.addCardOff, pressed && shared.pressed]}
          accessibilityRole="button"
          accessibilityState={{ disabled: full }}
        >
          <Text style={[styles.addText, full && styles.addTextOff]}>+ Add a staff member</Text>
        </Pressable>
        {full ? (
          <Text style={styles.reason}>{`You can have up to ${data.max}. Remove someone to add another.`}</Text>
        ) : null}

        <Note style={styles.note}>
          Staff sign in with their own email and see only what to drop off and collect. They can't see your payouts or
          change your store.
        </Note>
      </ScrollView>

      <BottomSheet visible={adding} onClose={() => !busy && setAdding(false)}>
        <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.sheetTitle}>Add a staff member</Text>
          <Text style={styles.sheetSub}>
            We'll email them an invite to set up their sign-in. They can then drop off and collect at the hub for your
            store.
          </Text>
          <Field label="Full name" error={errors.name}>
            <TextField
              value={name}
              onChangeText={v => {
                setName(v);
                if (errors.name && !nameProblem(v)) setErrors(e => ({ ...e, name: null }));
              }}
              onBlur={() => name && setErrors(e => ({ ...e, name: nameProblem(name) }))}
              placeholder="As on their ID"
              autoCapitalize="words"
              autoComplete="off"
              textContentType="name"
              invalid={!!errors.name}
              accessibilityLabel="Full name"
            />
          </Field>
          <Field label="Email" error={errors.email}>
            <TextField
              value={email}
              onChangeText={v => {
                setEmail(v);
                if (errors.email && !emailProblem(v)) setErrors(e => ({ ...e, email: null }));
              }}
              onBlur={() => email && setErrors(e => ({ ...e, email: emailProblem(email) }))}
              placeholder="They sign in with this"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              textContentType="emailAddress"
              invalid={!!errors.email}
              accessibilityLabel="Email"
            />
          </Field>
          <Field label="Mobile number" error={errors.phone}>
            <TextField
              value={phone}
              onChangeText={v => {
                setPhone(v);
                if (errors.phone && !phoneProblem(v)) setErrors(e => ({ ...e, phone: null }));
              }}
              onBlur={() => phone && setErrors(e => ({ ...e, phone: phoneProblem(phone) }))}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              placeholder="0803 000 0000"
              maxLength={20}
              invalid={!!errors.phone}
              accessibilityLabel="Mobile number"
            />
          </Field>
          <Text style={styles.fieldLabel}>ID they'll show</Text>
          <View style={styles.chips}>
            {data.id_types.map(t => (
              <Chip
                key={t.key}
                label={t.label}
                selected={idType === t.key}
                onPress={() => {
                  setIdType(t.key);
                  setErrors(e => ({ ...e, id: null }));
                }}
              />
            ))}
          </View>
          {errors.id ? <Text style={styles.error}>{errors.id}</Text> : null}
          <Note style={styles.sheetNote}>
            Staff can't see your payouts or change your store. Their hub code comes with the invite.
          </Note>
          <PrimaryButton
            label={busy === 'add' ? 'Adding…' : 'Add and send invite'}
            onPress={add}
            disabled={busy === 'add'}
            style={styles.sheetButton}
          />
        </ScrollView>
      </BottomSheet>
    </GlassScreen>
  );
};

const Initials: React.FC<{ name: string }> = ({ name }) => (
  <View style={styles.avatar}>
    <Text style={styles.avatarText}>{initialsOf(name)}</Text>
  </View>
);

const styles = StyleSheet.create({
  title: {
    color: G.ink,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.5,
    fontFamily: fonts.medium,
    marginTop: 8,
  },
  sub: {
    color: G.muted,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.regular,
    marginTop: 8,
    marginBottom: 20,
  },

  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    marginBottom: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: TINT.violet.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: TINT.violet.text,
    fontSize: 15,
    fontFamily: fonts.medium,
  },
  name: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  meta: {
    color: G.muted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.regular,
    marginTop: 2,
  },
  ownerChip: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: TINT.fill,
    justifyContent: 'center',
  },
  ownerChipText: { color: G.slate, fontSize: 14, fontFamily: fonts.medium },
  remove: {
    height: 36,
    minWidth: 80,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: G.red,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: G.red, fontSize: 14, fontFamily: fonts.medium },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  status: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusText: { fontSize: 12, fontFamily: fonts.medium },
  resend: { color: G.blue600, fontSize: 13, fontFamily: fonts.medium },

  addCard: {
    height: 56,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(79,123,255,0.45)',
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCardOff: { borderColor: 'rgba(28,31,42,0.12)' },
  addText: { color: G.blue600, fontSize: 16, fontFamily: fonts.medium },
  addTextOff: { color: G.faint },
  reason: {
    color: G.muted,
    fontSize: 13,
    fontFamily: fonts.regular,
    textAlign: 'center',
    marginTop: 8,
  },
  note: { marginTop: 16 },

  sheetScroll: { flexGrow: 0 },
  sheetTitle: {
    color: G.ink,
    fontSize: 19,
    letterSpacing: -0.2,
    fontFamily: fonts.medium,
  },
  sheetSub: {
    color: G.muted,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.regular,
    marginTop: 4,
    marginBottom: 16,
  },
  fieldLabel: {
    color: G.slate,
    fontSize: 14,
    fontFamily: fonts.medium,
    marginBottom: 8,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: {
    color: G.red,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.regular,
    marginTop: 8,
  },
  sheetNote: {
    marginTop: 16,
    backgroundColor: TINT.fill,
    borderColor: TINT.fill,
  },
  sheetButton: { marginTop: 16 },
});
