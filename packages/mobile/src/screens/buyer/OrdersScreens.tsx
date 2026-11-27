import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  Animated,
  Image,
  Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  GadgetImage,
  PillTabs,
  PrimaryButton,
  SectionLabel,
  CONDITION_LABEL,
  useNow,
} from '../../components/glass';
import { BottomSheet, useSequentialFill } from '../../components/motion';
import { fonts } from '../../constants';
import { addressService, orderService } from '../../services';
import { meService } from '../../services/me.service';
import {
  getAlertPrefs,
  getPushPermission,
  openSystemNotificationSettings,
  registerForPush,
  saveAlertPrefs,
} from '../../services/pushNotifications';
import { useToastStore } from '../../store/toastStore';
import { UserAddress } from '../../types';
import { formatCurrency } from '../../utils';

const toast = (m: string, t: 'success' | 'error' = 'error') => useToastStore.getState().show(m, t);
const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/* ================= Order stage (buyer's view of payment + fulfillment) ================= */

type Stage =
  | 'unpaid'
  | 'expired'
  | 'paid'
  | 'at_hub'
  | 'checked'
  | 'on_the_way'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

const isPickup = (o: any) => o?.delivery_method === 'pickup';

const stageOf = (o: any, now = Date.now()): Stage => {
  if (o.payment_status === 'refunded') return 'refunded';
  if (o.fulfillment_status === 'cancelled') return 'cancelled';
  if (o.payment_status !== 'paid') {
    const due = o.payment_due_at ? new Date(o.payment_due_at).getTime() : Infinity;
    return due <= now ? 'expired' : 'unpaid';
  }
  switch (o.fulfillment_status) {
    case 'sent_to_backoffice':
      return 'at_hub';
    case 'received_by_backoffice':
      return 'checked';
    case 'shipped':
      // Pickup orders are ready at the hub once checked; there's no courier leg.
      return isPickup(o) ? 'checked' : 'on_the_way';
    case 'delivered':
      return 'delivered';
    default:
      return 'paid';
  }
};

const IN_PROGRESS: Stage[] = ['unpaid', 'paid', 'at_hub', 'checked', 'on_the_way'];
const openDispute = (o: any) => !!o.open_dispute;
const hasDispute = (o: any) => (o.disputes?.length ?? 0) > 0;

type Tone = 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'teal' | 'neutral';
const TONES: Record<Tone, { bg: string; fg: string }> = {
  green: { bg: '#EEF9F2', fg: '#2E9E5E' },
  amber: { bg: '#FFF6EE', fg: '#DB7A2E' },
  red: { bg: '#FDF0F2', fg: '#D9536A' },
  blue: { bg: '#F1F5FF', fg: '#3E6AF0' },
  violet: { bg: '#F5F2FF', fg: '#7C68E8' },
  teal: { bg: '#E6F7F7', fg: '#0E8B8A' },
  neutral: { bg: '#F5F6F9', fg: G.ink },
};

/** Status chip: tint + dark text, always a word (design guide › Chips). */
const StatusChip: React.FC<{ label: string; tone: Tone }> = ({ label, tone }) => (
  <View style={[styles.chip, { backgroundColor: TONES[tone].bg }]}>
    <Text style={[styles.chipText, { color: TONES[tone].fg }]}>{label}</Text>
  </View>
);

/** Chip on the orders list. */
const listChip = (o: any, stage: Stage): { label: string; tone: Tone } => {
  if (openDispute(o)) return { label: 'Problem reported · in review', tone: 'teal' };
  switch (stage) {
    case 'unpaid':
      return { label: 'Waiting for payment', tone: 'amber' };
    case 'expired':
      return { label: 'Payment window closed', tone: 'red' };
    case 'paid':
      return { label: 'Paid · seller dropping off', tone: 'blue' };
    case 'at_hub':
      return { label: 'At hub · being checked', tone: 'blue' };
    case 'checked':
      return isPickup(o) ? { label: 'Ready to collect', tone: 'green' } : { label: 'Passed hub check', tone: 'green' };
    case 'on_the_way':
      return { label: 'On the way · confirm when it arrives', tone: 'blue' };
    case 'delivered':
      return hasDispute(o) ? { label: 'Problem resolved', tone: 'green' } : { label: isPickup(o) ? 'Collected' : 'Delivered', tone: 'green' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'red' };
    case 'refunded':
      return { label: 'Refunded', tone: 'violet' };
  }
};

/* ================= Dates & money (design guide › Voice & formats) ================= */

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return 'Today';
  if (sameDay(d, new Date(now.getTime() - 86400_000))) return 'Yesterday';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
};
/** Same, for the middle of a sentence: "Paid today", "Delivered Nov 25". */
const dayInline = (iso: string) => {
  const l = dayLabel(iso);
  return l === 'Today' || l === 'Yesterday' ? l.toLowerCase() : l;
};
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
/** "Nov 25, 9:40 pm" · "Today, 11:05 am" */
const stamp = (iso: string) => `${dayLabel(iso)}, ${timeLabel(iso)}`;

