import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { G, GlassScreen, GlassHeader, GlassCard, SecondaryButton } from '../../../components/glass';
import { SkeletonGroup, Bone } from '../../../components/glass/Skeleton';
import { fonts } from '../../../constants';
import { useReloadOnReconnect } from '../../../store/networkStore';
import { useToastStore } from '../../../store/toastStore';
import { Label, TINT } from '../onboarding/kit';
import { moneyService, SellerPayoutDetail, longWhen, naira } from './api';

/**
 * One payout (route 'PayoutDetail', { payoutId }): how much, where it went and when, the bank
 * reference to quote, the orders in it with their fees, any charges, and the totals.
 */

const toast = (m: string, t: 'success' | 'error' = 'error') => useToastStore.getState().show(m, t);

const STATUS: Record<SellerPayoutDetail['status'], { label: string; bg: string; text: string }> = {
  paid: { label: 'Paid', bg: TINT.green.bg, text: TINT.green.text },
  sending: { label: 'Sending', bg: TINT.blue.bg, text: TINT.blue.text },
  failed: { label: "Didn't go through", bg: TINT.red.bg, text: TINT.red.text },
};

const whenLine = (p: SellerPayoutDetail) =>
  p.status === 'paid' && p.sent_at
    ? `Sent ${longWhen(p.sent_at)}`
    : p.status === 'failed'
      ? `Tried ${longWhen(p.scheduled_for)}`
      : `Made ${longWhen(p.scheduled_for)} · on its way to your bank`;

const Row: React.FC<{ k: string; v: string; last?: boolean; strong?: boolean; selectable?: boolean }> = ({ k, v, last, strong, selectable }) => (
  <View style={[styles.kv, !last && styles.rowLine]}>
    <Text style={[styles.key, strong && styles.keyStrong]}>{k}</Text>
    <Text style={[styles.value, strong && styles.valueStrong]} selectable={selectable} numberOfLines={2}>
      {v}
    </Text>
  </View>
);

