import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SELLER_POLICY } from '@gadget-bidding/shared';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  GadgetImage,
  PrimaryButton,
  SecondaryButton,
  FooterBar,
  useNow,
} from '../../../components/glass';
import { SkeletonGroup, Bone } from '../../../components/glass/Skeleton';
import { BottomSheet } from '../../../components/motion';
import { fonts } from '../../../constants';
import { useReloadOnReconnect } from '../../../store/networkStore';
import { useToastStore } from '../../../store/toastStore';
import { Label, Timeline, TimelineStep, TINT } from '../onboarding/kit';
import { moneyService, SellerOrderDetail, STEP_KEYS, atWhen, longDay, naira, shortDay, shortWhen } from './api';

/**
 * One sold order, for the seller (route 'SellerOrder', { orderId }): where it is in the six steps,
 * what to do next and by when, the drop-off code, when each step happened, and the money.
 * Buyers stay private: only their city and state.
 */

type Tone = 'amber' | 'blue' | 'green' | 'red' | 'violet' | 'neutral';
const TONES: Record<Tone, { bg: string; text: string }> = {
  amber: TINT.amber,
  blue: TINT.blue,
  green: TINT.green,
  red: TINT.red,
  violet: TINT.violet,
  neutral: { bg: TINT.fill, text: G.ink },
};

const toast = (m: string, t: 'success' | 'error' = 'error') => useToastStore.getState().show(m, t);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The chip, the big next step and the deadline on the right of the top card. */
const topCopy = (o: SellerOrderDetail, now: number): { chip: string; tone: Tone; title: string; when: string | null; late?: boolean } => {
  const pickup = o.delivery_method === 'pickup';
  if (o.case?.open) return { chip: 'Case open', tone: 'red', title: 'A buyer reported a problem', when: null };
  switch (o.stage) {
    case 'unpaid':
      return {
        chip: 'Waiting for payment',
        tone: 'amber',
        title: 'Waiting for the buyer to pay',
        when: o.payment_due_at ? `By ${atWhen(o.payment_due_at, now)}` : null,
      };
    case 'sold': {
      const late = !!o.dropoff_due_at && new Date(o.dropoff_due_at).getTime() < now;
      return {
        chip: 'Sold',
        tone: 'amber',
        title: 'Drop it at the hub',
        when: o.dropoff_due_at ? (late ? 'Overdue' : `By ${atWhen(o.dropoff_due_at, now)}`) : null,
        late,
      };
    }
    case 'at_hub':
      return { chip: 'At hub', tone: 'blue', title: 'The hub is checking it', when: null };
    case 'passed':
      return pickup
        ? { chip: 'Passed', tone: 'green', title: 'Waiting for the buyer to collect', when: null }
        : { chip: 'Passed', tone: 'green', title: 'It passed. Going out for delivery soon', when: null };
    case 'on_the_way':
      return pickup
        ? { chip: 'Ready for pickup', tone: 'blue', title: 'Waiting for the buyer to collect', when: null }
        : { chip: 'On the way', tone: 'blue', title: 'On its way to the buyer', when: null };
    case 'delivered': {
      if (!o.buyer_confirmed_at) {
        return {
          chip: 'Delivered',
          tone: 'green',
          title: 'Waiting for the buyer to confirm',
          when: o.confirm_by ? `By ${atWhen(o.confirm_by, now)}` : null,
        };
      }
      if (o.payout.status === 'sending') return { chip: 'Delivered', tone: 'green', title: 'Your payout is on its way', when: null };
      const next = o.payout.next_payout_at;
      return {
        chip: 'Delivered',
        tone: 'green',
        title: o.payout.blocked && o.payout.blocked.code !== 'PAYOUTS_PAUSED' ? 'Ready for payout' : 'In your next payout',
        when: next ? capital(atWhen(next, now)) : null,
      };
    }
    case 'paid_out':
      return { chip: 'Paid out', tone: 'green', title: 'Paid to your bank', when: o.payout.paid_at ? shortDay(o.payout.paid_at) : null };
    case 'refunded':
      return { chip: 'Refunded', tone: 'violet', title: 'The buyer was refunded', when: null };
    default:
      return { chip: 'Cancelled', tone: 'neutral', title: 'This order was cancelled', when: null };
  }
};

