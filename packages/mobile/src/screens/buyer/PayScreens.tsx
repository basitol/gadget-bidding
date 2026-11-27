import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Image, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  GadgetImage,
  PrimaryButton,
  TextButton,
  CheckList,
  DueBanner,
  FooterBar,
  SectionLabel,
  useNow,
} from '../../components/glass';
import { fonts } from '../../constants';
import { orderService } from '../../services';
import type { BankTransferDetails, UssdBank, UssdDetails } from '../../services/order.service';
import { meService, SavedCard } from '../../services/me.service';
import { useToastStore } from '../../store/toastStore';
import { formatCurrency } from '../../utils';

const toast = (m: string, t: 'success' | 'error' = 'error') => useToastStore.getState().show(m, t);
// RN core still ships its clipboard module (deprecated, but no extra native dependency or rebuild).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Clipboard: { setString(value: string): void } = require('react-native/Libraries/Components/Clipboard/Clipboard').default;
const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** "29:45" */
const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
/** "18h 41m" / "41m" */
const hm = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};
const copy = (value: string, what: string) => {
  Clipboard.setString(value);
  toast(`${what} copied`, 'success');
};
/** "9 123 456 780": easier to read out and type. */
const spaced = (acct: string) => acct.replace(/(\d)(?=(\d{3})+$)/g, '$1 ').replace(/^(\d{1,3}) /, '$1 ');

const useOrder = (orderId: string) => {
  const [order, setOrder] = useState<any>(null);
  const load = useCallback(async () => {
    try {
      setOrder((await orderService.getOrder(orderId)).data);
    } catch (e) {
      toast(errText(e, "Couldn't load your order"));
    }
  }, [orderId]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  return { order, load };
};

/**
 * After "I've sent the money": keep asking until the money lands (transfers and USSD
 * usually take under a minute), then move to the Paid screen.
 */
const useSettlement = (orderId: string, reference: string | null, paidWith: string, navigation: any) => {
  const [waiting, setWaiting] = useState(false);
  const [slow, setSlow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tries = useRef(0);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  const poll = useCallback(async () => {
    if (!reference) return;
    try {
      const state = await orderService.paymentStatus(orderId, reference);
      if (state === 'paid') {
        stop();
        setWaiting(false);
        navigation.replace('Paid', { orderId, paidWith });
        return;
      }
      if (state === 'failed') {
        stop();
        setWaiting(false);
        toast("Your bank didn't complete the payment. No money was taken. Try again or pay another way.");
        return;
      }
    } catch {
      // Network blip: keep trying.
    }
    tries.current += 1;
    if (tries.current >= 12) setSlow(true);
    timer.current = setTimeout(poll, 5000);
  }, [orderId, reference, paidWith, navigation]);

  const start = () => {
    if (waiting) return;
    tries.current = 0;
    setSlow(false);
    setWaiting(true);
    poll();
  };
  return { waiting, slow, start };
};

const WaitingNote: React.FC<{ slow: boolean }> = ({ slow }) => (
  <View style={styles.waiting} accessibilityLiveRegion="polite">
    <ActivityIndicator color={G.blue600} />
    <Text style={styles.waitingText}>
      {slow
        ? "Still waiting for your bank. You can leave this screen. We'll tell you the moment it lands."
        : 'Checking with your bank…'}
    </Text>
  </View>
);

/* ================= Bank transfer ================= */

export const BankTransferScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { orderId } = route.params;
  const now = useNow();
  const [details, setDetails] = useState<BankTransferDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const settle = useSettlement(orderId, details?.reference ?? null, 'Bank transfer', navigation);

  const open = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDetails(await orderService.startBankTransfer(orderId));
    } catch (e) {
      setError(errText(e, "Bank transfer isn't available right now. Try another way to pay."));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    open();
  }, [open]);

  const left = details ? new Date(details.expires_at).getTime() - now : 0;
  const expired = !!details && left <= 0;

  return (
    <GlassScreen>
      <GlassHeader title="Bank transfer" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color={G.blue} style={styles.loader} />
        ) : error || !details ? (
          <View style={styles.problem}>
            <Text style={styles.title}>We couldn't open a transfer account</Text>
            <Text style={styles.sub}>{error}</Text>
          </View>
        ) : (
          <>
            {expired ? (
              <View style={[styles.expiredBanner]}>
                <Text style={styles.expiredText}>This account has expired. Get a new one before you send money.</Text>
              </View>
            ) : (
              <DueBanner label="This account expires in" value={mmss(left)} />
            )}
            <Text style={styles.title} accessibilityRole="header">
              Transfer exactly {formatCurrency(details.amount)}
            </Text>
            <Text style={styles.sub}>From any Nigerian bank app. Send the exact amount in one transfer.</Text>

            <GlassCard style={styles.details}>
              <DetailRow label="Bank" value={details.bank_name} />
              <DetailRow
                label="Account number"
                value={spaced(details.account_number)}
                onCopy={() => copy(details.account_number, 'Account number')}
                big
              />
              <DetailRow label="Account name" value={details.account_name} />
              <DetailRow
                label="Amount"
                value={formatCurrency(details.amount)}
                onCopy={() => copy(String(Math.round(details.amount)), 'Amount')}
                big
                last
              />
            </GlassCard>

            <CheckList
              style={styles.checks}
              items={[
                'This account is only for this order and works once',
                'Sending a different amount delays your order',
                'No extra fee from us',
              ]}
            />
            {settle.waiting ? <WaitingNote slow={settle.slow} /> : null}
          </>
        )}
      </ScrollView>
      <FooterBar>
        {details && expired ? (
          <PrimaryButton label="Get a new account" onPress={open} />
        ) : (
          <PrimaryButton
            label={settle.waiting ? 'Waiting for your bank…' : "I've sent the money"}
            onPress={settle.start}
            disabled={!details || settle.waiting}
          />
        )}
        <TextButton label="Pay another way" onPress={() => navigation.goBack()} />
      </FooterBar>
    </GlassScreen>
  );
};

