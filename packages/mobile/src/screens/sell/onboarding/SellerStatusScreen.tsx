import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  AppState,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  FooterBar,
  PrimaryButton,
  SecondaryButton,
  TextButton,
} from '../../../components/glass';
import { TextField } from '../../../components/auth/GlassAuthKit';
import { fonts } from '../../../constants';
import { api, getErrorMessage } from '../../../services';
import { useAuthStore } from '../../../store';
import { useToastStore } from '../../../store/toastStore';
import {
  sellerApplicationService as svc,
  SellerApplication,
  DocumentKind,
  PickedFile,
  pickDocumentPdf,
  pickDocumentPhoto,
  takeDocumentPhoto,
} from '../../../services/sellerApplication.service';
import { DocumentRow, Hero, ICONS, Label, ListRow, Note, RowButton, TINT, Ticks, Timeline, whenLabel } from './kit';

const toast = (m: string, t: 'success' | 'error' = 'error') => useToastStore.getState().show(m, t);
const msg = (e: unknown) => (e instanceof Error ? e.message : "That didn't work. Try again.");

type PayoutAccount = { bank_name: string; account_number_last4: string } | null;

/**
 * Where a seller's application stands: Under review, Approved, Needs more info or Not approved.
 * Opens first in the seller app until they're approved and have seen "You're approved!".
 */