/** The tinted note under the money. */
const noteOf = (o: SellerOrderDetail, now: number): { tone: Tone; text: string } => {
  if (o.case?.open) return { tone: 'amber', text: `Case ${o.case.number} is open. Your money is held until it's settled.` };
  switch (o.stage) {
    case 'unpaid':
      return { tone: 'neutral', text: "Don't drop it off yet. We'll tell you as soon as they pay." };
    case 'refunded':
      return { tone: 'neutral', text: "The buyer was refunded, so there's no payout for this order." };
    case 'cancelled':
      return { tone: 'neutral', text: "There's no payout for this order." };
    case 'paid_out':
      return {
        tone: 'green',
        text: o.payout.paid_at
          ? `Paid on ${longDay(o.payout.paid_at)}${o.payout.batch ? ` in payout ${o.payout.batch.reference}` : ''}.`
          : 'Paid to your bank.',
      };
    case 'delivered':
      if (!o.buyer_confirmed_at) break;
      if (o.payout.status === 'sending' && o.payout.batch) return { tone: 'green', text: `On its way in payout ${o.payout.batch.reference}.` };
      if (o.payout.blocked) return { tone: 'amber', text: o.payout.blocked.message };
      if (o.payout.next_payout_at) {
        return { tone: 'green', text: `The buyer confirmed. You'll be paid at ${atWhen(o.payout.next_payout_at, now)}.` };
      }
      break;
    default:
      break;
  }
  return { tone: 'amber', text: 'The buyer has paid. Your money is safe in escrow.' };
};

const stepTitles = (pickup: boolean) => [
  'Sold and paid',
  'Dropped at hub',
  'Passed inspection',
  pickup ? 'Ready for pickup' : 'Out for delivery',
  pickup ? 'Collected' : 'Delivered',
  'Paid out',
];

const timelineOf = (o: SellerOrderDetail): TimelineStep[] => {
  const titles = stepTitles(o.delivery_method === 'pickup');
  const finished = o.stage === 'paid_out';
  const stopped = o.stage === 'refunded' || o.stage === 'cancelled';
  return STEP_KEYS.map((key, i) => {
    // The step reached is done; the one after it is what we're waiting on.
    const state: TimelineStep['state'] =
      finished || i <= o.step ? 'done' : i === o.step + 1 && !stopped ? 'current' : 'todo';
    const at = o.times[key];
    let sub = at ? shortWhen(at) : state === 'done' ? 'Done' : 'Not yet';
    if (key === 'passed' && state !== 'todo' && o.inspection) sub += ` · ${o.inspection.passed} of ${o.inspection.total} checks`;
    if (key === 'sold' && o.stage === 'unpaid') sub = 'Waiting for payment';
    // A refunded or cancelled order is never paid out; "Not yet" would suggest it will be.
    if (key === 'paid_out' && stopped) sub = o.stage === 'refunded' ? 'No payout · the buyer was refunded' : 'No payout';
    return { title: titles[i], sub, state };
  });
};

