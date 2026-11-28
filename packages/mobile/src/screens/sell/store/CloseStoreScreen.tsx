import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { G, GlassScreen, GlassHeader, GlassCard, FooterBar, SecondaryButton } from '../../../components/glass';
import { Field, PasswordField } from '../../../components/auth/GlassAuthKit';
import { BottomSheet } from '../../../components/motion';
import { fonts } from '../../../constants';
import api, { getErrorMessage } from '../../../services/api';
import { useAuthStore } from '../../../store';
import { TINT } from '../onboarding/kit';
import { LoadingScreen, toast, errText, s as shared } from './shared';

/** GET / POST /seller/close */
type ChecklistItem = {
  key: 'auctions' | 'orders' | 'disputes' | 'payouts';
  title: string;
  ok: boolean;
  sub: string;
  count: number;
  action: { label: string; target: 'listings' | 'orders' | 'case'; dispute_id?: string } | null;
};
type Checklist = { closed_at: string | null; can_close: boolean; items: ChecklistItem[] };

const closeApi = {
  checklist: async (): Promise<Checklist> => {
    try {
      return (await api.get('/seller/close')).data.data;
    } catch (e) {
      throw new Error(getErrorMessage(e));
    }
  },
  close: async (password: string): Promise<{ closed_at: string }> => {
    try {
      return (await api.post('/seller/close', { password })).data.data;
    } catch (e) {
      throw new Error(getErrorMessage(e));
    }
  },
};

const RED_LINE = 'rgba(217,83,106,0.35)';

/** A row: amber "!" while it still has to finish, green tick when it's done; a link to go and finish it. */
const CheckRow: React.FC<{ item: ChecklistItem; last: boolean; onAction: () => void }> = ({ item, last, onAction }) => (
  <View
    style={[styles.row, !last && shared.divider]}
    accessible={!item.action}
    accessibilityLabel={`${item.title}. ${item.sub}. ${item.ok ? 'Done' : 'Still to finish'}`}
  >
    <View style={[styles.mark, { backgroundColor: item.ok ? TINT.green.bg : TINT.amber.bg }]}>
      {item.ok ? (
        <Ionicons name="checkmark" size={16} color={G.green} />
      ) : (
        <Text style={styles.markText}>!</Text>
      )}
    </View>
    <View style={shared.flex}>
      <Text style={styles.rowTitle}>{item.title}</Text>
      <Text style={styles.rowSub}>{item.sub}</Text>
    </View>
    {item.action ? (
      <Pressable
        onPress={onAction}
        hitSlop={8}
        style={({ pressed }) => [styles.link, pressed && shared.pressed]}
        accessibilityRole="link"
        accessibilityLabel={`${item.action.label}: ${item.title}`}
      >
        <Text style={styles.linkText}>{item.action.label}</Text>
      </Pressable>
    ) : null}
  </View>
);

/**
 * Store › Close my store. Everything in progress has to finish first (live auctions, orders, open
 * cases); payouts already due are still paid at 6 pm. Closing asks for the password, signs the
 * seller out everywhere, and only our team can reopen the store.
 */