/** "23h" / "45m" left to pay. */
const payLeft = (o: any, now: number) => {
  const ms = new Date(o.payment_due_at).getTime() - now;
  const m = Math.max(0, Math.floor(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h` : `${m}m`;
};

const itemAmount = (o: any) => Number(o?.item_amount ?? Number(o?.total_amount ?? 0) - Number(o?.delivery_fee ?? 0));
const titleOf = (o: any) => o?.gadget?.title ?? 'Your gadget';
const sellerOf = (o: any) => (o?.seller?.full_name ? `Verified seller ${o.seller.full_name}` : 'Verified seller');

/** When the order reached a status (from the server's status history). */
const eventAt = (o: any, kind: 'payment' | 'fulfillment', status: string): string | null => {
  const hits = (o.events ?? []).filter((e: any) => e.kind === kind && e.status === status);
  return hits.length ? hits[hits.length - 1].at : null;
};

/* ================= Shared bits ================= */

const SecondaryButton: React.FC<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: object;
  compact?: boolean;
}> = ({ label, onPress, disabled, style, compact }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [styles.secondary, compact && styles.secondaryCompact, pressed && styles.pressed, disabled && styles.disabled, style]}
    accessibilityRole="button"
    accessibilityState={{ disabled }}
  >
    <Text style={[styles.secondaryText, compact && styles.secondaryTextCompact]}>{label}</Text>
  </Pressable>
);

const confirmDelivery = (order: any, onDone: () => void) => {
  const pickup = isPickup(order);
  Alert.alert(
    pickup ? 'Did you collect it?' : 'Did it arrive okay?',
    `${titleOf(order)}. Confirming releases your money from escrow to the seller. If something is wrong, report a problem instead.`,
    [
      { text: 'Not yet', style: 'cancel' },
      {
        text: pickup ? 'Yes, I collected it' : 'Yes, it arrived',
        onPress: async () => {
          try {
            await orderService.confirmDelivery(order.id);
            toast('Thanks! The seller gets paid from escrow.', 'success');
            onDone();
          } catch (e) {
            toast(errText(e, "We couldn't confirm that. Try again."));
          }
        },
      },
    ]
  );
};

/** Buyers get help by email (in-app support chat is for sellers), same as Profile › Help centre. */
const SUPPORT_EMAIL = 'support@gadgetbid.ng';
const emailSupport = (order: any) => {
  const subject = encodeURIComponent(`Help with order ${order.order_number}`);
  Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`).catch(() =>
    Alert.alert('Email us', `Write to ${SUPPORT_EMAIL} and mention order ${order.order_number}. We reply within a day.`)
  );
};

/* ================= My orders ================= */

type Tab = 'progress' | 'completed' | 'disputes';

export const MyOrdersScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const now = useNow(60_000);
  const [orders, setOrders] = useState<any[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('progress');

  const load = useCallback(async () => {
    try {
      const res = await orderService.getMyOrders(1, 50);
      setOrders(res.data ?? []);
    } catch (e) {
      setOrders(o => o ?? []);
      toast(errText(e, "Couldn't load your orders. Pull down to try again."));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const groups = useMemo(() => {
    const list = orders ?? [];
    const progress = list.filter(o => !openDispute(o) && IN_PROGRESS.includes(stageOf(o, now)));
    const completed = list.filter(o => !openDispute(o) && !IN_PROGRESS.includes(stageOf(o, now)));
    const disputes = list.filter(hasDispute).sort((a, b) => Number(openDispute(b)) - Number(openDispute(a)));
    return { progress, completed, disputes };
  }, [orders, now]);

  const shown = groups[tab];
  const openDisputes = groups.disputes.filter(openDispute).length;

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <GlassScreen>
      <GlassHeader title="My orders" onBack={() => navigation.goBack()} />
      <View style={styles.tabs}>
        <PillTabs<Tab>
          tabs={[
            { key: 'progress', label: 'In progress', count: groups.progress.length },
            { key: 'completed', label: 'Completed' },
            { key: 'disputes', label: 'Disputes', count: openDisputes || undefined },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {orders === null ? (
        <ActivityIndicator color={G.blue} style={styles.loader} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={G.blue} />}
        >
          {shown.length === 0 ? (
            <EmptyOrders tab={tab} onExplore={() => navigation.navigate('MainTabs', { screen: 'Explore' })} />
          ) : (
            shown.map(o => <OrderCard key={o.id} order={o} now={now} navigation={navigation} onChanged={load} />)
          )}
        </ScrollView>
      )}
    </GlassScreen>
  );
};

const EmptyOrders: React.FC<{ tab: Tab; onExplore: () => void }> = ({ tab, onExplore }) => {
  const copy = {
    progress: { title: 'Nothing on the way', sub: 'Auctions you win show up here until they reach you.' },
    completed: { title: 'No finished orders yet', sub: 'Orders you received or that were cancelled show up here.' },
    disputes: { title: 'No problems reported', sub: "If something's wrong with an order, report it from the order page." },
  }[tab];
  return (
    <View style={styles.empty}>
      <Image source={require('../../../assets/icons/box.png')} style={styles.emptyIcon} />
      <Text style={styles.emptyTitle}>{copy.title}</Text>
      <Text style={styles.emptySub}>{copy.sub}</Text>
      {tab === 'progress' ? <PrimaryButton label="Explore auctions" onPress={onExplore} compact style={styles.emptyButton} /> : null}
    </View>
  );
};

const OrderCard: React.FC<{ order: any; now: number; navigation: any; onChanged: () => void }> = ({
  order,
  now,
  navigation,
  onChanged,
}) => {
  const stage = stageOf(order, now);
  const chip = listChip(order, stage);
  const open = () => navigation.navigate('OrderDetail', { orderId: order.id });

  const when = (() => {
    if (stage === 'unpaid') return `Pay in ${payLeft(order, now)}`;
    if (stage === 'delivered') {
      const at = eventAt(order, 'fulfillment', 'delivered');
      return at ? `${isPickup(order) ? 'Collected' : 'Delivered'} ${dayInline(at)}` : null;
    }
    const paidAt = eventAt(order, 'payment', 'paid');
    if (paidAt) return `Paid ${dayInline(paidAt)}`;
    return order.updated_at ? dayLabel(order.updated_at) : null;
  })();

  const action =
    stage === 'unpaid' && !openDispute(order) ? (
      <PrimaryButton label="Pay now" compact onPress={() => navigation.navigate('Checkout', { orderId: order.id })} />
    ) : stage === 'on_the_way' && !openDispute(order) ? (
      <PrimaryButton label="Confirm delivery" compact onPress={() => confirmDelivery(order, onChanged)} />
    ) : (
      <SecondaryButton label="View order" compact onPress={open} />
    );

  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${titleOf(order)}, ${chip.label}`}>
      <GlassCard style={styles.card}>
        <View style={styles.cardTop}>
          <GadgetImage uri={order.gadget?.images?.[0]} size={44} style={styles.thumb} />
          <View style={styles.flex}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {titleOf(order)}
            </Text>
            <Text style={styles.cardSub} numberOfLines={2}>
              {order.order_number} · {sellerOf(order)}
            </Text>
            <View style={styles.cardChip}>
              <StatusChip {...chip} />
            </View>
          </View>
          <View style={styles.cardRight}>
            <Text style={styles.cardPrice}>{formatCurrency(order.total_amount)}</Text>
            {when ? <Text style={[styles.cardWhen, stage === 'unpaid' && styles.dueText]}>{when}</Text> : null}
          </View>
        </View>
        <View style={styles.cardAction}>{action}</View>
      </GlassCard>
    </Pressable>
  );
};

/* ================= Order detail ================= */

type Step = { key: string; title: string; reached: boolean; at: string | null; extra?: string | null };

const buildSteps = (o: any): Step[] => {
  const stage = stageOf(o);
  const pickup = isPickup(o);
  const paid = o.payment_status === 'paid';
  const order: Stage[] = pickup
    ? ['paid', 'at_hub', 'checked', 'delivered']
    : ['paid', 'at_hub', 'checked', 'on_the_way', 'delivered'];
  const reachedIdx = paid ? order.indexOf(stage) : -1;
  const reached = (s: Stage) => paid && reachedIdx >= order.indexOf(s);
  const steps: Step[] = [
    {
      key: 'paid',
      title: 'Paid',
      reached: reached('paid'),
      at: eventAt(o, 'payment', 'paid'),
      extra: o.paid_with ?? null,
    },
    { key: 'at_hub', title: 'Seller dropped it at the hub', reached: reached('at_hub'), at: eventAt(o, 'fulfillment', 'sent_to_backoffice') },
    {
      key: 'checked',
      title: pickup ? 'Passed hub check · ready to collect' : 'Passed hub check',
      reached: reached('checked'),
      at: eventAt(o, 'fulfillment', 'received_by_backoffice'),
    },
  ];
  if (!pickup) {
    steps.push({
      key: 'on_the_way',
      title: 'Out for delivery',
      reached: reached('on_the_way'),
      at: eventAt(o, 'fulfillment', 'shipped'),
      extra: o.tracking_number ? `Tracking ${o.tracking_number}` : null,
    });
  }
  steps.push({
    key: 'delivered',
    title: pickup ? 'Collected' : 'Delivered',
    reached: reached('delivered'),
    at: eventAt(o, 'fulfillment', 'delivered'),
  });
  return steps;
};

const PROGRESS_LABELS = ['Paid', 'At hub', 'Checked', 'On the way', 'Delivered'];
const PICKUP_LABELS = ['Paid', 'At hub', 'Checked', 'Collected'];

/** Big status card at the top of the order page. */
const statusCopy = (o: any, stage: Stage, now: number): { chip: string; tone: Tone; note: string | null; title: string } => {
  const pickup = isPickup(o);
  if (openDispute(o)) {
    return { chip: 'In review', tone: 'teal', note: 'We reply within a day', title: "We're looking into your problem" };
  }
  switch (stage) {
    case 'unpaid':
      return { chip: 'Waiting for payment', tone: 'amber', note: `Pay in ${payLeft(o, now)}`, title: 'Pay to secure your win' };
    case 'expired':
      return { chip: 'Payment window closed', tone: 'red', note: null, title: 'The time to pay has passed' };
    case 'paid':
      return { chip: 'Paid', tone: 'blue', note: 'Drop-off usually within a day', title: 'Waiting for the seller to drop it off' };
    case 'at_hub':
      return { chip: 'At hub', tone: 'blue', note: 'Check usually done today', title: 'Being checked at our hub' };
    case 'checked':
      return pickup
        ? { chip: 'Ready to collect', tone: 'green', note: 'Computer Village hub', title: 'Ready for you at the hub' }
        : { chip: 'Passed check', tone: 'green', note: 'Leaves the hub in 1–2 days', title: 'Passed our hub check' };
    case 'on_the_way':
      return { chip: 'On the way', tone: 'blue', note: o.tracking_number ? `Tracking ${o.tracking_number}` : null, title: 'On its way to you' };
    case 'delivered':
      return { chip: pickup ? 'Collected' : 'Delivered', tone: 'green', note: null, title: pickup ? 'You collected it' : 'Delivered to you' };
    case 'cancelled':
      return { chip: 'Cancelled', tone: 'red', note: null, title: 'This order was cancelled' };
    case 'refunded':
      return { chip: 'Refunded', tone: 'violet', note: null, title: 'Your money was refunded' };
  }
};

const maskPhone = (p?: string) => {
  const d = (p ?? '').replace(/\D/g, '');
  if (d.length < 8) return p ?? '';
  const local = d.startsWith('234') ? `0${d.slice(3)}` : d;
  return `${local.slice(0, 4)} ••• ${local.slice(-4)}`;
};

const DISPUTE_REASONS: { key: string; label: string }[] = [
  { key: 'item_not_received', label: "It hasn't arrived" },
  { key: 'item_damaged', label: 'It arrived damaged' },
  { key: 'item_not_as_described', label: "It's not as described" },
  { key: 'other', label: 'Something else' },
];

export const OrderTrackScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { orderId } = route.params;
  const now = useNow(60_000);
  const [order, setOrder] = useState<any>(null);
  const [updatesOn, setUpdatesOn] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);
  const [addressSheet, setAddressSheet] = useState(false);
  const [problemSheet, setProblemSheet] = useState(false);
  const [myRating, setMyRating] = useState<{ score: number } | null | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      setOrder((await orderService.getOrder(orderId)).data);
    } catch (e) {
      toast(errText(e, "Couldn't load this order. Try again."));
    }
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Delivery updates are on when this phone can get alerts and order alerts aren't switched off.
  useEffect(() => {
    let alive = true;
    Promise.all([getPushPermission(), getAlertPrefs().catch(() => null)])
      .then(([perm, prefs]) => alive && setUpdatesOn(perm === 'granted' && prefs?.orders !== false))
      .catch(() => alive && setUpdatesOn(false));
    return () => {
      alive = false;
    };
  }, []);

  const stage = order ? stageOf(order, now) : null;

  useEffect(() => {
    if (stage === 'delivered' && myRating === undefined) {
      meService
        .myRating(orderId)
        .then(r => setMyRating(r ?? null))
        .catch(() => setMyRating(null));
    }
  }, [stage, orderId, myRating]);

  if (!order || !stage) {
    return (
      <GlassScreen>
        <GlassHeader title="Order" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={G.blue} style={styles.loader} />
      </GlassScreen>
    );
  }

  const pickup = isPickup(order);
  const paid = order.payment_status === 'paid';
  const status = statusCopy(order, stage, now);
  const steps = buildSteps(order);
  const labels = pickup ? PICKUP_LABELS : PROGRESS_LABELS;
  const filled = steps.filter(s => s.reached).length;
  const inFlight = ['paid', 'at_hub', 'checked', 'on_the_way'].includes(stage);
  const canReport = ['on_the_way', 'delivered'].includes(stage) && !openDispute(order);
  const condition = CONDITION_LABEL[order.gadget?.condition];
  const won = order.auction?.end_time
    ? `Won ${dayInline(order.auction.end_time)}${order.auction.total_bids ? ` · ${order.auction.total_bids} bids` : ''}`
    : null;

  const emailReceipt = async () => {
    setSending(true);
    try {
      const { email } = await orderService.emailReceipt(order.id);
      toast(`Receipt sent to ${email}`, 'success');
    } catch (e) {
      toast(errText(e, "We couldn't send the receipt. Try again in a minute."));
    } finally {
      setSending(false);
    }
  };

  const turnOnUpdates = async () => {
    const perm = await registerForPush({ ask: true });
    if (perm !== 'granted') {
      Alert.alert(
        'Notifications are off',
        'Turn on notifications for Gadgets Bidding in Settings to get delivery updates.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: openSystemNotificationSettings },
        ]
      );
      return;
    }
    try {
      await saveAlertPrefs({ orders: true });
      setUpdatesOn(true);
      toast("You'll get an alert each time your order moves.", 'success');
    } catch (e) {
      toast(errText(e, "We couldn't turn on updates. Try again."));
    }
  };

  const footer =
    stage === 'unpaid' ? (
      <PrimaryButton label="Pay now" onPress={() => navigation.navigate('Checkout', { orderId: order.id })} />
    ) : stage === 'on_the_way' && !openDispute(order) ? (
      <PrimaryButton label="Confirm delivery" onPress={() => confirmDelivery(order, load)} />
    ) : pickup && stage === 'checked' && !openDispute(order) ? (
      <PrimaryButton label="I collected it" onPress={() => confirmDelivery(order, load)} />
    ) : inFlight && updatesOn === false ? (
      <SecondaryButton label="Get delivery updates" onPress={turnOnUpdates} />
    ) : null;

  const address = order.shipping_address;

  return (
    <GlassScreen>
      <GlassHeader title={`Order ${order.order_number}`} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Where it is */}
        <GlassCard style={styles.status}>
          <View style={styles.statusTop}>
            <StatusChip label={status.chip} tone={status.tone} />
            {status.note ? <Text style={styles.statusNote}>{status.note}</Text> : null}
          </View>
          <Text style={styles.statusTitle} accessibilityRole="header">
            {status.title}
          </Text>
          {!['expired', 'cancelled', 'refunded'].includes(stage) ? (
            <ProgressBar labels={labels} filled={filled} />
          ) : null}
        </GlassCard>

        {/* What */}
        <GlassCard style={styles.item}>
          <GadgetImage uri={order.gadget?.images?.[0]} size={48} style={styles.itemThumb} />
          <View style={styles.flex}>
            <Text style={styles.itemTitle} numberOfLines={2}>
              {titleOf(order)}
            </Text>
            <Text style={styles.itemSub}>{['Sold by a verified seller', condition].filter(Boolean).join(' · ')}</Text>
            {won ? <Text style={styles.itemSub}>{won}</Text> : null}
          </View>
        </GlassCard>

        {/* Tracking */}
        {!['expired', 'cancelled'].includes(stage) ? (
          <>
            <View style={styles.section}>
              <SectionLabel>Tracking</SectionLabel>
            </View>
            <Timeline steps={steps} done={stage === 'delivered'} />
          </>
        ) : null}

        {/* Delivery */}
        <View style={styles.section}>
          <SectionLabel>{pickup ? 'Pickup' : 'Delivery'}</SectionLabel>
        </View>
        <GlassCard style={styles.address}>
          <View style={styles.pin}>
            <Ionicons name={pickup ? 'storefront-outline' : 'location-outline'} size={18} color={G.slate} />
          </View>
          <View style={styles.flex}>
            {pickup ? (
              <>
                <Text style={styles.addressTitle}>Gadgets Bidding hub</Text>
                <Text style={styles.addressSub}>Computer Village, Ikeja, Lagos · bring a photo ID</Text>
              </>
            ) : address ? (
              <>
                <Text style={styles.addressTitle}>{address.full_name}</Text>
                <Text style={styles.addressSub}>
                  {[address.address_line1, address.address_line2, address.city, address.state].filter(Boolean).join(', ')}
                  {address.phone_number ? ` · ${maskPhone(address.phone_number)}` : ''}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.addressTitle}>No address yet</Text>
                <Text style={styles.addressSub}>You'll choose where it goes at checkout.</Text>
              </>
            )}
          </View>
          {!pickup && paid && order.address_editable ? (
            <Pressable onPress={() => setAddressSheet(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Change delivery address">
              <Text style={styles.link}>Change</Text>
            </Pressable>
          ) : null}
        </GlassCard>
        {!pickup && paid && inFlight ? (
          <Text style={styles.caption}>
            {order.address_editable
              ? 'You can change the address until the item leaves the hub.'
              : "It has left the hub, so the address can't change now."}
          </Text>
        ) : null}

        {/* Payment */}
        <View style={styles.section}>
          <SectionLabel>Payment</SectionLabel>
        </View>
        <GlassCard style={styles.summary}>
          <SumRow k="Winning bid" v={formatCurrency(itemAmount(order))} />
          <SumRow
            k={pickup ? 'Pickup' : 'Delivery'}
            v={Number(order.delivery_fee) > 0 ? formatCurrency(order.delivery_fee) : 'Free'}
          />
          <SumRow k="Buyer fee" v={formatCurrency(0)} />
          <SumRow k={paid || stage === 'refunded' ? 'Total paid' : 'Total to pay'} v={formatCurrency(order.total_amount)} strong last />
        </GlassCard>

        <EscrowNote order={order} stage={stage} />

        <View style={styles.actions}>
          {paid || stage === 'refunded' ? (
            <SecondaryButton label={sending ? 'Sending…' : 'Email receipt'} onPress={emailReceipt} disabled={sending} style={styles.flex} />
          ) : null}
          <SecondaryButton label="Get help" onPress={() => emailSupport(order)} style={styles.flex} />
        </View>

        {canReport ? (
          <Pressable onPress={() => setProblemSheet(true)} style={styles.reportLink} accessibilityRole="button">
            <Text style={styles.reportText}>Report a problem with this order</Text>
          </Pressable>
        ) : null}

        {stage === 'delivered' && !openDispute(order) && myRating !== undefined ? (
          <RateSeller orderId={order.id} rating={myRating} onRated={setMyRating} />
        ) : null}
      </ScrollView>

      {footer ? <View style={styles.footer}>{footer}</View> : null}

      <AddressSheet
        visible={addressSheet}
        onClose={() => setAddressSheet(false)}
        orderId={order.id}
        onSaved={load}
        onAddNew={() => {
          setAddressSheet(false);
          navigation.navigate('ShippingAddress');
        }}
      />
      <ProblemSheet visible={problemSheet} onClose={() => setProblemSheet(false)} orderId={order.id} onSent={load} />
    </GlassScreen>
  );
};

const SumRow: React.FC<{ k: string; v: string; strong?: boolean; last?: boolean }> = ({ k, v, strong, last }) => (
  <View style={[styles.sumRow, !last && styles.divider]}>
    <Text style={[styles.sumKey, strong && styles.sumKeyStrong]}>{k}</Text>
    <Text style={[styles.sumVal, strong && styles.sumStrong]}>{v}</Text>
  </View>
);

/** Segmented progress with step names; segments fill in one after another. */
const ProgressBar: React.FC<{ labels: string[]; filled: number }> = ({ labels, filled }) => {
  const fills = useSequentialFill(labels.map((_, i) => i < filled));
  return (
    <View style={styles.progress} accessibilityLabel={`Step ${filled} of ${labels.length}: ${labels[Math.max(0, filled - 1)]}`}>
      <View style={styles.segments}>
        {labels.map((l, i) => (
          <View key={l} style={styles.segmentTrack}>
            <Animated.View style={[styles.segmentFill, { opacity: fills[i].dot, transform: [{ scaleX: fills[i].dot }] }]} />
          </View>
        ))}
      </View>
      <View style={styles.segmentLabels}>
        {labels.map(l => (
          <Text key={l} style={styles.segmentLabel} numberOfLines={1}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
};

/** Done steps green, the latest step blue, the rest "Not yet". */
const Timeline: React.FC<{ steps: Step[]; done: boolean }> = ({ steps, done }) => {
  const latest = steps.map(s => s.reached).lastIndexOf(true);
  const fills = useSequentialFill(steps.map(s => s.reached));
  return (
    <GlassCard style={styles.timeline}>
      {steps.map((s, i) => {
        const state = s.reached ? (i === latest && !done ? 'now' : 'done') : 'todo';
        const sub = s.reached
          ? [s.at ? stamp(s.at) : 'Done', s.extra].filter(Boolean).join(' · ')
          : 'Not yet';
        return (
          <View key={s.key} style={styles.tlRow}>
            <View style={styles.tlRail}>
              <View style={[styles.tlDot, state === 'todo' && styles.tlTodo]}>
                {state !== 'todo' ? (
                  <Animated.View
                    style={[
                      StyleSheet.absoluteFill,
                      state === 'done' ? styles.tlDone : styles.tlNow,
                      { opacity: fills[i].dot, transform: [{ scale: fills[i].dot }] },
                    ]}
                  />
                ) : null}
              </View>
              {i < steps.length - 1 ? <View style={styles.tlLine} /> : null}
            </View>
            <View style={styles.tlBody}>
              <Text style={[styles.tlTitle, state === 'now' && styles.tlTitleNow, state === 'todo' && styles.tlTitleTodo]}>
                {s.title}
              </Text>
              <Text style={[styles.tlSub, state === 'todo' && styles.tlSubTodo]}>{sub}</Text>
            </View>
          </View>
        );
      })}
    </GlassCard>
  );
};

const EscrowNote: React.FC<{ order: any; stage: Stage }> = ({ order, stage }) => {
  const what = isPickup(order) ? 'you collect it' : 'you confirm it arrived okay';
  const text = openDispute(order)
    ? "The seller's payment is on hold in escrow while we look into your problem."
    : stage === 'unpaid'
      ? `When you pay, your money is held in escrow. The seller is paid only after ${what}.`
      : stage === 'delivered'
        ? "It's delivered, so the seller gets paid from escrow."
        : stage === 'refunded' || stage === 'cancelled'
          ? 'Any money you paid goes back to your wallet.'
          : stage === 'expired'
            ? 'You were not charged for this order.'
            : `Your money is held in escrow. The seller is paid only after ${what}.`;
  const tone = stage === 'unpaid' || stage === 'expired' || stage === 'cancelled' ? 'neutral' : 'green';
  return (
    <View style={[styles.note, tone === 'green' ? styles.noteGreen : styles.noteNeutral]}>
      <Image source={require('../../../assets/icons/shield.png')} style={styles.noteIcon} />
      <Text style={styles.noteText}>{text}</Text>
    </View>
  );
};

const RateSeller: React.FC<{
  orderId: string;
  rating: { score: number } | null;
  onRated: (r: { score: number }) => void;
}> = ({ orderId, rating, onRated }) => {
  const [stars, setStars] = useState(0);
  const [busy, setBusy] = useState(false);
  const score = rating?.score ?? stars;
  const send = async () => {
    setBusy(true);
    try {
      await meService.rate(orderId, stars);
      onRated({ score: stars });
      toast('Thanks for rating the seller', 'success');
    } catch (e) {
      toast(errText(e, "We couldn't save your rating. Try again."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <GlassCard style={styles.rate}>
      <Text style={styles.rateTitle}>{rating ? 'Your rating' : 'How was the seller?'}</Text>
      <View style={styles.stars} accessibilityRole="adjustable" accessibilityLabel={`${score} of 5 stars`}>
        {[1, 2, 3, 4, 5].map(n => (
          <Pressable key={n} onPress={() => !rating && setStars(n)} disabled={!!rating} hitSlop={6} accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}>
            <Ionicons name={n <= score ? 'star' : 'star-outline'} size={28} color={n <= score ? '#F5A524' : G.faint} />
          </Pressable>
        ))}
      </View>
      {!rating ? <PrimaryButton label={busy ? 'Sending…' : 'Send rating'} onPress={send} disabled={!stars || busy} compact /> : null}
    </GlassCard>
  );
};

const AddressSheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  orderId: string;
  onSaved: () => void;
  onAddNew: () => void;
}> = ({ visible, onClose, orderId, onSaved, onAddNew }) => {
  const [list, setList] = useState<UserAddress[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setList(null);
    addressService
      .listAddresses()
      .then(r => {
        const items = r.data ?? [];
        setList(items);
        setPicked(items.find(a => a.is_default)?.id ?? items[0]?.id ?? null);
      })
      .catch(() => setList([]));
  }, [visible]);

  const save = async () => {
    const a = list?.find(x => x.id === picked);
    if (!a) return;
    setBusy(true);
    try {
      await orderService.updateShippingAddress(orderId, {
        full_name: a.full_name,
        phone_number: a.phone_number,
        address_line1: a.address_line1,
        address_line2: a.address_line2,
        city: a.city,
        state: a.state,
        postal_code: a.postal_code,
        country: a.country || 'Nigeria',
      });
      toast('Address changed. The hub will send it there.', 'success');
      onClose();
      onSaved();
    } catch (e) {
      toast(errText(e, "We couldn't change the address. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.sheetTitle}>Where should it go?</Text>
      {list === null ? (
        <ActivityIndicator color={G.blue} style={styles.sheetLoader} />
      ) : (
        <View style={styles.sheetList}>
          {list.map(a => {
            const on = a.id === picked;
            return (
              <Pressable
                key={a.id}
                onPress={() => setPicked(a.id)}
                style={[styles.option, on && styles.optionOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                <View style={styles.flex}>
                  <Text style={styles.optionTitle}>{a.label || a.full_name}</Text>
                  <Text style={styles.optionSub} numberOfLines={2}>
                    {[a.address_line1, a.city].filter(Boolean).join(', ')} · {maskPhone(a.phone_number)}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          <Pressable onPress={onAddNew} style={({ pressed }) => [styles.addNew, pressed && styles.pressed]} accessibilityRole="button">
            <Text style={styles.link}>+ Add a new address</Text>
          </Pressable>
        </View>
      )}
      {list?.length ? (
        <PrimaryButton label={busy ? 'Saving…' : 'Send it here'} onPress={save} disabled={!picked || busy} />
      ) : null}
    </BottomSheet>
  );
};

const ProblemSheet: React.FC<{ visible: boolean; onClose: () => void; orderId: string; onSent: () => void }> = ({
  visible,
  onClose,
  orderId,
  onSent,
}) => {
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const tooShort = details.trim().length < 20;

  const send = async () => {
    if (!reason || tooShort) return;
    setBusy(true);
    try {
      await orderService.createDispute(orderId, reason as any, details.trim());
      toast("Thanks. We've paused the seller's payment and will reply within a day.", 'success');
      setReason(null);
      setDetails('');
      onClose();
      onSent();
    } catch (e) {
      toast(errText(e, "We couldn't send that. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.sheetTitle}>What's wrong?</Text>
      <Text style={styles.sheetSub}>We hold the seller's payment while we look into it.</Text>
      <View style={styles.reasons}>
        {DISPUTE_REASONS.map(r => {
          const on = r.key === reason;
          return (
            <Pressable
              key={r.key}
              onPress={() => setReason(r.key)}
              style={[styles.reason, on && styles.reasonOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.reasonText, on && styles.reasonTextOn]}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.fieldLabel}>What happened?</Text>
      <TextInput
        value={details}
        onChangeText={setDetails}
        multiline
        placeholderTextColor={G.faint}
        style={styles.textArea}
        accessibilityLabel="What happened"
        maxLength={1000}
      />
      <Text style={styles.fieldHint}>A few sentences help us sort it faster (20 characters or more).</Text>
      <PrimaryButton label={busy ? 'Sending…' : 'Send to support'} onPress={send} disabled={!reason || tooShort || busy} />
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  loader: { marginTop: 60 },

  chip: { height: 26, paddingHorizontal: 10, borderRadius: 8, justifyContent: 'center', alignSelf: 'flex-start' },
  chipText: { fontSize: 12, fontFamily: fonts.medium },

  secondary: {
    height: 50,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  secondaryCompact: { height: 38, borderRadius: 11 },
  secondaryText: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  secondaryTextCompact: { fontSize: 13 },

  /* List */
  tabs: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 },
  list: { paddingHorizontal: 20, paddingBottom: 32, gap: 12 },
  card: { padding: 12, gap: 12 },
  cardTop: { flexDirection: 'row', gap: 12 },
  thumb: { width: 52, height: 52, borderRadius: 12 },
  cardTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  cardSub: { color: G.muted, fontSize: 12, lineHeight: 16, fontFamily: fonts.regular, marginTop: 2 },
  cardChip: { marginTop: 8 },
  cardRight: { alignItems: 'flex-end' },
  cardPrice: { color: G.ink, fontSize: 15, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  cardWhen: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },
  dueText: { color: '#DB7A2E' },
  cardAction: {},

  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  emptyIcon: { width: 64, height: 64, resizeMode: 'contain' },
  emptyTitle: { color: G.ink, fontSize: 17, fontFamily: fonts.medium, marginTop: 16 },
  emptySub: { color: G.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, textAlign: 'center', marginTop: 6 },
  emptyButton: { marginTop: 20 },

  /* Detail */
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  section: { marginTop: 20 },
  status: { padding: 16 },
  statusTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  statusNote: { color: G.slate, fontSize: 12, fontFamily: fonts.regular, flexShrink: 1, textAlign: 'right' },
  statusTitle: { color: G.ink, fontSize: 19, letterSpacing: -0.2, fontFamily: fonts.medium, marginTop: 12 },

  progress: { marginTop: 14 },
  segments: { flexDirection: 'row', gap: 4 },
  segmentTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(79,123,255,0.14)', overflow: 'hidden' },
  segmentFill: { flex: 1, backgroundColor: G.blue, borderRadius: 2, transformOrigin: 'left' },
  segmentLabels: { flexDirection: 'row', gap: 4, marginTop: 8 },
  segmentLabel: { flex: 1, color: G.muted, fontSize: 11, fontFamily: fonts.regular, textAlign: 'center' },

  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginTop: 12 },
  itemThumb: { width: 56, height: 56, borderRadius: 12 },
  itemTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  itemSub: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },

  timeline: { padding: 16 },
  tlRow: { flexDirection: 'row', gap: 12 },
  tlRail: { alignItems: 'center', width: 14 },
  tlDot: { width: 12, height: 12, borderRadius: 6, marginTop: 3, overflow: 'hidden' },
  tlTodo: { borderWidth: 1.5, borderColor: '#D6DAE4' },
  tlDone: { backgroundColor: '#2E9E5E', borderRadius: 6 },
  tlNow: { borderWidth: 3, borderColor: G.blue, borderRadius: 6, backgroundColor: '#FFFFFF' },
  tlLine: { flex: 1, width: 1.5, backgroundColor: 'rgba(28,31,42,0.08)', marginVertical: 3 },
  tlBody: { flex: 1, paddingBottom: 16 },
  tlTitle: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  tlTitleNow: { color: G.blue600 },
  tlTitleTodo: { color: G.faint },
  tlSub: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },
  tlSubTodo: { color: G.faint },

  address: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  pin: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F1F3F9', alignItems: 'center', justifyContent: 'center' },
  addressTitle: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  addressSub: { color: G.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.regular, marginTop: 2 },
  link: { color: G.blue600, fontSize: 14, fontFamily: fonts.medium },
  caption: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, marginTop: 8, marginLeft: 2 },

  summary: { overflow: 'hidden' },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16 },
  divider: { borderBottomWidth: 1, borderBottomColor: 'rgba(28,31,42,0.05)' },
  sumKey: { color: G.muted, fontSize: 14, fontFamily: fonts.regular },
  sumKeyStrong: { color: G.slate },
  sumVal: { color: G.ink, fontSize: 14, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  sumStrong: { fontSize: 16 },

  note: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, marginTop: 12 },
  noteGreen: { backgroundColor: '#EEF9F2' },
  noteNeutral: { backgroundColor: '#F5F6F9' },
  noteIcon: { width: 28, height: 28, resizeMode: 'contain' },
  noteText: { flex: 1, color: G.ink, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular },

  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  reportLink: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  reportText: { color: '#D9536A', fontSize: 14, fontFamily: fonts.medium },

  rate: { padding: 16, marginTop: 12, gap: 12, alignItems: 'center' },
  rateTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  stars: { flexDirection: 'row', gap: 8 },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.9)',
  },

  /* Sheets */
  sheetTitle: { color: G.ink, fontSize: 19, fontFamily: fonts.medium },
  sheetSub: { color: G.muted, fontSize: 14, fontFamily: fonts.regular, marginTop: 4 },
  sheetLoader: { marginVertical: 24 },
  sheetList: { gap: 8, marginTop: 16, marginBottom: 16 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#EDEFF4',
    backgroundColor: '#FFFFFF',
  },
  optionOn: { borderColor: G.blue, backgroundColor: '#F1F5FF' },
  optionTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  optionSub: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#CED3DF', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: G.blue, backgroundColor: G.blue },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  addNew: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(28,31,42,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16, marginBottom: 16 },
  reason: { height: 36, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#F5F6F9', justifyContent: 'center' },
  reasonOn: { backgroundColor: G.ink },
  reasonText: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  reasonTextOn: { color: '#FFFFFF' },
  fieldLabel: { color: G.slate, fontSize: 14, fontFamily: fonts.medium, marginBottom: 8 },
  textArea: {
    minHeight: 96,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EDEFF4',
    backgroundColor: '#FFFFFF',
    padding: 14,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: G.ink,
    textAlignVertical: 'top',
  },
  fieldHint: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, marginTop: 6, marginBottom: 16 },
});
