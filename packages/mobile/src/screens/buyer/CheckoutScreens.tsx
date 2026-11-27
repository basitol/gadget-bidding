import React, { useRef, useCallback, useEffect, useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { BID_PAYMENT_DEADLINE_HOURS } from '@gadget-bidding/shared';
import { G, GlassScreen, GlassHeader, GlassCard, PrimaryButton, useNow } from '../../components/glass';
import { fonts } from '../../constants';
import { addressService, api, orderService } from '../../services';
import { meService, SavedCard } from '../../services/me.service';
import { useToastStore } from '../../store/toastStore';
import { UserAddress } from '../../types';
import { formatCurrency, mediaUrl } from '../../utils';

/* ---------------- Shared ---------------- */

const toast = (m: string, t: 'success' | 'error' = 'error') => useToastStore.getState().show(m, t);
const GRADE: Record<string, string> = {
  new: 'New · sealed',
  like_new: 'Grade A',
  excellent: 'Grade A',
  good: 'Grade B',
  fair: 'Grade C',
  for_parts: 'For parts',
};

/** Loads the order (buyer view: seller shown only as a code). */
const useOrder = (orderId: string) => {
  const [order, setOrder] = useState<any>(null);
  const reload = useCallback(async () => {
    try {
      setOrder((await orderService.getOrder(orderId)).data);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't load your order");
    }
  }, [orderId]);
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );
  return { order, setOrder, reload };
};

const itemAmount = (o: any) => Number(o?.item_amount ?? Number(o?.total_amount ?? 0) - Number(o?.delivery_fee ?? 0));
/** Pay-by time from the server (accepted second-chance offers get a fresh window), else created + 24h. */
const deadline = (o: any) =>
  o.payment_due_at
    ? new Date(o.payment_due_at).getTime()
    : new Date(o.created_at).getTime() + BID_PAYMENT_DEADLINE_HOURS * 3600_000;
const leftLabel = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
};
const titleOf = (o: any) => o?.gadget?.title ?? 'your gadget';
const shortTitle = (o: any) => titleOf(o).split(' · ')[0];
const sellerLine = (o: any) =>
  [o?.seller?.full_name ? `Seller ${o.seller.full_name}` : null, GRADE[o?.gadget?.condition] ?? null]
    .filter(Boolean)
    .join(' · ');

const ProductMini: React.FC<{ order: any }> = ({ order }) => (
  <GlassCard style={styles.mini}>
    <View style={styles.miniImage}>
      {order?.gadget?.images?.[0] ? (
        <Image source={{ uri: mediaUrl(order.gadget.images[0]) }} style={styles.miniImg} resizeMode="contain" />
      ) : null}
    </View>
    <View style={styles.flex}>
      <Text style={styles.miniTitle} numberOfLines={1}>
        {titleOf(order)}
      </Text>
      <Text style={styles.miniSub} numberOfLines={1}>
        {sellerLine(order)}
      </Text>
    </View>
  </GlassCard>
);

const Steps: React.FC<{ step: 1 | 2 | 3; label: string }> = ({ step, label }) => (
  <View style={styles.steps}>
    <View style={styles.stepBars}>
      {[1, 2, 3].map(n => (
        <View key={n} style={[styles.stepBar, n <= step && styles.stepBarOn]} />
      ))}
    </View>
    <Text style={styles.stepLabel}>
      STEP {step} OF 3 · {label.toUpperCase()}
    </Text>
  </View>
);

const Radio: React.FC<{ on: boolean }> = ({ on }) => (
  <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
);

const Option: React.FC<{
  on: boolean;
  title: string;
  sub?: string;
  right?: string;
  onPress: () => void;
}> = ({ on, title, sub, right, onPress }) => (
  <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }}>
    <GlassCard style={[styles.option, on && styles.optionOn]}>
      <Radio on={on} />
      <View style={styles.flex}>
        <Text style={styles.optionTitle}>{title}</Text>
        {sub ? <Text style={styles.optionSub}>{sub}</Text> : null}
      </View>
      {right ? <Text style={styles.optionRight}>{right}</Text> : null}
    </GlassCard>
  </Pressable>
);