export const PayoutDetailScreen: React.FC<{ navigation: any; route: { params?: { payoutId?: string } } }> = ({ navigation, route }) => {
  const payoutId = route.params?.payoutId ?? '';
  const [p, setP] = useState<SellerPayoutDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [emailing, setEmailing] = useState(false);

  const load = useCallback(async () => {
    if (!payoutId) return setError("We couldn't find this payout.");
    try {
      setP(await moneyService.payout(payoutId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "We couldn't load this payout.");
    }
  }, [payoutId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useReloadOnReconnect(load);

  const emailStatement = async () => {
    if (!p || emailing) return;
    setEmailing(true);
    try {
      const { sent_to } = await moneyService.emailStatement(p.id);
      toast(`Statement sent to ${sent_to}.`, 'success');
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : "We couldn't send it. Try again.");
    } finally {
      setEmailing(false);
    }
  };

  const title = p ? `Payout ${p.reference}` : 'Payout';

  if (!p) {
    return (
      <GlassScreen>
        <GlassHeader title={title} onBack={() => navigation.goBack()} />
        <ScrollView contentContainerStyle={styles.content}>
          {error ? (
            <GlassCard style={styles.hero}>
              <Text style={styles.body}>{error}</Text>
              <SecondaryButton label="Try again" onPress={load} style={styles.topGap} />
            </GlassCard>
          ) : (
            <SkeletonGroup>
              <GlassCard style={styles.hero}>
                <Bone w={56} h={26} r={8} tone="card" />
                <Bone w={200} h={34} r={10} tone="card" style={styles.boneGap} />
                <Bone w="60%" h={13} r={6} tone="card" style={styles.boneGap} />
              </GlassCard>
            </SkeletonGroup>
          )}
        </ScrollView>
      </GlassScreen>
    );
  }

  const st = STATUS[p.status];
  const to = [p.to.bank_name, p.to.account_last4 ? `••••${p.to.account_last4}` : null].filter(Boolean).join(' · ');
  const facts: { k: string; v: string; selectable?: boolean }[] = [
    ...(to ? [{ k: 'To', v: to }] : []),
    ...(p.to.account_name ? [{ k: 'Account name', v: p.to.account_name }] : []),
    { k: 'Reference', v: p.reference, selectable: true },
    ...(p.bank_reference ? [{ k: 'Bank reference', v: p.bank_reference, selectable: true }] : []),
  ];
  const totals: { k: string; v: string; strong?: boolean }[] = [
    ...(p.orders.length
      ? [
          { k: 'Sales', v: naira(p.totals.sales) },
          { k: 'Platform fees', v: p.totals.platform_fees > 0 ? `−${naira(p.totals.platform_fees)}` : naira(0) },
        ]
      : []),
    ...(p.totals.charges > 0 ? [{ k: 'Charges', v: `−${naira(p.totals.charges)}` }] : []),
    { k: p.status === 'paid' ? 'Paid to you' : 'Amount', v: naira(p.totals.paid_to_you), strong: true },
  ];

  return (
    <GlassScreen>
      <GlassHeader title={title} onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
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
        <GlassCard style={styles.hero}>
          <View style={[styles.chip, { backgroundColor: st.bg }]}>
            <Text style={[styles.chipText, { color: st.text }]}>{st.label}</Text>
          </View>
          <Text style={styles.amount} accessibilityLabel={`${st.label}, ${naira(p.amount)}`}>
            {naira(p.amount)}
          </Text>
          <Text style={styles.caption}>{whenLine(p)}</Text>
        </GlassCard>

        {p.status === 'failed' ? (
          <View style={[styles.note, { backgroundColor: TINT.red.bg }]}>
            <Text style={[styles.noteText, { color: TINT.red.text }]}>
              {p.failure_reason ? `${p.failure_reason} ` : ''}
              {`${p.order_count === 1 ? 'Its order goes' : `Its ${p.order_count} orders go`} in the next 6:00 pm payout. Check your payout account is right.`}
            </Text>
          </View>
        ) : null}

        <GlassCard style={styles.list}>
          {facts.map((f, i) => (
            <Row key={f.k} k={f.k} v={f.v} selectable={f.selectable} last={i === facts.length - 1} />
          ))}
        </GlassCard>

        {p.orders.length ? (
          <>
            <Label style={styles.section}>Orders in this payout</Label>
            <GlassCard style={styles.list}>
              {p.orders.map((o, i) => (
                <Pressable
                  key={o.id}
                  onPress={() => navigation.navigate('SellerOrder', { orderId: o.id })}
                  style={({ pressed }) => [styles.orderRow, i < p.orders.length - 1 && styles.rowLine, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`${o.title}. Sold ${naira(o.sold_for)}, fee ${naira(o.platform_fee)}. You got ${naira(o.payout)}.`}
                >
                  <View style={styles.flex}>
                    <Text style={styles.orderTitle} numberOfLines={1}>
                      {o.title}
                    </Text>
                    <Text style={styles.caption}>
                      Sold {naira(o.sold_for)} · fee {o.platform_fee > 0 ? `−${naira(o.platform_fee)}` : naira(0)}
                    </Text>
                  </View>
                  <Text style={styles.orderAmount}>{naira(o.payout)}</Text>
                </Pressable>
              ))}
            </GlassCard>
          </>
        ) : null}

        {p.charges.length ? (
          <>
            <Label style={styles.section}>Charges</Label>
            <GlassCard style={styles.list}>
              {p.charges.map((c, i) => (
                <View key={c.id} style={[styles.orderRow, i < p.charges.length - 1 && styles.rowLine]}>
                  <View style={styles.flex}>
                    <Text style={styles.orderTitle}>{c.reason}</Text>
                    {c.order_number ? <Text style={styles.caption}>Order {c.order_number}</Text> : null}
                  </View>
                  <Text style={styles.orderAmount}>−{naira(c.amount)}</Text>
                </View>
              ))}
            </GlassCard>
          </>
        ) : null}

        <GlassCard style={[styles.list, styles.totals]}>
          {totals.map((t, i) => (
            <Row key={t.k} k={t.k} v={t.v} strong={t.strong} last={i === totals.length - 1} />
          ))}
        </GlassCard>

        <View style={styles.actions}>
          <Pressable
            onPress={emailStatement}
            disabled={emailing}
            style={({ pressed }) => [styles.action, (pressed || emailing) && styles.pressed]}
            accessibilityRole="button"
            accessibilityState={{ busy: emailing }}
          >
            {emailing ? <ActivityIndicator color={G.blue} /> : <Text style={styles.actionText}>Email statement</Text>}
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('SupportChat', { draft: `Payout ${p.reference}: ` })}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.actionText}>Something wrong?</Text>
          </Pressable>
        </View>

        {p.status === 'paid' ? (
          <Text style={styles.footnote}>Not showing in your bank after 24 hours? Give your bank the reference above.</Text>
        ) : null}
      </ScrollView>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 48 },
  topGap: { marginTop: 16 },
  body: { color: G.slate, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },

  hero: { padding: 20, marginBottom: 12 },
  chip: { alignSelf: 'flex-start', height: 30, paddingHorizontal: 10, borderRadius: 9, justifyContent: 'center' },
  chipText: { fontSize: 13, fontFamily: fonts.medium },
  amount: {
    color: G.ink,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.64,
    fontFamily: fonts.medium,
    fontVariant: ['tabular-nums'],
    marginTop: 14,
  },
  caption: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, marginTop: 2, fontVariant: ['tabular-nums'] },

  note: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 12 },
  noteText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },

  list: { paddingHorizontal: 16 },
  totals: { marginTop: 12 },
  kv: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingVertical: 14 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(28,31,42,0.08)' },
  key: { color: G.slate, fontSize: 15, fontFamily: fonts.regular },
  keyStrong: { color: G.ink },
  value: { flexShrink: 1, color: G.ink, fontSize: 15, fontFamily: fonts.medium, textAlign: 'right', fontVariant: ['tabular-nums'] },
  valueStrong: { fontSize: 17 },

  section: { marginTop: 20, marginBottom: 10 },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  orderTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  orderAmount: { color: G.ink, fontSize: 15, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },

  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  action: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionText: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  footnote: { color: G.muted, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular, textAlign: 'center', marginTop: 16, paddingHorizontal: 12 },

  boneGap: { marginTop: 12 },
});