export const SellerStatusScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user, setUser } = useAuthStore();
  const [app, setApp] = useState<SellerApplication | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payout, setPayout] = useState<PayoutAccount | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const a = await svc.get();
      setError(null);
      if (a.status === 'draft') {
        navigation.replace('SellerApply', { resume: true });
        return;
      }
      setApp(a);
      // Keep the saved account in step (listing checks read it).
      svc.account().then(setUser).catch(() => {});
      if (a.status === 'approved') {
        api
          .get('/seller/payout-account')
          .then(r => setPayout((r.data?.data as PayoutAccount) ?? null))
          .catch(() => setPayout(null));
      }
    } catch (e) {
      setError(msg(e));
    }
  }, [navigation, setUser]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  // A decision can land while the app is in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => s === 'active' && load());
    return () => sub.remove();
  }, [load]);

  const toHome = () => navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      tintColor={G.blue}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
    />
  );

  if (!app) {
    return (
      <GlassScreen>
        <GlassHeader title="Your application" onBack={toHome} />
        <View style={styles.center}>
          {error ? (
            <>
              <Text style={styles.errorText}>{error}</Text>
              <TextButton label="Try again" onPress={load} />
            </>
          ) : (
            <ActivityIndicator color={G.blue} />
          )}
        </View>
      </GlassScreen>
    );
  }

  if (app.status === 'approved') {
    const finish = (to: 'list' | 'home') => {
      svc.markSeen().catch(() => {});
      navigation.reset({
        index: to === 'list' ? 1 : 0,
        routes: to === 'list' ? [{ name: 'MainTabs' }, { name: 'CreateGadget' }] : [{ name: 'MainTabs' }],
      });
    };
    const twoStepOn = !!user?.two_factor_enabled;
    return (
      <GlassScreen edges={['top']}>
        <GlassHeader title="Approved" />
        <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl} showsVerticalScrollIndicator={false}>
          <Hero
            icon={ICONS.store}
            tint={TINT.green.bg}
            title="You're approved!"
            sub={`Your business is verified. Buyers will see you as Verified seller ${app.seller_code}.`}
          />
          <GlassCard style={styles.card}>
            <ListRow
              icon={
                <View style={[styles.tile, { backgroundColor: TINT.violet.bg }]}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={TINT.violet.text} />
                </View>
              }
              title={`Seller ID ${app.seller_code}`}
              sub="What buyers see instead of your name"
              last
            />
          </GlassCard>

          <Label style={styles.label}>2 things before your first sale</Label>
          <GlassCard style={styles.card}>
            <ListRow
              icon={<StepTile n={1} done={!!payout} />}
              title="Add your payout account"
              sub={payout ? `Done · ${payout.bank_name} ••••${payout.account_number_last4}` : 'Must be in your registered business name'}
              subColor={payout ? G.green : undefined}
              right={<Ionicons name="chevron-forward" size={16} color={G.faint} />}
              onPress={() => navigation.navigate('PayoutAccount')}
            />
            <ListRow
              icon={<StepTile n={2} done={twoStepOn} />}
              title="Turn on 2-step sign-in"
              sub={twoStepOn ? 'Done · on for this account' : 'Required before your first payout'}
              subColor={twoStepOn ? G.green : undefined}
              right={<Ionicons name="chevron-forward" size={16} color={G.faint} />}
              onPress={() => navigation.navigate('TwoStepSetup')}
              last
            />
          </GlassCard>
        </ScrollView>
        <FooterBar>
          <PrimaryButton label="List your first gadget" onPress={() => finish('list')} />
          <TextButton label="Go to seller home" onPress={() => finish('home')} />
        </FooterBar>
      </GlassScreen>
    );
  }

  if (app.status === 'needs_info') return <NeedsInfo app={app} setApp={setApp} navigation={navigation} toHome={toHome} refreshControl={refreshControl} />;

  if (app.status === 'rejected') {
    const reapplyOpen = !!app.reapply_at && Date.now() >= new Date(app.reapply_at).getTime();
    const reapplyDay = app.reapply_at
      ? new Date(app.reapply_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
      : null;
    const askAgain = () =>
      Alert.alert(
        'Ask for a second review?',
        "Someone else on our team will look at your application again. It usually takes 1–2 working days.",
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Ask',
            onPress: async () => {
              setBusy(true);
              try {
                setApp(await svc.secondReview());
                toast("We'll look again", 'success');
              } catch (e) {
                toast(msg(e));
              } finally {
                setBusy(false);
              }
            },
          },
        ]
      );
    const reapply = async () => {
      setBusy(true);
      try {
        await svc.reapply();
        navigation.replace('SellerApply', { resume: true });
      } catch (e) {
        toast(msg(e));
      } finally {
        setBusy(false);
      }
    };
    return (
      <GlassScreen edges={['top']}>
        <GlassHeader title="Not approved" />
        <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl} showsVerticalScrollIndicator={false}>
          <Hero
            icon={ICONS.idcard}
            tint={TINT.red.bg}
            title="We couldn't approve your business"
            sub="We're sorry. Here's why, and what you can do next."
          />
          <GlassCard style={styles.reason}>
            <Text style={styles.reasonLabel}>Reason</Text>
            <Text style={styles.reasonText}>{app.reject_reason}</Text>
          </GlassCard>
          <Label style={styles.label}>What you can do</Label>
          <Ticks
            items={[
              `Check your RC or BN number with CAC and apply again after 30 days${reapplyDay && !reapplyOpen ? ` (from ${reapplyDay})` : ''}`,
              'If your shop moves to Computer Village, apply again any time',
              app.can_request_second_review ? 'Think we got it wrong? Ask for a second review' : 'Questions? Ask our team',
            ]}
          />
        </ScrollView>
        <FooterBar>
          {app.can_request_second_review ? (
            <PrimaryButton label="Ask for a second review" onPress={askAgain} disabled={busy} />
          ) : reapplyOpen ? (
            <PrimaryButton label="Apply again" onPress={reapply} disabled={busy} />
          ) : (
            <SecondaryButton label="Ask our team a question" onPress={() => navigation.navigate('SupportChat')} />
          )}
          <TextButton label="Back to start" onPress={toHome} />
        </FooterBar>
      </GlassScreen>
    );
  }

  // In review (first look, a fix sent back, or a second review).
  const numberDone = app.number_check === 'matched';
  const docsDone = app.documents.every(d => d.status === 'accepted');
  return (
    <GlassScreen edges={['top']}>
      <GlassHeader title="Under review" />
      <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl} showsVerticalScrollIndicator={false}>
        <Hero
          icon={ICONS.idcard}
          title="We're checking your business"
          sub="This usually takes 1–2 working days. We'll email you and send a notification as soon as it's done."
        />
        {app.second_review_requested_at ? (
          <Note style={styles.noteGap}>
            {`You asked for a second review ${whenLabel(app.second_review_requested_at).toLowerCase()}. Someone else on our team is looking again.`}
          </Note>
        ) : app.resubmitted_at ? (
          <Note style={styles.noteGap}>{`We got your fix ${whenLabel(app.resubmitted_at).toLowerCase()}. It kept its place in the queue.`}</Note>
        ) : null}
        <Timeline
          steps={[
            { title: 'Application sent', sub: whenLabel(app.submitted_at), state: 'done' },
            {
              title: 'CAC number matched',
              sub: numberDone ? 'Checked by our team' : 'Our team checks it with CAC',
              state: numberDone ? 'done' : 'current',
            },
            {
              title: 'Documents reviewed',
              sub: 'By our verification team',
              state: numberDone && docsDone ? 'done' : numberDone ? 'current' : 'todo',
            },
            { title: 'Approved', sub: 'Then add your payout account and list', state: 'todo' },
          ]}
        />
        <GlassCard style={[styles.checkCard]}>
          <Text style={styles.checkTitle}>What we check</Text>
          <Ticks
            items={[
              'Your CAC certificate matches the number you gave',
              "The owner's ID matches the certificate",
              'Your shop is in Computer Village',
            ]}
          />
        </GlassCard>
      </ScrollView>
      <FooterBar>
        <SecondaryButton label="Close" onPress={toHome} />
      </FooterBar>
    </GlassScreen>
  );
};