type Step = { title: string; sub: string; state: 'done' | 'now' | 'todo' };
const Timeline: React.FC<{ steps: Step[] }> = ({ steps }) => (
  <GlassCard style={styles.timeline}>
    {steps.map((s, i) => (
      <View key={s.title} style={styles.tlRow}>
        <View style={styles.tlRail}>
          <View style={[styles.tlDot, s.state === 'done' && styles.tlDone, s.state === 'now' && styles.tlNow]} />
          {i < steps.length - 1 ? <View style={styles.tlLine} /> : null}
        </View>
        <View style={styles.tlBody}>
          <Text style={[styles.tlTitle, s.state === 'now' && styles.tlTitleNow, s.state === 'todo' && styles.tlTitleTodo]}>
            {s.title}
          </Text>
          <Text style={[styles.tlSub, s.state === 'todo' && styles.tlSubTodo]}>{s.sub}</Text>
        </View>
      </View>
    ))}
  </GlassCard>
);

const Loading: React.FC<{ title: string; onBack: () => void }> = ({ title, onBack }) => (
  <GlassScreen>
    <GlassHeader title={title} onBack={onBack} />
    <ActivityIndicator color={G.blue} style={styles.loader} />
  </GlassScreen>
);

/* ================= You won ================= */

export const YouWonScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { orderId } = route.params;
  const now = useNow();
  const { order } = useOrder(orderId);

  useEffect(() => {
    if (order?.payment_status === 'paid') navigation.replace('OrderDetail', { orderId });
  }, [order?.payment_status, navigation, orderId]);

  if (!order) return <Loading title="You won" onBack={() => navigation.goBack()} />;
  const left = deadline(order) - now;
  const expired = left <= 0 || order.fulfillment_status === 'cancelled';

  return (
    <GlassScreen>
      <GlassHeader title="You won" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Image source={require('../../../assets/icons/gavel.png')} style={styles.heroImg} />
          </View>
          <Text style={styles.heroTitle} accessibilityRole="header">
            You won the {shortTitle(order)}!
          </Text>
          <Text style={styles.heroSub}>
            Your winning bid was {formatCurrency(itemAmount(order))}.{' '}
            {expired ? 'The time to pay has passed.' : `Pay within ${BID_PAYMENT_DEADLINE_HOURS} hours to secure it.`}
          </Text>
        </View>
        {!expired ? (
          <View style={styles.timer}>
            <Text style={styles.timerLabel}>Time left to pay</Text>
            <Text style={styles.timerValue}>{leftLabel(left)}</Text>
          </View>
        ) : null}
        <ProductMini order={order} />
        <Text style={styles.h2}>What happens next</Text>
        <Timeline
          steps={[
            { title: 'Pay securely', sub: 'Your money is held, not sent to the seller', state: 'now' },
            { title: 'Checked at our hub', sub: 'We confirm it matches the listing', state: 'todo' },
            { title: 'Delivered to you', sub: 'Usually 1–2 days after the check', state: 'todo' },
            { title: 'You confirm, seller gets paid', sub: 'Or report a problem within 48 hours', state: 'todo' },
          ]}
        />
      </ScrollView>
      <View style={styles.bottom}>
        <PrimaryButton
          label={expired ? 'Payment window closed' : 'Pay now'}
          disabled={expired}
          onPress={() => navigation.navigate('Checkout', { orderId })}
        />
      </View>
    </GlassScreen>
  );
};

/* ================= Checkout · step 1 ================= */