export const CloseStoreScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [data, setData] = useState<Checklist | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const logout = useAuthStore(st => st.logout);

  const load = useCallback(async () => {
    setFailed(null);
    try {
      setData(await closeApi.checklist());
    } catch (e) {
      setFailed(errText(e, "Couldn't load your store"));
    }
  }, []);

  useEffect(() => {
    load();
    // Back from ending an auction or a case: check again.
    return navigation.addListener?.('focus', load);
  }, [load, navigation]);

  if (!data) return <LoadingScreen title="Close my store" onBack={() => navigation.goBack()} failed={failed} onRetry={load} />;

  const go = (item: ChecklistItem) => {
    const a = item.action;
    if (!a) return;
    if (a.target === 'listings') navigation.navigate('MainTabs', { screen: 'Listings' });
    else if (a.target === 'orders') navigation.navigate('MainTabs', { screen: 'Orders' });
    else if (a.dispute_id) navigation.navigate('SellerCase', { disputeId: a.dispute_id });
  };

  const openConfirm = () => {
    setPassword('');
    setError(null);
    setConfirming(true);
  };

  const close = async () => {
    if (!password) {
      setError('Enter your password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await closeApi.close(password);
      setConfirming(false);
      toast("Your store is closed. We'll pay what's due at 6 pm.", 'success');
      // The server signed this account out everywhere; finish it here too.
      await logout();
    } catch (e) {
      const msg = errText(e);
      setError(msg);
      // Something started meanwhile: show the list again.
      if (!/password/i.test(msg)) load();
    } finally {
      setBusy(false);
    }
  };

  const blocked = !data.can_close;

  return (
    <GlassScreen>
      <GlassHeader title="Close my store" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={shared.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={G.blue}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <Text style={styles.title} accessibilityRole="header">
          Close your store
        </Text>
        <Text style={styles.sub}>Before we can close it, everything in progress has to finish.</Text>

        <GlassCard style={shared.group}>
          {data.items.map((item, i) => (
            <CheckRow key={item.key} item={item} last={i === data.items.length - 1} onAction={() => go(item)} />
          ))}
        </GlassCard>
      </ScrollView>

      <FooterBar>
        {blocked ? <Text style={styles.reason}>Finish the items marked ! first, then you can close.</Text> : null}
        <Pressable
          onPress={openConfirm}
          disabled={blocked}
          style={({ pressed }) => [styles.danger, blocked && styles.dangerOff, pressed && !blocked && shared.pressed]}
          accessibilityRole="button"
          accessibilityState={{ disabled: blocked }}
          accessibilityHint={blocked ? 'Finish the items above first' : undefined}
        >
          <Text style={[styles.dangerText, blocked && styles.dangerTextOff]}>Close my store</Text>
        </Pressable>
      </FooterBar>

      <BottomSheet visible={confirming} onClose={() => !busy && setConfirming(false)} style={styles.sheet}>
        <Text style={styles.sheetTitle} accessibilityRole="header">
          Close your store?
        </Text>
        <View style={styles.points}>
          {[
            'Your listings stop, and you can’t log in to sell any more.',
            'Your store staff can’t sign in or use the hub for you.',
            'Money you’re owed is still paid to your payout account at 6 pm.',
            'To sell again, contact us and we’ll reopen your store.',
          ].map(p => (
            <View key={p} style={styles.point}>
              <View style={styles.dot} />
              <Text style={styles.pointText}>{p}</Text>
            </View>
          ))}
        </View>
        <Field label="Your password" error={error}>
          <PasswordField
            value={password}
            onChangeText={v => {
              setPassword(v);
              if (error) setError(null);
            }}
            onSubmitEditing={close}
            returnKeyType="done"
            autoComplete="current-password"
            textContentType="password"
            invalid={!!error}
            accessibilityLabel="Your password"
            textToggle
          />
        </Field>
        <View style={styles.sheetButtons}>
          <SecondaryButton label="Cancel" onPress={() => setConfirming(false)} disabled={busy} style={styles.sheetButton} />
          <Pressable
            onPress={close}
            disabled={busy}
            style={({ pressed }) => [styles.danger, styles.sheetButton, pressed && shared.pressed]}
            accessibilityRole="button"
            accessibilityState={{ busy }}
          >
            {busy ? <ActivityIndicator color={G.red} /> : <Text style={styles.dangerText}>Close my store</Text>}
          </Pressable>
        </View>
      </BottomSheet>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  title: { color: G.ink, fontSize: 26, lineHeight: 32, letterSpacing: -0.5, fontFamily: fonts.medium, marginTop: 8 },
  sub: { color: G.slate, fontSize: 16, lineHeight: 24, fontFamily: fonts.regular, marginTop: 8, marginBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 16 },
  mark: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  markText: { color: TINT.amber.text, fontSize: 16, fontFamily: fonts.medium },
  rowTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  rowSub: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, marginTop: 2 },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { color: G.blue600, fontSize: 15, fontFamily: fonts.medium },
  reason: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center', marginBottom: 10 },
  danger: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: G.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerOff: { backgroundColor: TINT.fill, borderColor: TINT.fill },
  dangerText: { color: G.red, fontSize: 16, fontFamily: fonts.medium },
  dangerTextOff: { color: G.faint },
  sheet: {
    backgroundColor: TINT.red.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: RED_LINE,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 36,
  },
  sheetTitle: { color: G.ink, fontSize: 19, letterSpacing: -0.2, fontFamily: fonts.medium },
  points: { gap: 10, marginTop: 12, marginBottom: 20 },
  point: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: G.red, marginTop: 8 },
  pointText: { flex: 1, color: G.slate, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular },
  sheetButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  sheetButton: { flex: 1, height: 52 },
});
