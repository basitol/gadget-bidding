import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  GadgetImage,
  PrimaryButton,
  SecondaryButton,
  TextButton,
  FooterBar,
  useNow,
} from '../../../components/glass';
import { SkeletonGroup, Bone } from '../../../components/glass/Skeleton';
import { fonts } from '../../../constants';
import { useReloadOnReconnect } from '../../../store/networkStore';
import { Label, Timeline, TimelineStep, TINT } from '../onboarding/kit';
import { moneyService, SellerOrderDetail, STEP_KEYS, atWhen, longDay, naira, shortDay, shortWhen } from './api';
import { SoldView } from '../hub/SoldScreen';

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

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The chip, the big next step and the deadline on the right of the top card. */
const topCopy = (o: SellerOrderDetail, now: number): { chip: string; tone: Tone; title: string; when: string | null; late?: boolean } => {
  const pickup = o.delivery_method === 'pickup';
  if (o.case?.open) return { chip: 'Case open', tone: 'red', title: 'A buyer reported a problem', when: null };
  const h = o.hub;
  if (h?.returned_at) return { chip: 'Back with you', tone: 'neutral', title: "It didn't pass the hub check and is back with you", when: null };
  if (h?.result === 'failed') {
    if (h.second_check_pending) return { chip: 'Second check', tone: 'blue', title: 'A senior inspector is checking it again', when: null };
    if (o.stage === 'refunded' && h.failed_choice === 'collect') return { chip: 'Collect from hub', tone: 'amber', title: 'Collect it from the hub', when: null };
    if (o.stage === 'refunded' && h.failed_choice === 'deliver') return { chip: 'Coming back', tone: 'blue', title: 'Our rider is bringing it to your shop', when: null };
    return { chip: "Didn't pass", tone: 'red', title: "It didn't pass the hub check", when: null };
  }
  if (o.stage === 'sold' && h?.method === 'rider' && h.rider) {
    return { chip: 'Rider booked', tone: 'blue', title: 'A rider is collecting it from your shop', when: h.rider.label };
  }
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
  if (o.hub?.result === 'failed' && o.stage !== 'refunded' && !o.hub.returned_at) {
    return o.hub.second_check_pending
      ? { tone: 'neutral', text: 'If it passes the second check, it goes to the buyer as normal.' }
      : { tone: 'amber', text: 'Choose what happens to it. The buyer is refunded either way.' };
  }
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
    // It failed the hub check: say so instead of waiting on "Passed inspection".
    if (key === 'passed' && o.hub?.result === 'failed') {
      return {
        title: "Didn't pass inspection",
        sub: o.inspection ? `${o.inspection.passed} of ${o.inspection.total} checks passed` : 'See what the hub found',
        state,
      };
    }
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

  const hub = order.hub;
  // Sold and nothing chosen yet: the Sold screen, with "Send to hub".
  if (order.stage === 'sold' && order.can_send_to_hub && !hub?.method && !order.case?.open) {
    return <SoldView order={order} navigation={navigation} orderId={order.id} onBack={() => navigation.goBack()} />;
  }

  const top = topCopy(order, now);
  const chip = TONES[top.tone];
  const note = noteOf(order, now);
  const noteTone = TONES[note.tone];
  const filled = order.stage === 'paid_out' ? 6 : Math.max(0, order.step + 1);
  const pickup = order.delivery_method === 'pickup';
  const showCode = order.stage === 'sold' && !order.case?.open && hub?.method !== 'rider';
  const riderCard = order.stage === 'sold' && hub?.method === 'rider' && hub.rider ? hub.rider : null;
  const failed = hub?.result === 'failed' && !hub.returned_at;
  const toCollect = failed && order.stage === 'refunded' && hub.failed_choice === 'collect';
  const dropBy = order.dropoff_due_at ? `drop by ${atWhen(order.dropoff_due_at, now)}` : null;
  const fee = order.money.platform_fee;

  const go = (screen: string) => navigation.navigate(screen, { orderId: order.id });
  const footer = order.can_send_to_hub ? (
    hub?.method === 'dropoff' ? (
      <>
        <PrimaryButton label="Show drop-off code" onPress={() => go('HubDropoffCode')} />
        <TextButton label="Change how it gets there" onPress={() => go('SendToHub')} />
      </>
    ) : hub?.method === 'rider' ? (
      <SecondaryButton label="Change pickup" onPress={() => go('SendToHub')} />
    ) : (
      <PrimaryButton label="Send to hub" onPress={() => go('SendToHub')} />
    )
  ) : toCollect ? (
    <PrimaryButton label="Show collection code" onPress={() => go('HubCollect')} />
  ) : failed ? (
    <PrimaryButton label="See what the hub found" onPress={() => go('HubInspection')} />
  ) : order.payout.batch ? (
    <SecondaryButton label="See payout" onPress={() => navigation.navigate('PayoutDetail', { payoutId: order.payout.batch!.id })} />
  ) : order.case ? (
    <SecondaryButton
      label={`See case ${order.case.number}`}
      onPress={() => navigation.navigate('SellerCase', { disputeId: order.case!.id })}
    />
  ) : hub?.result ? (
    <SecondaryButton label="See the hub check" onPress={() => go('HubInspection')} />
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

        {riderCard ? (
          <Pressable
            onPress={() => go('SendToHub')}
            style={({ pressed }) => pressed && styles.pressed}
            accessibilityRole="button"
            accessibilityLabel={`Rider booked, ${riderCard.label}. Asks for ${riderCard.contact}. Change`}
          >
            <GlassCard style={[styles.card, styles.itemRow]}>
              <View style={[styles.codeTile, { backgroundColor: TINT.blue.bg }]}>
                <Ionicons name="bicycle-outline" size={20} color={TINT.blue.text} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.itemTitle}>Rider booked</Text>
                <Text style={styles.sub}>
                  {riderCard.label} · asks for {riderCard.contact}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={G.faint} />
            </GlassCard>
          </Pressable>
        ) : null}

        {showCode ? (
          <Pressable
            onPress={() => go('HubDropoffCode')}
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


  boneGap: { marginTop: 12 },
  boneLines: { gap: 6 },
});