export const CheckoutScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { orderId } = route.params;
  const now = useNow();
  const { order } = useOrder(orderId);
  const [method, setMethod] = useState<'delivery' | 'pickup' | null>(null);
  const [fee, setFee] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!order) return;
    setMethod(m => m ?? order.delivery_method ?? 'delivery');
    // Delivery price comes from the server; an order that's set to pickup carries 0, so ask the auction.
    if (order.delivery_method !== 'pickup' && Number(order.delivery_fee) > 0) setFee(Number(order.delivery_fee));
    else if (order.auction_id)
      api
        .get(`/auctions/${order.auction_id}`)
        .then(r => setFee(Number(r.data.data?.delivery_fee ?? 0)))
        .catch(() => setFee(0));
  }, [order]);

  if (!order || !method || fee === null) return <Loading title="Checkout" onBack={() => navigation.goBack()} />;
  const bid = itemAmount(order);
  const deliveryCost = method === 'pickup' ? 0 : fee;

  const next = async () => {
    setBusy(true);
    try {
      const updated = (await api.put(`/orders/${orderId}/delivery-method`, { method })).data.data;
      navigation.navigate(method === 'pickup' ? 'CheckoutPayment' : 'CheckoutAddress', { orderId, total: updated.total_amount });
    } catch (e: any) {
      toast(e?.response?.data?.error || e?.message || "Couldn't save that");
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassScreen>
      <GlassHeader title="Checkout" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Steps step={1} label="Order summary" />
        <ProductMini order={order} />
        <Text style={styles.label}>How do you want it?</Text>
        <View style={styles.gap10}>
          <Option
            on={method === 'delivery'}
            title="Deliver to me"
            sub="Lagos · 1–2 days after the hub check"
            right={fee ? formatCurrency(fee) : 'Free'}
            onPress={() => setMethod('delivery')}
          />
          <Option
            on={method === 'pickup'}
            title="Pick up at the hub"
            sub="Computer Village · after the hub check"
            right="Free"
            onPress={() => setMethod('pickup')}
          />
        </View>
        <GlassCard style={styles.summary}>
          <SumRow k="Winning bid" v={formatCurrency(bid)} />
          <SumRow k="Delivery" v={deliveryCost ? formatCurrency(deliveryCost) : 'Free'} />
          <SumRow k="Total" v={formatCurrency(bid + deliveryCost)} strong last />
        </GlassCard>
        <Text style={styles.footnote}>
          Pay within <Text style={styles.footStrong}>{leftLabel(deadline(order) - now)}</Text> or it goes to the next bidder.
        </Text>
      </ScrollView>
      <View style={styles.bottom}>
        <PrimaryButton label={busy ? 'Saving…' : 'Continue'} onPress={next} disabled={busy} />
      </View>
    </GlassScreen>
  );
};

const SumRow: React.FC<{ k: string; v: string; strong?: boolean; last?: boolean }> = ({ k, v, strong, last }) => (
  <View style={[styles.sumRow, !last && styles.divider]}>
    <Text style={styles.sumKey}>{k}</Text>
    <Text style={[styles.sumVal, strong && styles.sumStrong]}>{v}</Text>
  </View>
);

/* ================= Checkout · step 2 ================= */

const maskPhone = (p?: string) => {
  const d = (p ?? '').replace(/\D/g, '');
  if (d.length < 8) return p ?? '';
  const local = d.startsWith('234') ? `0${d.slice(3)}` : d;
  return `${local.slice(0, 4)} ••• ${local.slice(-4)}`;
};

