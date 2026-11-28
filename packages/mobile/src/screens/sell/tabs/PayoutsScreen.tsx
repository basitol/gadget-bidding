import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { G, GlassScreen, GlassHeader, GlassCard, PrimaryButton, SecondaryButton } from '../../../components/glass';
import { SkeletonGroup, Bone } from '../../../components/glass/Skeleton';
import { fonts } from '../../../constants';
import { payoutService, PayoutError } from '../../../services/payout.service';
import { sellerPayoutsService } from '../../../services/sellerPayouts.service';
import type { PayoutHistoryRow, SellerPayoutSummary } from '../../../services/sellerPayouts.service';
import { useReloadOnReconnect } from '../../../store/networkStore';
import { useToastStore } from '../../../store/toastStore';
import { formatCurrency } from '../../../utils';
import { RowButton, TINT } from '../onboarding/kit';

/**
 * Payouts tab (seller): what's ready for the 6 pm payout, where it goes, and past payouts.
 * Sellers are paid once a day at 6:00 pm Lagos, the orders the buyer confirmed by then.
 * A past payout opens its detail ('PayoutDetail'); the scheduled one has nothing to open yet.
 * After a payout account change the server pauses payouts (blocked.code 'PAYOUTS_PAUSED').
 */

/** The server also sends PAYOUTS_PAUSED (with resumes_at) after an account change. */
const PAUSED = 'PAYOUTS_PAUSED';
const blockCode = (d: SellerPayoutSummary) => d.blocked?.code as string | undefined;

const toast = (msg: string, type: 'success' | 'error' = 'error') => useToastStore.getState().show(msg, type);

const DAY = 86_400_000;
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** "today" / "tomorrow" / "on Mon" */
const dayWord = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return 'today';
  if (sameDay(d, new Date(now.getTime() + DAY))) return 'tomorrow';
  return `on ${d.toLocaleDateString('en-US', { weekday: 'short' })}`;
};

/** "Today, 6:00 pm" / "Tomorrow, 6:00 pm" / "Yesterday" / "Nov 24" */
const rowDate = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  if (sameDay(d, now)) return `Today, ${time}`;
  if (sameDay(d, new Date(now.getTime() + DAY))) return `Tomorrow, ${time}`;
  if (sameDay(d, new Date(now.getTime() - DAY))) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/** Status chips: tint + dark text (design guide). */
const STATUS: Record<PayoutHistoryRow['status'], { label: string; bg: string; text: string }> = {
  scheduled: { label: 'Scheduled', bg: TINT.blue.bg, text: TINT.blue.text },
  sending: { label: 'Sending', bg: TINT.blue.bg, text: TINT.blue.text },
  paid: { label: 'Paid', bg: TINT.green.bg, text: TINT.green.text },
  failed: { label: "Didn't go through", bg: TINT.red.bg, text: TINT.red.text },
};

const ordersLine = (r: PayoutHistoryRow) =>
  r.order_count === 1 && r.first_order_number ? `1 order · ${r.first_order_number}` : `${r.order_count} order${r.order_count === 1 ? '' : 's'}`;

/** The line under the amount: when and how it's paid, or why it can't be yet. */
const heroCopy = (d: SellerPayoutSummary) => {
  if (d.blocked) return d.blocked.message;
  if (!d.ready || !d.next_payout_at) return 'Nothing waiting. Money from orders the buyer has confirmed shows here.';
  const day = dayWord(d.next_payout_at);
  return d.automatic
    ? `Paid automatically ${day} at 6:00 pm to your account below.`
    : `Sent to your account below after 6:00 pm ${day}.`;
};