export const SellerOrderScreen: React.FC<{ navigation: any; route: { params?: { orderId?: string } } }> = ({ navigation, route }) => {
  const orderId = route.params?.orderId ?? '';
  const now = useNow(30_000);
  const [order, setOrder] = useState<SellerOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);

  const load = useCallback(async () => {
    if (!orderId) return setError("We couldn't find this order.");
    try {
      setOrder(await moneyService.order(orderId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "We couldn't load this order.");
    }
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useReloadOnReconnect(load);

  const sendToHub = () => {
    if (!order) return;
    Alert.alert('Handed it in at the hub?', "Tap this once the item is with our hub team. They'll check it against your listing.", [
      { text: 'Not yet', style: 'cancel' },
      {
        text: "Yes, it's at the hub",
        onPress: async () => {
          setSending(true);
          try {
            await moneyService.sendToHub(order.id);
            toast('Marked as dropped off. The hub checks it next.', 'success');
            await load();
          } catch (e) {
            toast(e instanceof Error && e.message ? e.message : "That didn't work. Try again.");
          } finally {
            setSending(false);
          }
        },
      },
    ]);
  };

  const title = order ? `Order ${order.order_number}` : 'Order';

  if (!order) {
    return (
      <GlassScreen>
        <GlassHeader title={title} onBack={() => navigation.goBack()} />
        <ScrollView contentContainerStyle={styles.content}>
          {error ? (
            <GlassCard style={styles.card}>
              <Text style={styles.body}>{error}</Text>
              <SecondaryButton label="Try again" onPress={load} style={styles.topGap} />
            </GlassCard>
          ) : (
            <OrderSkeleton />
          )}
        </ScrollView>
      </GlassScreen>
    );
  }

  const top = topCopy(order, now);
  const chip = TONES[top.tone];
  const note = noteOf(order, now);
  const noteTone = TONES[note.tone];
  const filled = order.stage === 'paid_out' ? 6 : Math.max(0, order.step + 1);
  const pickup = order.delivery_method === 'pickup';
  const showCode = order.stage === 'sold' && !order.case?.open;
  const dropBy = order.dropoff_due_at ? `drop by ${atWhen(order.dropoff_due_at, now)}` : null;
  const fee = order.money.platform_fee;

  const footer = order.can_send_to_hub ? (
    <PrimaryButton label={sending ? 'Sending…' : 'Send to hub'} onPress={sendToHub} disabled={sending} />
  ) : order.payout.batch ? (
    <SecondaryButton label="See payout" onPress={() => navigation.navigate('PayoutDetail', { payoutId: order.payout.batch!.id })} />
  ) : order.case ? (
    <SecondaryButton
      label={`See case ${order.case.number}`}
      onPress={() => navigation.navigate('SellerCase', { disputeId: order.case!.id })}
    />
  ) : null;

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
        <GlassCard style={styles.card}>
          <View style={styles.topRow}>
            <View style={[styles.chip, { backgroundColor: chip.bg }]}>
              <Text style={[styles.chipText, { color: chip.text }]}>{top.chip}</Text>
            </View>
            {top.when ? <Text style={[styles.when, top.late && { color: TINT.red.text }]}>{top.when}</Text> : null}
          </View>
          <Text style={styles.headline} accessibilityRole="header">
            {top.title}
          </Text>
          <View style={styles.bar} accessible accessibilityLabel={`Step ${Math.max(1, filled)} of 6`}>
            {STEP_KEYS.map((k, i) => (
              <View key={k} style={[styles.segment, i < filled && styles.segmentOn]} />
            ))}
          </View>
        </GlassCard>

        <GlassCard style={[styles.card, styles.itemRow]}>
          <GadgetImage uri={order.item.image} size={56} style={styles.thumb} />
          <View style={styles.flex}>
            <Text style={styles.itemTitle} numberOfLines={2}>
              {order.item.title}
            </Text>
            <Text style={styles.sub}>
              Sold for {naira(order.money.sale_price)}
              {order.item.bids ? ` · ${order.item.bids} bid${order.item.bids === 1 ? '' : 's'}` : ''}
            </Text>
            <Text style={styles.caption}>
              {pickup
                ? 'Buyer collects from the hub'
                : order.buyer_area
                  ? `Buyer in ${order.buyer_area} · names are private`
                  : "Buyer's name is private"}
            </Text>
          </View>
        </GlassCard>

        {showCode ? (
          <Pressable
            onPress={() => setCodeOpen(true)}
            style={({ pressed }) => pressed && styles.pressed}
            accessibilityRole="button"
            accessibilityLabel={`Drop-off code ${order.order_number.split('').join(' ')}. Show this at the hub.`}
          >
            <GlassCard style={[styles.card, styles.itemRow]}>
              <View style={styles.codeTile}>
                <Text style={styles.codeTileText}>CODE</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.itemTitle}>{order.order_number}</Text>
                <Text style={styles.sub}>Show this at the hub{dropBy ? ` · ${dropBy}` : ''}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={G.faint} />
            </GlassCard>
          </Pressable>
        ) : null}

        <Label style={styles.section}>Progress</Label>
        <Timeline steps={timelineOf(order)} />

        <Label style={styles.section}>Money</Label>
        <GlassCard style={styles.moneyCard}>
          <View style={[styles.moneyRow, styles.rowLine]}>
            <Text style={styles.moneyKey}>Sale price</Text>
            <Text style={styles.moneyValue}>{naira(order.money.sale_price)}</Text>
          </View>
          <View style={[styles.moneyRow, styles.rowLine]}>
            <Text style={styles.moneyKey}>Platform fee ({order.money.fee_label})</Text>
            <Text style={styles.moneyValue}>{fee > 0 ? `−${naira(fee)}` : naira(0)}</Text>
          </View>
          <View style={styles.moneyRow}>
            <Text style={styles.moneyKey}>{order.stage === 'paid_out' ? 'You received' : "You'll receive"}</Text>
            <Text style={styles.moneyTotal}>{naira(order.money.you_receive)}</Text>
          </View>
        </GlassCard>

        <View style={[styles.note, { backgroundColor: noteTone.bg }]} accessibilityLiveRegion="polite">
          <Text style={[styles.noteText, { color: note.tone === 'neutral' ? G.slate : noteTone.text }]}>{note.text}</Text>
        </View>
      </ScrollView>

      {footer ? <FooterBar>{footer}</FooterBar> : null}

      <BottomSheet visible={codeOpen} onClose={() => setCodeOpen(false)}>
        <Text style={styles.sheetTitle}>Drop-off code</Text>
        <Text
          style={styles.bigCode}
          selectable
          accessibilityLabel={`Code ${order.order_number.split('').join(' ')}`}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          {order.order_number}
        </Text>
        <Text style={styles.sheetBody}>
          Show this at our Computer Village hub{dropBy ? `, ${dropBy}` : ''}. Anyone on your store staff list can drop it off.
        </Text>
        <Text style={styles.sheetCaption}>{SELLER_POLICY.hubAddress}</Text>
        <SecondaryButton label="Done" onPress={() => setCodeOpen(false)} style={styles.topGap} />
      </BottomSheet>
    </GlassScreen>
  );
};