export const CheckoutAddressScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { orderId } = route.params;
  const [list, setList] = useState<UserAddress[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seen = useRef<Set<string> | null>(null);

  useFocusEffect(
    useCallback(() => {
      addressService
        .listAddresses()
        .then(r => {
          const items = r.data ?? [];
          // Coming back from "Add a new address": pick the one just added.
          const added = seen.current ? items.find(a => !seen.current!.has(a.id)) : undefined;
          seen.current = new Set(items.map(a => a.id));
          setList(items);
          setPicked(p =>
            added?.id ?? (p && items.some(a => a.id === p) ? p : items.find(a => a.is_default)?.id ?? items[0]?.id ?? null)
          );
        })
        .catch(() => setList([]));
    }, [])
  );

  const use = async () => {
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
        delivery_note: a.delivery_note,
      });
      navigation.navigate('CheckoutPayment', { orderId });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't use that address");
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassScreen>
      <GlassHeader title="Delivery address" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Steps step={2} label="Delivery address" />
        {list === null ? (
          <ActivityIndicator color={G.blue} style={styles.loader} />
        ) : (
          <View style={styles.gap10}>
            {list.map(a => (
              <Option
                key={a.id}
                on={picked === a.id}
                title={a.label || 'Delivery address'}
                sub={[[a.address_line1, a.city].filter(Boolean).join(', '), maskPhone(a.phone_number)].filter(Boolean).join(' • ')}
                onPress={() => setPicked(a.id)}
              />
            ))}
            <Pressable
              onPress={() => navigation.navigate('AddressForm', { first: !list?.length })}
              style={({ pressed }) => [styles.addNew, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.addNewText}>+ Add a new address</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
      <View style={styles.bottom}>
        <PrimaryButton label={busy ? 'Saving…' : 'Use this address'} onPress={use} disabled={!picked || busy} />
      </View>
    </GlassScreen>
  );
};

/* ================= Checkout · step 3 ================= */

type PayChoice = { kind: 'saved'; card: SavedCard } | { kind: 'card' | 'bank_transfer' | 'ussd' };

export const CheckoutPaymentScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { orderId } = route.params;
  const { order } = useOrder(orderId);
  const [cards, setCards] = useState<SavedCard[] | null>(null);
  const [choice, setChoice] = useState<PayChoice | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    meService
      .cards()
      .then(c => {
        setCards(c);
        const def = c.find(x => x.is_default) ?? c[0];
        setChoice(prev => prev ?? (def ? { kind: 'saved', card: def } : { kind: 'card' }));
      })
      .catch(() => {
        setCards([]);
        setChoice(prev => prev ?? { kind: 'card' });
      });
  }, []);

  useEffect(() => {
    if (order?.payment_status === 'paid') navigation.replace('Paid', { orderId });
  }, [order?.payment_status, navigation, orderId]);

  if (!order || cards === null || !choice) return <Loading title="Payment" onBack={() => navigation.goBack()} />;

  const pay = async () => {
    if (choice.kind === 'saved') {
      setBusy(true);
      try {
        await meService.payWithCard(orderId, choice.card.id);
        navigation.replace('Paid', { orderId, paidWith: choice.card.label });
      } catch {
        // Declined: show what happened and the other ways to pay.
        navigation.navigate('PaymentFailed', { orderId, failedCardId: choice.card.id, failedLabel: choice.card.label });
      } finally {
        setBusy(false);
      }
      return;
    }
    if (choice.kind === 'bank_transfer') return navigation.navigate('BankTransfer', { orderId });
    if (choice.kind === 'ussd') return navigation.navigate('Ussd', { orderId });
    // Paystack checkout for a new card.
    navigation.navigate('Payment', {
      orderId,
      orderNumber: order.order_number,
      amount: order.total_amount,
      gadgetTitle: titleOf(order),
      channel: choice.kind,
    });
  };

  const on = (k: PayChoice['kind'], id?: string) =>
    choice.kind === k && (k !== 'saved' || (choice.kind === 'saved' && choice.card.id === id));

  return (
    <GlassScreen>
      <GlassHeader title="Payment" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Steps step={3} label="Pay" />
        <View style={styles.total}>
          <Text style={styles.totalLabel}>Total to pay</Text>
          <Text style={styles.totalValue}>{formatCurrency(order.total_amount)}</Text>
          {Number(order.delivery_fee) > 0 ? (
            <Text style={styles.totalSub}>
              {formatCurrency(itemAmount(order))} + {formatCurrency(order.delivery_fee)} delivery
            </Text>
          ) : (
            <Text style={styles.totalSub}>{order.delivery_method === 'pickup' ? 'Pick up at the hub · free' : 'Free delivery'}</Text>
          )}
        </View>
        <View style={styles.gap10}>
          {cards.map(c => (
            <Option
              key={c.id}
              on={on('saved', c.id)}
              title={c.label}
              sub={`Saved card · expires ${c.exp_month}/${c.exp_year.slice(-2)}`}
              onPress={() => setChoice({ kind: 'saved', card: c })}
            />
          ))}
          <Option on={on('card')} title="New card" sub="Debit or credit card" onPress={() => setChoice({ kind: 'card' })} />
          <Option
            on={on('bank_transfer')}
            title="Bank transfer"
            sub="One-time account number"
            onPress={() => setChoice({ kind: 'bank_transfer' })}
          />
          <Option on={on('ussd')} title="USSD" sub="GTBank, Zenith or UBA" onPress={() => setChoice({ kind: 'ussd' })} />
        </View>
        <View style={styles.secure}>
          <Ionicons name="lock-closed-outline" size={13} color={G.muted} />
          <Text style={styles.secureText}>Payments are processed securely by Paystack</Text>
        </View>
      </ScrollView>
      <View style={styles.bottom}>
        <PrimaryButton label={busy ? 'Paying…' : 'Pay now'} onPress={pay} disabled={busy} />
      </View>
    </GlassScreen>
  );
};