const DetailRow: React.FC<{ label: string; value: string; onCopy?: () => void; big?: boolean; last?: boolean }> = ({
  label,
  value,
  onCopy,
  big,
  last,
}) => (
  <View style={[styles.detailRow, !last && styles.divider]}>
    <View style={styles.flex}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, big && styles.detailBig]} selectable>
        {value}
      </Text>
    </View>
    {onCopy ? <CopyButton onPress={onCopy} label={`Copy ${label.toLowerCase()}`} /> : null}
  </View>
);

const CopyButton: React.FC<{ onPress: () => void; label: string }> = ({ onPress, label }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.copy, pressed && styles.pressed]}
    accessibilityRole="button"
    accessibilityLabel={label}
    hitSlop={6}
  >
    <Ionicons name="copy-outline" size={15} color={G.ink} />
    <Text style={styles.copyText}>Copy</Text>
  </Pressable>
);

/* ================= USSD ================= */

/** Banks whose USSD works with our payment provider (checked against Paystack). */
const USSD_BANKS: { code: UssdBank; name: string }[] = [
  { code: '737', name: 'GTBank' },
  { code: '966', name: 'Zenith Bank' },
  { code: '919', name: 'UBA' },
];

export const UssdScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { orderId } = route.params;
  const { order } = useOrder(orderId);
  const [bank, setBank] = useState<UssdBank | 'other' | null>(null);
  const [codes, setCodes] = useState<Partial<Record<UssdBank, UssdDetails>>>({});
  const [loading, setLoading] = useState(false);
  const current = bank && bank !== 'other' ? codes[bank] : undefined;
  const settle = useSettlement(orderId, current?.reference ?? null, 'USSD', navigation);

  const pick = async (code: UssdBank | 'other') => {
    setBank(code);
    if (code === 'other' || codes[code]) return;
    setLoading(true);
    try {
      const d = await orderService.startUssd(orderId, code);
      setCodes(c => ({ ...c, [code]: d }));
    } catch (e) {
      toast(errText(e, "That bank's USSD isn't available right now. Try bank transfer."));
      setBank(null);
    } finally {
      setLoading(false);
    }
  };

  const dial = (code: string) =>
    Linking.openURL(`tel:${code.replace(/#/g, '%23')}`).catch(() =>
      toast(`Dial ${code} on the phone linked to your bank account.`)
    );

  const bankName = USSD_BANKS.find(b => b.code === bank)?.name ?? '';

  return (
    <GlassScreen>
      <GlassHeader title="Pay with USSD" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, styles.titleTop]} accessibilityRole="header">
          Pay {order ? formatCurrency(order.total_amount) : ''} with USSD
        </Text>
        <Text style={styles.sub}>Works on any phone, no internet needed.</Text>

        <View style={styles.section}>
          <SectionLabel>Your bank</SectionLabel>
        </View>
        <View style={styles.banks} accessibilityRole="radiogroup">
          {[...USSD_BANKS, { code: 'other' as const, name: 'Other' }].map(b => {
            const on = bank === b.code;
            return (
              <Pressable
                key={b.code}
                onPress={() => pick(b.code)}
                style={[styles.bankChip, on && styles.bankChipOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.bankText, on && styles.bankTextOn]}>{b.name}</Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <ActivityIndicator color={G.blue} style={styles.loader} />
        ) : bank === 'other' ? (
          <GlassCard style={styles.codeCard}>
            <Text style={styles.codeHint}>
              Your bank's USSD doesn't work with us yet. Bank transfer works with every Nigerian bank and takes about a
              minute.
            </Text>
            <PrimaryButton
              label="Pay by bank transfer"
              compact
              onPress={() => navigation.replace('BankTransfer', { orderId })}
              style={styles.codeButton}
            />
          </GlassCard>
        ) : current ? (
          <GlassCard style={styles.codeCard}>
            <Text style={styles.codeHint}>Dial this code from the phone number linked to your {bankName} account</Text>
            <Text style={styles.code} selectable accessibilityLabel={`USSD code ${current.ussd_code.split('').join(' ')}`}>
              {current.ussd_code}
            </Text>
            <View style={styles.codeActions}>
              <CopyButton onPress={() => copy(current.ussd_code, 'Code')} label="Copy code" />
              <PrimaryButton label="Dial now" compact onPress={() => dial(current.ussd_code)} />
            </View>
          </GlassCard>
        ) : null}

        <CheckList
          style={styles.checks}
          items={[
            'Your bank may charge its usual USSD fee',
            'Follow the prompts and enter your PIN on your phone — never in this app',
            'Come back here when your bank confirms',
          ]}
        />
        {settle.waiting ? <WaitingNote slow={settle.slow} /> : null}
      </ScrollView>
      <FooterBar>
        <PrimaryButton
          label={settle.waiting ? 'Waiting for your bank…' : "I've completed it"}
          onPress={settle.start}
          disabled={!current || settle.waiting}
        />
        <TextButton label="Pay another way" onPress={() => navigation.goBack()} />
      </FooterBar>
    </GlassScreen>
  );
};