export const PayoutsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [data, setData] = useState<SellerPayoutSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await sellerPayoutsService.summary());
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "We couldn't load your payouts.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useReloadOnReconnect(load);

  const openFix = (code?: string) => navigation.navigate(code === 'TWO_STEP_REQUIRED' ? 'TwoStepSetup' : 'PayoutAccount');

  /** Money left in the in-app wallet from before automatic payouts: send it to the bank. */
  const sendLegacy = () => {
    if (!data) return;
    const amount = Math.floor(data.legacy_balance);
    const acct = data.payout_account;
    if (blockCode(data) === PAUSED) return toast(data.blocked!.message);
    if (!acct || data.blocked) return openFix(data.blocked?.code);
    Alert.alert(
      `Send ${formatCurrency(amount)} to your bank?`,
      `It goes to ${acct.bank_name} ••••${acct.account_number_last4}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send to my bank',
          onPress: async () => {
            setSending(true);
            try {
              const { message } = await payoutService.withdraw(amount);
              toast(message || `On its way to ${acct.bank_name} ••••${acct.account_number_last4}.`, 'success');
              await load();
            } catch (e) {
              if (e instanceof PayoutError && (e.code === 'PAYOUT_ACCOUNT_REQUIRED' || e.code === 'TWO_STEP_REQUIRED')) {
                openFix(e.code);
              } else {
                toast(e instanceof Error && e.message ? e.message : "We couldn't send it. Try again.");
              }
            } finally {
              setSending(false);
            }
          },
        },
      ]
    );
  };

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <GlassScreen>
      <GlassHeader title="Payouts" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={G.blue} onRefresh={refresh} />}
      >
        {!data ? (
          error ? (
            <GlassCard style={styles.hero}>
              <Text style={styles.body}>{error}</Text>
              <SecondaryButton label="Try again" onPress={load} style={styles.heroAction} />
            </GlassCard>
          ) : (
            <PayoutsSkeleton />
          )
        ) : (
          <>
            <GlassCard style={styles.hero}>
              <Text style={styles.heroLabel}>Ready for payout</Text>
              <Text style={styles.heroAmount} accessibilityLabel={`Ready for payout ${formatCurrency(Math.round(data.ready))}`}>
                {formatCurrency(Math.round(data.ready))}
              </Text>
              <Text style={[styles.body, data.blocked && { color: TINT.amber.text }]}>{heroCopy(data)}</Text>
              {data.blocked && blockCode(data) !== PAUSED ? (
                <PrimaryButton
                  label={data.blocked.code === 'TWO_STEP_REQUIRED' ? 'Turn on 2-step sign-in' : 'Add payout account'}
                  onPress={() => openFix(data.blocked?.code)}
                  style={styles.heroAction}
                />
              ) : null}
            </GlassCard>

            {data.legacy_balance > 0 ? (
              <GlassCard style={styles.legacy}>
                <View style={styles.flex}>
                  <Text style={styles.legacyTitle}>{formatCurrency(Math.floor(data.legacy_balance))} in your wallet</Text>
                  <Text style={styles.caption}>From sales before automatic payouts.</Text>
                </View>
                <RowButton label="Send to bank" quiet onPress={sendLegacy} busy={sending} />
              </GlassCard>
            ) : null}

            <Text style={styles.section}>Payout account</Text>
            <GlassCard style={styles.account}>
              {data.payout_account ? (
                <>
                  <View style={[styles.bankTile, { backgroundColor: TINT.green.bg }]}>
                    <Ionicons name="business-outline" size={20} color={TINT.green.text} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {data.payout_account.account_name}
                    </Text>
                    <Text
                      style={styles.caption}
                      accessibilityLabel={`${data.payout_account.bank_name}, account ending ${data.payout_account.account_number_last4}`}
                    >
                      {data.payout_account.bank_name} • ••••{data.payout_account.account_number_last4}
                    </Text>
                    {data.payout_account.matches_business_name ? (
                      <View style={[styles.chip, styles.chipTop, { backgroundColor: TINT.green.bg }]}>
                        <Text style={[styles.chipText, { color: TINT.green.text }]}>Matches your CAC name</Text>
                      </View>
                    ) : null}
                  </View>
                  <RowButton label="Change" quiet onPress={() => navigation.navigate('PayoutAccount')} />
                </>
              ) : (
                <>
                  <View style={styles.bankTile}>
                    <Ionicons name="business-outline" size={20} color={G.muted} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>No payout account yet</Text>
                    <Text style={styles.caption}>It must be in your registered business name.</Text>
                  </View>
                  <RowButton label="Add" onPress={() => navigation.navigate('PayoutAccount')} />
                </>
              )}
            </GlassCard>

            <View style={styles.sectionRow}>
              <Text style={[styles.section, styles.sectionInRow]}>History</Text>
              <Text style={styles.caption}>Platform fee already taken off</Text>
            </View>
            <GlassCard style={styles.list}>
              {data.history.length ? (
                data.history.map((r, i) => {
                  const st = STATUS[r.status];
                  const label = `${rowDate(r.at)}. ${ordersLine(r)}. ${formatCurrency(Math.round(r.amount))}. ${st.label}.`;
                  const id = r.id;
                  return (
                    <Pressable
                      key={id ?? `scheduled-${r.at}`}
                      onPress={id ? () => navigation.navigate('PayoutDetail', { payoutId: id }) : undefined}
                      disabled={!id}
                      style={({ pressed }) => [styles.row, i < data.history.length - 1 && styles.rowLine, pressed && styles.pressed]}
                      accessible
                      accessibilityRole={id ? 'button' : undefined}
                      accessibilityLabel={label}
                    >
                      <View style={styles.flex}>
                        <Text style={styles.rowTitle}>{rowDate(r.at)}</Text>
                        <Text style={styles.caption}>{ordersLine(r)}</Text>
                      </View>
                      <View style={styles.rowRight}>
                        <Text style={styles.amount}>{formatCurrency(Math.round(r.amount))}</Text>
                        <View style={[styles.chip, { backgroundColor: st.bg }]}>
                          <Text style={[styles.chipText, { color: st.text }]}>{st.label}</Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })
              ) : (
                <Text style={[styles.body, styles.emptyList]}>No payouts yet. Each one shows here after 6:00 pm.</Text>
              )}
            </GlassCard>
          </>
        )}
      </ScrollView>
    </GlassScreen>
  );
};

const PayoutsSkeleton: React.FC = () => (
  <SkeletonGroup>
    <GlassCard style={styles.hero}>
      <Bone w={110} h={13} r={6} tone="card" />
      <Bone w={180} h={32} r={10} tone="card" style={styles.boneGap} />
      <Bone w="85%" h={14} r={7} tone="card" style={styles.boneGap} />
    </GlassCard>
    <Bone w={120} h={15} r={7} style={styles.boneSection} />
    <GlassCard style={styles.account}>
      <Bone w={40} h={40} r={12} tone="card" />
      <View style={[styles.flex, styles.boneLines]}>
        <Bone w="60%" h={14} r={7} tone="card" />
        <Bone w="40%" h={12} r={6} tone="card" />
      </View>
    </GlassCard>
  </SkeletonGroup>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 120 },

  hero: { padding: 20 },
  heroLabel: { color: G.muted, fontSize: 13, fontFamily: fonts.regular },
  heroAmount: {
    color: G.ink,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.64,
    fontFamily: fonts.medium,
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
  heroAction: { marginTop: 16 },
  body: { color: G.slate, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, marginTop: 8 },

  legacy: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, marginTop: 12 },
  legacyTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },

  section: { color: G.ink, fontSize: 15, fontFamily: fonts.medium, marginTop: 28, marginBottom: 10 },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 28, marginBottom: 10 },
  sectionInRow: { marginTop: 0, marginBottom: 0 },

  account: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  bankTile: { width: 40, height: 40, borderRadius: 12, backgroundColor: TINT.fill, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  caption: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, marginTop: 2 },

  chip: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 6 },
  chipTop: { marginTop: 8 },
  chipText: { fontSize: 12, fontFamily: fonts.medium },

  list: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(28,31,42,0.08)' },
  rowRight: { alignItems: 'flex-end' },
  amount: { color: G.ink, fontSize: 15, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  emptyList: { paddingHorizontal: 16, paddingBottom: 16, marginTop: 14 },

  boneGap: { marginTop: 10 },
  boneSection: { marginTop: 28, marginBottom: 10 },
  boneLines: { gap: 6 },
});