const StepTile: React.FC<{ n: number; done: boolean }> = ({ n, done }) => (
  <View style={[styles.tile, { backgroundColor: done ? TINT.green.bg : TINT.blue.bg }]}>
    {done ? <Ionicons name="checkmark" size={16} color={G.green} /> : <Text style={styles.tileNumber}>{n}</Text>}
  </View>
);

/** "One more thing": the team's note, what to fix, and what's already accepted. */
const NeedsInfo: React.FC<{
  app: SellerApplication;
  setApp: (a: SellerApplication) => void;
  navigation: any;
  toHome: () => void;
  refreshControl: React.ReactElement<React.ComponentProps<typeof RefreshControl>>;
}> = ({ app, setApp, navigation, toHome, refreshControl }) => {
  const [uploading, setUploading] = useState<DocumentKind | null>(null);
  const [number, setNumber] = useState(app.registration_number ?? '');
  const [savingNumber, setSavingNumber] = useState(false);
  const [sending, setSending] = useState(false);

  // In this state every document was either accepted or flagged; a "submitted" one is a fix already sent.
  const toFix = app.documents.filter(d => d.status === 'needs_fix' || d.status === 'submitted');
  const accepted = app.documents.filter(d => d.status === 'accepted');
  const numberFlagged = app.number_check !== 'matched';
  const numberName = app.registration_type === 'bn' ? 'BN number' : 'RC number';
  const ready = !app.documents.some(d => d.status === 'needs_fix') && app.number_check !== 'not_matched';

  const upload = async (kind: DocumentKind, pick: () => Promise<PickedFile | null>) => {
    let file: PickedFile | null;
    try {
      file = await pick();
    } catch (e) {
      toast(msg(e));
      return;
    }
    if (!file) return;
    setUploading(kind);
    try {
      setApp(await svc.uploadDocument(kind, file));
    } catch (e) {
      toast(msg(e));
    } finally {
      setUploading(null);
    }
  };

  const chooseFile = (kind: DocumentKind, label: string) => {
    const choices: [string, () => Promise<PickedFile | null>][] = [
      ['Take a photo', takeDocumentPhoto],
      ['Choose a photo', pickDocumentPhoto],
      ['Choose a PDF', pickDocumentPdf],
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: label, options: [...choices.map(c => c[0]), 'Cancel'], cancelButtonIndex: choices.length },
        i => {
          if (i < choices.length) upload(kind, choices[i][1]);
        }
      );
    } else {
      Alert.alert(label, undefined, [
        ...choices.map(([text, fn]) => ({ text, onPress: () => upload(kind, fn) })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  };

  const saveNumber = async () => {
    setSavingNumber(true);
    try {
      setApp(await svc.update({ registration_number: number }));
      toast('Number updated', 'success');
    } catch (e) {
      toast(getErrorMessage(e) || msg(e));
    } finally {
      setSavingNumber(false);
    }
  };

  const send = async () => {
    setSending(true);
    try {
      setApp(await svc.resubmit());
    } catch (e) {
      toast(msg(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <GlassScreen edges={['top']}>
      <GlassHeader title="Needs more info" onBack={toHome} />
      <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Hero
          icon={ICONS.idcard}
          tint={TINT.amber.bg}
          title="One more thing"
          sub="We couldn't finish checking your business. Fix the item below and send it back — it won't start a new queue."
        />
        {app.team_note ? (
          <Note tone="amber" title="Note from our team">
            {`“${app.team_note}”`}
          </Note>
        ) : null}

        <Label style={styles.label}>To fix</Label>
        {toFix.map(d => (
          <GlassCard key={d.kind} style={[styles.card, styles.gap, d.status === 'needs_fix' && styles.fixCard]}>
            <DocumentRow doc={d} busy={uploading === d.kind} onUpload={() => chooseFile(d.kind, d.label)} last />
          </GlassCard>
        ))}
        {numberFlagged ? (
          <GlassCard style={[styles.numberCard, styles.gap, app.number_check === 'not_matched' && styles.fixCard]}>
            <Text style={styles.numberTitle}>{numberName}</Text>
            <Text style={[styles.numberSub, app.number_check === 'not_matched' && { color: G.red }]}>
              {app.number_check === 'not_matched'
                ? "It didn't match the CAC register. Check it and enter it again."
                : `Updated · ${numberName.slice(0, 2)} ${app.registration_number}`}
            </Text>
            <View style={styles.numberRow}>
              <View style={styles.flex}>
                <TextField value={number} onChangeText={setNumber} keyboardType="number-pad" placeholder="e.g. 1234567" maxLength={12} />
              </View>
              <RowButton
                label="Save"
                onPress={saveNumber}
                busy={savingNumber}
                disabled={!number.trim() || number.replace(/\D/g, '') === app.registration_number}
              />
            </View>
          </GlassCard>
        ) : null}

        {accepted.length || !numberFlagged ? (
          <>
            <Label style={styles.label}>Already accepted</Label>
            <GlassCard style={styles.card}>
              {accepted.map((d, i) => (
                <AcceptedRow key={d.kind} label={d.label} value="Accepted" last={i === accepted.length - 1 && numberFlagged} />
              ))}
              {!numberFlagged ? <AcceptedRow label={numberName} value="Matched" last /> : null}
            </GlassCard>
          </>
        ) : null}
      </ScrollView>
      <FooterBar>
        <PrimaryButton label={sending ? 'Sending…' : 'Send for review'} onPress={send} disabled={!ready || sending || !!uploading} />
        <TextButton label="Ask our team a question" onPress={() => navigation.navigate('SupportChat')} />
      </FooterBar>
    </GlassScreen>
  );
};

const AcceptedRow: React.FC<{ label: string; value: string; last?: boolean }> = ({ label, value, last }) => (
  <View style={[styles.acceptedRow, !last && styles.rowLine]}>
    <Text style={styles.acceptedLabel}>{label}</Text>
    <View style={styles.acceptedValue}>
      <Ionicons name="checkmark" size={14} color={G.green} />
      <Text style={styles.acceptedText}>{value}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  errorText: { color: G.slate, fontSize: 15, fontFamily: fonts.regular, textAlign: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  card: { overflow: 'hidden' },
  gap: { marginBottom: 10 },
  label: { marginTop: 24, marginBottom: 12 },
  noteGap: { marginBottom: 14 },
  tile: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  tileNumber: { color: G.blue600, fontSize: 15, fontFamily: fonts.medium },
  reason: { padding: 16, gap: 6 },
  reasonLabel: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  reasonText: { color: G.slate, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  checkCard: { padding: 16, gap: 12, marginTop: 14 },
  checkTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  fixCard: { borderColor: 'rgba(217,83,106,0.25)', borderWidth: 1 },
  numberCard: { padding: 14, gap: 4 },
  numberTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  numberSub: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
  numberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  acceptedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(28,31,42,0.08)' },
  acceptedLabel: { color: G.slate, fontSize: 14, fontFamily: fonts.regular },
  acceptedValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  acceptedText: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
});