const OrderSkeleton: React.FC = () => (
  <SkeletonGroup>
    <GlassCard style={styles.card}>
      <Bone w={64} h={26} r={8} tone="card" />
      <Bone w="70%" h={20} r={8} tone="card" style={styles.boneGap} />
      <Bone w="100%" h={5} r={3} tone="card" style={styles.boneGap} />
    </GlassCard>
    <GlassCard style={[styles.card, styles.itemRow]}>
      <Bone w={56} h={56} r={12} tone="card" />
      <View style={[styles.flex, styles.boneLines]}>
        <Bone w="60%" h={15} r={7} tone="card" />
        <Bone w="45%" h={12} r={6} tone="card" />
      </View>
    </GlassCard>
  </SkeletonGroup>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 40 },
  topGap: { marginTop: 16 },
  card: { padding: 16, marginBottom: 12 },
  body: { color: G.slate, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },

  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  chip: { height: 30, paddingHorizontal: 10, borderRadius: 9, justifyContent: 'center' },
  chipText: { fontSize: 13, fontFamily: fonts.medium },
  when: { color: G.ink, fontSize: 13, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  headline: { color: G.ink, fontSize: 19, lineHeight: 25, letterSpacing: -0.19, fontFamily: fonts.medium, marginTop: 12 },
  bar: { flexDirection: 'row', gap: 4, marginTop: 14 },
  segment: { flex: 1, height: 5, borderRadius: 3, backgroundColor: 'rgba(28,31,42,0.08)' },
  segmentOn: { backgroundColor: G.blue },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 56, height: 56, borderRadius: 12 },
  itemTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  sub: { color: G.slate, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, marginTop: 2, fontVariant: ['tabular-nums'] },
  caption: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, marginTop: 2 },

  codeTile: { width: 44, height: 44, borderRadius: 12, backgroundColor: TINT.amber.bg, alignItems: 'center', justifyContent: 'center' },
  codeTileText: { color: TINT.amber.text, fontSize: 11, letterSpacing: 0.4, fontFamily: fonts.medium },

  section: { marginTop: 20, marginBottom: 10 },
  moneyCard: { paddingHorizontal: 16 },
  moneyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 14 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(28,31,42,0.08)' },
  moneyKey: { flex: 1, color: G.slate, fontSize: 15, fontFamily: fonts.regular },
  moneyValue: { color: G.ink, fontSize: 15, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  moneyTotal: { color: G.ink, fontSize: 17, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },

  note: { marginTop: 12, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 },
  noteText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },

  sheetTitle: { color: G.ink, fontSize: 19, fontFamily: fonts.medium },
  bigCode: {
    color: G.ink,
    fontSize: 32,
    letterSpacing: 1.5,
    fontFamily: fonts.medium,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 16,
  },
  sheetBody: { color: G.slate, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, textAlign: 'center' },
  sheetCaption: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, textAlign: 'center', marginTop: 8 },

  boneGap: { marginTop: 12 },
  boneLines: { gap: 6 },
});