/* ================= Payment didn't go through ================= */

type Choice = { kind: 'saved'; card: SavedCard } | { kind: 'card' | 'bank_transfer' | 'ussd' };

export const PaymentFailedScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { orderId, failedCardId, failedLabel } = route.params ?? {};
  const now = useNow(30_000);
  const { order } = useOrder(orderId);
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [choice, setChoice] = useState<Choice>({ kind: 'card' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    meService
      .cards()
      .then(setCards)
      .catch(() => setCards([]));
  }, []);

  if (!order) {
    return (
      <GlassScreen>
        <GlassHeader title="Payment" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={G.blue} style={styles.loader} />
      </GlassScreen>
    );
  }

  const left = order.payment_due_at ? new Date(order.payment_due_at).getTime() - now : 0;
  const item = Number(order.item_amount ?? Number(order.total_amount) - Number(order.delivery_fee ?? 0));
  const failedCard = cards.find(c => c.id === failedCardId);
  const otherCards = cards.filter(c => c.id !== failedCardId);
  const on = (k: Choice['kind'], id?: string) => choice.kind === k && (k !== 'saved' || (choice as any).card?.id === id);

  const pay = async () => {
    if (choice.kind === 'saved') {
      setBusy(true);
      try {
        await meService.payWithCard(orderId, choice.card.id);
        navigation.replace('Paid', { orderId, paidWith: choice.card.label });
      } catch (e) {
        navigation.setParams({ failedCardId: choice.card.id, failedLabel: choice.card.label });
        toast(errText(e, 'That card was declined too. No money was taken.'));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (choice.kind === 'bank_transfer') return navigation.navigate('BankTransfer', { orderId });
    if (choice.kind === 'ussd') return navigation.navigate('Ussd', { orderId });
    navigation.navigate('Payment', {
      orderId,
      orderNumber: order.order_number,
      amount: order.total_amount,
      gadgetTitle: order.gadget?.title,
      channel: 'card',
    });
  };

  const label =
    choice.kind === 'saved'
      ? `Pay with ${choice.card.label}`
      : choice.kind === 'bank_transfer'
        ? 'Pay by bank transfer'
        : choice.kind === 'ussd'
          ? 'Pay with USSD'
          : 'Pay with another card';

  const last4 = String(failedLabel ?? '').match(/(\d{4})\s*$/)?.[1];
  const declinedWhat = last4 ? `the card ending ${last4}` : 'your payment';

  return (
    <GlassScreen>
      <GlassHeader title="Payment" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={[styles.heroTile, styles.heroTileRed]}>
            <Image source={require('../../../assets/icons/wallet.png')} style={styles.heroImg} />
          </View>
          <Text style={styles.heroTitle} accessibilityRole="header">
            Payment didn't go through
          </Text>
          <Text style={styles.heroSub}>Your bank declined {declinedWhat}. No money was taken.</Text>
        </View>

        {left > 0 ? <DueBanner label="You still have time to pay" value={hm(left)} /> : null}

        <GlassCard style={styles.item}>
          <GadgetImage uri={order.gadget?.images?.[0]} size={44} style={styles.itemThumb} />
          <View style={styles.flex}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {order.gadget?.title ?? 'Your gadget'}
            </Text>
            <Text style={styles.itemSub}>
              You won at <Text style={styles.itemStrong}>{formatCurrency(item)}</Text>
            </Text>
            <Text style={styles.itemSub}>Order {order.order_number}</Text>
          </View>
        </GlassCard>

        <Text style={styles.label}>Pay with</Text>
        <View style={styles.options}>
          {failedCard ? (
            <View style={[styles.option, styles.optionOff]} accessibilityState={{ disabled: true }}>
              <View style={styles.radio} />
              <View style={styles.flex}>
                <Text style={styles.optionTitle}>Card ending {failedCard.last4}</Text>
                <Text style={styles.optionSub}>
                  {failedCard.brand.charAt(0).toUpperCase() + failedCard.brand.slice(1)} · expires {failedCard.exp_month}/
                  {failedCard.exp_year.slice(-2)}
                </Text>
              </View>
              <View style={styles.declined}>
                <Text style={styles.declinedText}>Declined</Text>
              </View>
            </View>
          ) : null}
          {otherCards.map(c => (
            <Option key={c.id} on={on('saved', c.id)} title={c.label} sub={`Saved card · expires ${c.exp_month}/${c.exp_year.slice(-2)}`} onPress={() => setChoice({ kind: 'saved', card: c })} />
          ))}
          <Option on={on('card')} title="Another card" sub="Debit or credit card, via Paystack" onPress={() => setChoice({ kind: 'card' })} />
          <Option on={on('bank_transfer')} title="Bank transfer" sub="Pay to a one-time account number" onPress={() => setChoice({ kind: 'bank_transfer' })} />
          <Option on={on('ussd')} title="USSD" sub="Pay with your bank's USSD code" onPress={() => setChoice({ kind: 'ussd' })} />
        </View>

        <GlassCard style={styles.summary}>
          <SumRow k="Winning bid" v={formatCurrency(item)} />
          <SumRow k="Delivery" v={Number(order.delivery_fee) > 0 ? formatCurrency(order.delivery_fee) : 'Free'} />
          <SumRow k="Total" v={formatCurrency(order.total_amount)} last />
        </GlassCard>
        <Text style={styles.footnote}>
          If you don't pay in time, the item goes to the next bidder and it counts as a missed payment on your account.
        </Text>
      </ScrollView>
      <FooterBar>
        <PrimaryButton label={busy ? 'Paying…' : label} onPress={pay} disabled={busy || left <= 0} />
        {/* Support chat about this order, same as the order page's "Get help". */}
        <TextButton
          label="Get help with payment"
          onPress={() => navigation.navigate('SupportChat', { orderId: order.id, orderNumber: order.order_number })}
        />
      </FooterBar>
    </GlassScreen>
  );
};

const Option: React.FC<{ on: boolean; title: string; sub: string; onPress: () => void }> = ({ on, title, sub, onPress }) => (
  <Pressable
    onPress={onPress}
    style={[styles.option, on && styles.optionOn]}
    accessibilityRole="radio"
    accessibilityState={{ selected: on }}
  >
    <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
    <View style={styles.flex}>
      <Text style={styles.optionTitle}>{title}</Text>
      <Text style={styles.optionSub}>{sub}</Text>
    </View>
  </Pressable>
);

const SumRow: React.FC<{ k: string; v: string; last?: boolean }> = ({ k, v, last }) => (
  <View style={[styles.sumRow, !last && styles.divider]}>
    <Text style={styles.sumKey}>{k}</Text>
    <Text style={styles.sumVal}>{v}</Text>
  </View>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  loader: { marginTop: 40 },
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  section: { marginTop: 20 },

  title: { color: G.ink, fontSize: 26, lineHeight: 32, letterSpacing: -0.4, fontFamily: fonts.medium, marginTop: 24 },
  titleTop: { marginTop: 4 },
  sub: { color: G.muted, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular, marginTop: 6 },
  problem: { marginTop: 20 },

  expiredBanner: { padding: 14, borderRadius: 16, backgroundColor: '#FDF0F2' },
  expiredText: { color: '#B03A50', fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },

  details: { marginTop: 20, overflow: 'hidden' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: 'rgba(28,31,42,0.05)' },
  detailLabel: { color: G.muted, fontSize: 12, fontFamily: fonts.regular },
  detailValue: { color: G.ink, fontSize: 16, fontFamily: fonts.medium, marginTop: 3 },
  detailBig: { fontSize: 20, fontVariant: ['tabular-nums'] },
  copy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEFF4',
  },
  copyText: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },

  checks: { marginTop: 20 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, padding: 14, borderRadius: 16, backgroundColor: '#F1F5FF' },
  waitingText: { flex: 1, color: '#3E6AF0', fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },

  banks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bankChip: { height: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#FFFFFF', justifyContent: 'center' },
  bankChipOn: { backgroundColor: G.ink },
  bankText: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  bankTextOn: { color: '#FFFFFF' },

  codeCard: { marginTop: 16, padding: 20, alignItems: 'center' },
  codeHint: { color: G.slate, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, textAlign: 'center' },
  code: { color: G.ink, fontSize: 28, fontFamily: fonts.medium, marginTop: 16, letterSpacing: 0.5, fontVariant: ['tabular-nums'] },
  codeActions: { flexDirection: 'row', gap: 10, marginTop: 16, alignItems: 'center' },
  codeButton: { marginTop: 16 },

  hero: { alignItems: 'center', marginTop: 8, marginBottom: 20 },
  heroTile: { width: 88, height: 88, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  heroTileRed: { backgroundColor: '#FDF0F2' },
  heroImg: { width: 60, height: 60, resizeMode: 'contain' },
  heroTitle: { color: G.ink, fontSize: 24, fontFamily: fonts.medium, marginTop: 16, textAlign: 'center' },
  heroSub: { color: G.muted, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular, marginTop: 6, textAlign: 'center' },

  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginTop: 12 },
  itemThumb: { width: 56, height: 56, borderRadius: 12 },
  itemTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  itemSub: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },
  itemStrong: { color: G.ink, fontFamily: fonts.medium },

  label: { color: G.slate, fontSize: 14, fontFamily: fonts.medium, marginTop: 20, marginBottom: 10 },
  options: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.75)',
    backgroundColor: 'rgba(255,255,255,0.56)',
  },
  optionOn: { borderColor: '#AFC0F6', backgroundColor: 'rgba(238,242,255,0.85)' },
  optionOff: { opacity: 0.85 },
  optionTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  optionSub: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#CED3DF', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: G.blue, backgroundColor: G.blue },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  declined: { height: 26, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#FDF0F2', justifyContent: 'center' },
  declinedText: { color: '#D9536A', fontSize: 12, fontFamily: fonts.medium },

  summary: { marginTop: 16, overflow: 'hidden' },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16 },
  sumKey: { color: G.muted, fontSize: 14, fontFamily: fonts.regular },
  sumVal: { color: G.ink, fontSize: 14, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  footnote: { color: G.muted, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular, textAlign: 'center', marginTop: 14 },
});