/* ================= Paid ================= */

export const PaidScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { orderId, paidWith } = route.params;
  const { order } = useOrder(orderId);
  if (!order) return <Loading title="Paid" onBack={() => navigation.goBack()} />;

  const when = new Date(order.updated_at ?? Date.now());
  const today = when.toDateString() === new Date().toDateString();
  const date = `${today ? 'Today' : when.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}, ${when
    .toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()}`;
  const pickup = order.delivery_method === 'pickup';

  return (
    <GlassScreen>
      <GlassHeader title="Paid" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Image source={require('../../../assets/icons/shield.png')} style={styles.heroImg} />
          </View>
          <Text style={styles.heroTitle} accessibilityRole="header">
            Payment received
          </Text>
          <Text style={styles.heroSub}>
            Your {formatCurrency(order.total_amount)} is held safely. The seller only gets paid after you confirm it{' '}
            {pickup ? 'at pickup' : 'arrived'}.
          </Text>
        </View>
        <GlassCard style={styles.summary}>
          <SumRow k="Order" v={order.order_number} />
          {paidWith ? <SumRow k="Paid with" v={paidWith} /> : null}
          <SumRow k="Amount" v={formatCurrency(order.total_amount)} />
          <SumRow k="Date" v={date} last />
        </GlassCard>
        <Text style={styles.h2}>Your order</Text>
        <Timeline
          steps={[
            { title: 'Paid', sub: 'Held in escrow', state: 'done' },
            { title: 'Seller drops it at the hub', sub: 'Usually within a day', state: 'now' },
            { title: 'Checked at our hub', sub: 'We confirm it matches the listing', state: 'todo' },
            pickup
              ? { title: 'Ready for pickup', sub: "We'll tell you when to collect it", state: 'todo' }
              : { title: 'Delivered to you', sub: '1–2 days after the check', state: 'todo' },
          ]}
        />
      </ScrollView>
      <View style={styles.bottom}>
        {/* Checkout is finished: don't leave its screens on the back stack. */}
        <PrimaryButton
          label="Track my order"
          onPress={() =>
            navigation.reset({ index: 1, routes: [{ name: 'MainTabs' }, { name: 'OrderDetail', params: { orderId } }] })
          }
        />
        <Pressable
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] })}
          style={styles.link}
          accessibilityRole="button"
        >
          <Text style={styles.linkText}>Keep browsing</Text>
        </Pressable>
      </View>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 30 },
  loader: { marginTop: 60 },
  pressed: { opacity: 0.7 },
  gap10: { gap: 10 },
  bottom: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28 },
  link: { alignItems: 'center', paddingVertical: 12 },
  linkText: { color: G.slate, fontSize: 14, fontFamily: fonts.medium },

  hero: { alignItems: 'center', marginTop: 4, marginBottom: 18 },
  heroIcon: { width: 84, height: 84, borderRadius: 24, backgroundColor: '#E9F7EE', alignItems: 'center', justifyContent: 'center' },
  heroImg: { width: 56, height: 56, resizeMode: 'contain' },
  heroTitle: { color: G.ink, fontSize: 22, fontFamily: fonts.medium, marginTop: 16, textAlign: 'center' },
  heroSub: { color: G.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, marginTop: 6, textAlign: 'center', paddingHorizontal: 10 },

  timer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#FFF4E8',
    marginBottom: 10,
  },
  timerLabel: { color: G.orangeInk, fontSize: 13, fontFamily: fonts.regular },
  timerValue: { color: G.orangeInk, fontSize: 20, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },

  mini: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  miniImage: { width: 52, height: 52, borderRadius: 12, backgroundColor: G.tile, alignItems: 'center', justifyContent: 'center' },
  miniImg: { width: 44, height: 44 },
  miniTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  miniSub: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },

  h2: { color: G.ink, fontSize: 16, fontFamily: fonts.medium, marginTop: 20, marginBottom: 10 },
  label: { color: G.slate, fontSize: 14, fontFamily: fonts.medium, marginTop: 18, marginBottom: 10 },

  timeline: { padding: 16 },
  tlRow: { flexDirection: 'row', gap: 12 },
  tlRail: { alignItems: 'center', width: 14 },
  tlDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: '#CED3DF', backgroundColor: 'transparent', marginTop: 3 },
  tlDone: { backgroundColor: G.green, borderColor: G.green },
  tlNow: { borderColor: G.blue, borderWidth: 3 },
  tlLine: { flex: 1, width: 1.5, backgroundColor: 'rgba(28,31,42,0.08)', marginVertical: 2 },
  tlBody: { flex: 1, paddingBottom: 14 },
  tlTitle: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  tlTitleNow: { color: G.blue },
  tlTitleTodo: { color: G.faint },
  tlSub: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },
  tlSubTodo: { color: G.faint },

  steps: { marginBottom: 14 },
  stepBars: { flexDirection: 'row', gap: 6 },
  stepBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.8)' },
  stepBarOn: { backgroundColor: G.blue },
  stepLabel: { color: G.muted, fontSize: 12, fontFamily: fonts.medium, letterSpacing: 0.4, marginTop: 10 },

  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderWidth: 1.5 },
  optionOn: { borderColor: '#AFC0F6', backgroundColor: 'rgba(238,242,255,0.75)' },
  optionTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  optionSub: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, marginTop: 2 },
  optionRight: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#CED3DF', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: G.blue, backgroundColor: G.blue },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },

  summary: { marginTop: 14, overflow: 'hidden' },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16 },
  divider: { borderBottomWidth: 1, borderBottomColor: 'rgba(28,31,42,0.05)' },
  sumKey: { color: G.muted, fontSize: 14, fontFamily: fonts.regular },
  sumVal: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  sumStrong: { fontSize: 16 },
  footnote: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center', marginTop: 14 },
  footStrong: { color: G.ink, fontFamily: fonts.medium },

  addNew: {
    height: 54,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(28,31,42,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addNewText: { color: G.blue, fontSize: 15, fontFamily: fonts.medium },

  total: { backgroundColor: '#1E222D', borderRadius: 18, padding: 18, marginBottom: 14 },
  totalLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontFamily: fonts.regular },
  totalValue: { color: '#FFFFFF', fontSize: 26, fontFamily: fonts.medium, marginTop: 4, fontVariant: ['tabular-nums'] },
  totalSub: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontFamily: fonts.regular, marginTop: 4 },
  secure: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16 },
  secureText: { color: G.muted, fontSize: 13, fontFamily: fonts.regular },
});
