import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
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
  FooterBar,
  SectionLabel,
  CONDITION_LABEL,
} from '../../components/glass';
import { fonts } from '../../constants';
import { caseService, Case } from '../../services/case.service';
import { useToastStore } from '../../store/toastStore';
import { formatCurrency } from '../../utils';

const toast = (m: string, t: 'success' | 'error' = 'error') => useToastStore.getState().show(m, t);
const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** Where returns go. Fill in the hub's street address and hours when they're confirmed. */
const HUB = {
  name: 'Gadgets Bidding hub',
  address: '2nd floor, 14 Ola-Ayeni Street, Computer Village, Ikeja',
  hours: 'Mon–Sat, 9–6',
};
const RETURN_DAYS = 5;

/* ---------- dates ---------- */
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return 'Today';
  if (sameDay(d, new Date(now.getTime() - 86400_000))) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
const stamp = (iso: string) => `${dayLabel(iso)}, ${timeLabel(iso)}`;
const inline = (iso: string) => {
  const l = dayLabel(iso);
  return l === 'Today' || l === 'Yesterday' ? l.toLowerCase() : l;
};

/** "phone", "laptop"… for sentences; falls back to "item". */
const thingOf = (c: Case) => {
  const t = (c.order.gadget?.title ?? '').toLowerCase();
  if (/iphone|pixel|galaxy s|phone|redmi|tecno|infinix/.test(t)) return 'phone';
  if (/macbook|laptop|thinkpad|xps|zenbook/.test(t)) return 'laptop';
  if (/ipad|tablet|tab /.test(t)) return 'tablet';
  if (/airpods|headphone|wh-1000|buds|earbuds/.test(t)) return 'headphones';
  if (/watch/.test(t)) return 'watch';
  if (/playstation|ps5|xbox|switch|console/.test(t)) return 'console';
  return 'item';
};

const isApple = (c: Case) =>
  /apple/i.test(c.order.gadget?.brand ?? '') || /iphone|ipad|macbook|airpods|apple watch|imac/i.test(c.order.gadget?.title ?? '');

/** A line about the listing's warranty for the not-upheld screen, or null when there isn't one. */
const warrantyLine = (c: Case) => {
  const w = c.order.gadget?.warranty;
  const thing = thingOf(c);
  const brand = c.order.gadget?.brand?.trim();
  if (w === 'applecare') return `The ${thing} came with AppleCare, so Apple can still check or repair it.`;
  if (w === 'manufacturer')
    return `The ${thing} came with the manufacturer's warranty, so ${brand || 'the maker'} can still check or repair it.`;
  if (w === 'seller') return `The listing included a seller warranty. Message the seller through this case if it acts up again.`;
  return null;
};

const useCase = (id: string) => {
  const [c, setC] = useState<Case | null>(null);
  const load = useCallback(async () => {
    try {
      setC(await caseService.get(id));
    } catch (e) {
      toast(errText(e, "Couldn't load this case. Try again."));
    }
  }, [id]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  return { c, setC, load };
};

const Loading: React.FC<{ title: string; onBack: () => void }> = ({ title, onBack }) => (
  <GlassScreen>
    <GlassHeader title={title} onBack={onBack} />
    <ActivityIndicator color={G.blue} style={styles.loader} />
  </GlassScreen>
);

const ItemCard: React.FC<{ c: Case; held?: boolean }> = ({ c, held = true }) => (
  <GlassCard style={styles.item}>
    <GadgetImage uri={c.order.gadget?.images?.[0]} size={44} style={styles.itemThumb} />
    <View style={styles.flex}>
      <Text style={styles.itemTitle} numberOfLines={1}>
        {c.order.gadget?.title ?? 'Your order'}
      </Text>
      <Text style={styles.itemSub}>
        Order {c.order.order_number}
        {held ? ` · ${formatCurrency(c.order.total_amount)} held` : ''}
      </Text>
      <Text style={styles.itemSub}>
        Case {c.case_number} · opened {inline(c.created_at)}
      </Text>
    </View>
  </GlassCard>
);

const Hero: React.FC<{ tint: string; title: string; sub: string }> = ({ tint, title, sub }) => (
  <View style={styles.hero}>
    <View style={[styles.heroTile, { backgroundColor: tint }]}>
      <Image source={require('../../../assets/icons/shield.png')} style={styles.heroImg} />
    </View>
    <Text style={styles.heroTitle} accessibilityRole="header">
      {title}
    </Text>
    <Text style={styles.heroSub}>{sub}</Text>
  </View>
);

const Row: React.FC<{ k: string; v: string; last?: boolean; strong?: boolean }> = ({ k, v, last, strong }) => (
  <View style={[styles.row, !last && styles.divider]}>
    <Text style={styles.rowKey}>{k}</Text>
    <Text style={[styles.rowVal, strong && styles.rowStrong]}>{v}</Text>
  </View>
);

/* ================= Case (dispatches on state) ================= */

export const CaseScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { disputeId } = route.params;
  const { c, setC, load } = useCase(disputeId);
  if (!c) return <Loading title="Case" onBack={() => navigation.goBack()} />;
  if (c.in_review) return <InReview c={c} setC={setC} navigation={navigation} />;
  if (c.outcome === 'refund') return <RefundDecided c={c} navigation={navigation} />;
  if (c.outcome === 'not_upheld') return <NotUpheld c={c} setC={setC} navigation={navigation} reload={load} />;
  return (
    <GlassScreen>
      <GlassHeader title={`Case ${c.case_number}`} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Hero tint="#F5F6F9" title="This case is closed" sub="Our team closed it. If you still need help, contact support." />
        <ItemCard c={c} held={false} />
      </ScrollView>
    </GlassScreen>
  );
};

/* ---------- In review ---------- */

const InReview: React.FC<{ c: Case; setC: (c: Case) => void; navigation: any }> = ({ c, setC, navigation }) => {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const second = !!c.second_review_requested_at;

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      setC(await caseService.message(c.id, body));
      setText('');
    } catch (e) {
      toast(errText(e, "Your message didn't send. Try again."));
    } finally {
      setSending(false);
    }
  };

  const steps: { title: string; sub: string; state: 'done' | 'now' | 'todo' }[] = [
    { title: 'Problem reported', sub: c.timeline.reported_at ? stamp(c.timeline.reported_at) : '', state: 'done' },
    c.timeline.seller_replied_at
      ? { title: 'Seller replied', sub: stamp(c.timeline.seller_replied_at), state: 'done' }
      : { title: 'Seller replies', sub: 'Usually within a day', state: 'todo' },
    {
      title: second ? 'Second review' : 'Team review',
      sub: c.next_step || (c.timeline.team_review_at ? `Since ${inline(c.timeline.team_review_at)}` : 'Starting soon'),
      state: 'now',
    },
    { title: 'Decision', sub: 'Refund, or payment released', state: 'todo' },
  ];

  return (
    <GlassScreen>
      <GlassHeader title={`Case ${c.case_number}`} onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <GlassCard style={styles.status}>
            <View style={styles.chipBlue}>
              <Text style={styles.chipBlueText}>{second ? 'Second review' : 'In review'}</Text>
            </View>
            <Text style={styles.statusTitle} accessibilityRole="header">
              Our team is reviewing it
            </Text>
            <Text style={styles.statusSub}>Usually decided within 2 working days. We may message you here.</Text>
          </GlassCard>

          <ItemCard c={c} />

          <GlassCard style={styles.timeline}>
            {steps.map((s, i) => (
              <View key={s.title} style={styles.tlRow}>
                <View style={styles.tlRail}>
                  <View style={[styles.tlDot, s.state === 'done' && styles.tlDone, s.state === 'now' && styles.tlNow]} />
                  {i < steps.length - 1 ? <View style={[styles.tlLine, s.state === 'done' && styles.tlLineDone]} /> : null}
                </View>
                <View style={styles.tlBody}>
                  <Text style={[styles.tlTitle, s.state === 'now' && styles.tlTitleNow, s.state === 'todo' && styles.tlTodoText]}>
                    {s.title}
                  </Text>
                  {s.sub ? <Text style={[styles.tlSub, s.state === 'todo' && styles.tlTodoText]}>{s.sub}</Text> : null}
                </View>
              </View>
            ))}
          </GlassCard>

          <View style={styles.section}>
            <SectionLabel>Your report</SectionLabel>
          </View>
          <GlassCard style={styles.report}>
            <View style={styles.chipRed}>
              <Text style={styles.chipRedText}>{c.problem.label}</Text>
            </View>
            <Text style={styles.quote}>“{c.problem.description}”</Text>
            {c.photos.length ? (
              <Text style={styles.reportMeta}>
                {c.photos.length} photo{c.photos.length > 1 ? 's' : ''}
              </Text>
            ) : null}
          </GlassCard>

          <View style={styles.section}>
            <SectionLabel>Messages</SectionLabel>
          </View>
          {c.messages.length === 0 ? (
            <Text style={styles.empty}>No messages yet. Our team will write here if we need anything.</Text>
          ) : (
            <View style={styles.messages}>
              {c.messages.map(m => (
                <View key={m.id} style={[styles.msgWrap, m.mine && styles.msgWrapMine]}>
                  <Text style={[styles.msgMeta, m.mine && styles.msgMetaMine]}>
                    {m.author} · {stamp(m.at)}
                  </Text>
                  <View style={[styles.bubble, m.mine ? styles.bubbleMine : m.role === 'team' ? styles.bubbleTeam : styles.bubbleOther]}>
                    <Text style={[styles.bubbleText, m.mine && styles.bubbleTextMine]}>{m.body}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={styles.compose}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Add more details for our team"
              placeholderTextColor={G.faint}
              style={styles.composeInput}
              multiline
              maxLength={2000}
              accessibilityLabel="Message for our team"
            />
            <Pressable
              onPress={send}
              disabled={!text.trim() || sending}
              style={({ pressed }) => [styles.send, (!text.trim() || sending) && styles.sendOff, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              {sending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Ionicons name="paper-plane" size={16} color="#FFFFFF" />}
            </Pressable>
          </View>

          <View style={styles.noteGreen}>
            <Text style={styles.noteText}>
              Your {formatCurrency(c.order.total_amount)} stays in escrow until this case is closed. The seller isn't paid.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </GlassScreen>
  );
};

/* ---------- Refund decided ---------- */

const RefundDecided: React.FC<{ c: Case; navigation: any }> = ({ c, navigation }) => {
  const r = c.return;
  const toCard = !!c.order.paid_with && c.order.paid_with !== 'Wallet';
  const refunded = r?.status === 'refunded';
  const title = refunded ? 'Your refund is on its way' : "You'll get a full refund";
  const sub = refunded
    ? r?.refund_destination === 'card'
      ? 'We got it back. Banks usually take 3–5 working days to show the money.'
      : 'We got it back and the money is in your wallet.'
    : r
      ? `Send the ${thingOf(c)} back to the hub. We'll refund you as soon as it arrives.`
      : `Send the ${thingOf(c)} back to the hub and we'll refund you as soon as it arrives.`;

  return (
    <GlassScreen>
      <GlassHeader title={`Case ${c.case_number}`} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Hero tint="#EEF9F2" title={title} sub={sub} />
        <ItemCard c={c} />
        <GlassCard style={styles.rows}>
          <Row k="Refund" v={formatCurrency(c.order.total_amount)} strong />
          <Row k="Delivery fee" v={c.order.delivery_fee > 0 ? 'Refunded too' : 'None paid'} />
          <Row k="To" v={toCard ? c.order.paid_with! : 'Your wallet'} />
          <Row
            k="When"
            v={refunded ? `Sent ${inline(r!.refunded_at!)}` : toCard ? '3–5 working days after it arrives' : 'As soon as it arrives'}
            last
          />
        </GlassCard>
        {c.findings ? (
          <GlassCard style={styles.found}>
            <Text style={styles.foundTitle}>What our team found</Text>
            <Text style={styles.foundText}>{c.findings}</Text>
          </GlassCard>
        ) : null}
        {!r ? (
          <View style={styles.noteAmber}>
            <Text style={styles.noteAmberText}>
              Return it within <Text style={styles.noteStrong}>{RETURN_DAYS} days</Text>. Returns are free.
            </Text>
          </View>
        ) : null}
      </ScrollView>
      {!refunded ? (
        <FooterBar>
          <PrimaryButton
            label={r ? 'See my return' : 'Start my return'}
            onPress={() => navigation.navigate('CaseReturn', { disputeId: c.id })}
          />
        </FooterBar>
      ) : null}
    </GlassScreen>
  );
};

/* ---------- Not upheld ---------- */

const NotUpheld: React.FC<{ c: Case; setC: (c: Case) => void; navigation: any; reload: () => void }> = ({
  c,
  setC,
  navigation,
}) => {
  const [busy, setBusy] = useState(false);
  const thing = thingOf(c);
  const ask = () =>
    Alert.alert(
      'Ask for a second review?',
      "A different person on our team looks at it again. You can do this once, and the seller's payment is held while we check.",
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Ask for a review',
          onPress: async () => {
            setBusy(true);
            try {
              setC(await caseService.secondReview(c.id));
              toast("We'll take another look and reply within 2 working days.", 'success');
            } catch (e) {
              toast(errText(e, "We couldn't do that. Try again."));
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );

  return (
    <GlassScreen>
      <GlassHeader title={`Case ${c.case_number}`} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Hero
          tint="#F1F5FF"
          title="The item matched the listing"
          sub={`Our hub re-tested the ${thing} and couldn't find a fault, so we're closing this case.`}
        />
        <ItemCard c={c} held={false} />
        {c.findings ? (
          <GlassCard style={styles.found}>
            <Text style={styles.foundTitle}>What our team found</Text>
            <Text style={styles.foundText}>{c.findings}</Text>
          </GlassCard>
        ) : null}
        <GlassCard style={styles.rows}>
          <Row k="Decision" v="Not upheld" />
          <Row k="Payment" v="Released to the seller" />
          <Row k={`The ${thing}`} v="Yours to keep" last />
        </GlassCard>
        <View style={styles.noteNeutral}>
          <Text style={styles.noteText}>
            {[
              warrantyLine(c),
              c.can_ask_second_review
                ? 'Still having trouble? You can ask for a second review once.'
                : "You've used your second review for this case. Contact support if you still need help.",
            ]
              .filter(Boolean)
              .join(' ')}
          </Text>
        </View>
      </ScrollView>
      <FooterBar>
        {c.can_ask_second_review ? (
          <PrimaryButton label={busy ? 'Sending…' : 'Ask for a second review'} onPress={ask} disabled={busy} />
        ) : null}
        <TextButton label="Back to my orders" onPress={() => navigation.navigate('Orders')} />
      </FooterBar>
    </GlassScreen>
  );
};

/* ================= Return ================= */

export const CaseReturnScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { disputeId } = route.params;
  const { c, setC } = useCase(disputeId);
  const [method, setMethod] = useState<'dropoff' | 'pickup'>('dropoff');
  const [checks, setChecks] = useState({ parts: false, account: false, photo: false });
  const [busy, setBusy] = useState(false);
  if (!c) return <Loading title="Return" onBack={() => navigation.goBack()} />;

  const r = c.return;
  const address = c.order.shipping_address;
  const addressLine = address ? [address.address_line1, address.city].filter(Boolean).join(', ') : null;
  const ready = checks.parts && checks.account;

  const start = async () => {
    setBusy(true);
    try {
      setC(await caseService.startReturn(c.id, method));
      toast('Return started. Keep your code handy.', 'success');
    } catch (e) {
      toast(errText(e, "We couldn't start the return. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const timeline: { title: string; sub: string; state: 'done' | 'now' | 'todo' }[] = [
    { title: 'Return started', sub: r ? dayLabel(r.started_at) : 'Today', state: r ? 'done' : 'now' },
    {
      title: 'Received at hub',
      sub: r?.received_at ? dayLabel(r.received_at) : `Within ${RETURN_DAYS} days`,
      state: r?.received_at ? 'done' : r ? 'now' : 'todo',
    },
    {
      title: 'Refund sent',
      sub: r?.refunded_at
        ? dayLabel(r.refunded_at)
        : c.order.paid_with && c.order.paid_with !== 'Wallet'
          ? '3–5 working days after, to your card or bank'
          : 'To your wallet as soon as it arrives',
      state: r?.refunded_at ? 'done' : 'todo',
    },
  ];

  const Check: React.FC<{ k: keyof typeof checks; label: string; last?: boolean }> = ({ k, label, last }) => (
    <Pressable
      onPress={() => setChecks(s => ({ ...s, [k]: !s[k] }))}
      style={[styles.checkRow, !last && styles.divider]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: checks[k] }}
      accessibilityLabel={label}
    >
      <View style={[styles.box, checks[k] && styles.boxOn]}>
        {checks[k] ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );

  return (
    <GlassScreen>
      <GlassHeader title="Return" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          Send it back to the hub
        </Text>
        <Text style={styles.sub}>Free. Pack the {thingOf(c)} with everything it came with.</Text>

        {r ? (
          <GlassCard style={styles.codeCard}>
            <Text style={styles.codeLabel}>Your return code</Text>
            <Text style={styles.code} selectable>
              {r.code}
            </Text>
            <Text style={styles.codeHint}>
              {r.method === 'pickup'
                ? 'Give this code to the rider when they collect it.'
                : `Show this code at the ${HUB.name}, ${HUB.address} (${HUB.hours}).`}{' '}
              Return it by {new Date(r.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.
            </Text>
          </GlassCard>
        ) : (
          <>
            <View style={styles.options}>
              <Option
                on={method === 'dropoff'}
                title="Drop it at the hub"
                sub={`${HUB.address} · ${HUB.hours}`}
                onPress={() => setMethod('dropoff')}
              />
              <Option
                on={method === 'pickup'}
                title="Rider pickup from my address"
                sub={addressLine ? `${addressLine} · we'll text you a time` : 'Add a delivery address first'}
                onPress={() => addressLine && setMethod('pickup')}
                disabled={!addressLine}
              />
            </View>
            <View style={styles.section}>
              <SectionLabel>Before you send it</SectionLabel>
            </View>
            <GlassCard style={styles.checks}>
              <Check k="parts" label={`The ${thingOf(c)}, box and cable`} />
              <Check
                k="account"
                label={isApple(c) ? 'Signed out of iCloud and reset' : 'Signed out of your Google account and reset'}
              />
              <Check k="photo" label="A photo of the packed box (optional)" last />
            </GlassCard>
          </>
        )}

        <GlassCard style={styles.returnTimeline}>
          {timeline.map((s, i) => (
            <View key={s.title} style={styles.tlRow}>
              <View style={styles.tlRail}>
                <View style={[styles.tlDot, s.state === 'done' && styles.tlDone, s.state === 'now' && styles.tlNow]} />
                {i < timeline.length - 1 ? <View style={styles.tlLine} /> : null}
              </View>
              <View style={styles.tlBody}>
                <Text style={[styles.tlTitle, s.state === 'now' && styles.tlTitleNow, s.state === 'todo' && styles.tlTodoText]}>
                  {s.title}
                </Text>
                <Text style={[styles.tlSub, s.state === 'todo' && styles.tlTodoText]}>{s.sub}</Text>
              </View>
            </View>
          ))}
        </GlassCard>
      </ScrollView>
      <FooterBar>
        {r ? (
          <PrimaryButton label="Done" onPress={() => navigation.goBack()} />
        ) : (
          <>
            <PrimaryButton label={busy ? 'Starting…' : 'Get return code'} onPress={start} disabled={!ready || busy} />
            {!ready ? <Text style={styles.footHint}>Tick the first two boxes to get your code.</Text> : null}
          </>
        )}
      </FooterBar>
    </GlassScreen>
  );
};

const Option: React.FC<{ on: boolean; title: string; sub: string; onPress: () => void; disabled?: boolean }> = ({
  on,
  title,
  sub,
  onPress,
  disabled,
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={[styles.option, on && styles.optionOn, disabled && styles.optionOff]}
    accessibilityRole="radio"
    accessibilityState={{ selected: on, disabled }}
  >
    <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
    <View style={styles.flex}>
      <Text style={styles.optionTitle}>{title}</Text>
      <Text style={styles.optionSub}>{sub}</Text>
    </View>
    <Text style={styles.free}>Free</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  loader: { marginTop: 60 },
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  section: { marginTop: 20 },
  divider: { borderBottomWidth: 1, borderBottomColor: 'rgba(28,31,42,0.05)' },

  status: { padding: 16 },
  chipBlue: { alignSelf: 'flex-start', height: 26, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#F1F5FF', justifyContent: 'center' },
  chipBlueText: { color: '#3E6AF0', fontSize: 12, fontFamily: fonts.medium },
  statusTitle: { color: G.ink, fontSize: 19, fontFamily: fonts.medium, marginTop: 10 },
  statusSub: { color: G.slate, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular, marginTop: 4 },

  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginTop: 12 },
  itemThumb: { width: 52, height: 52, borderRadius: 12 },
  itemTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  itemSub: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },

  timeline: { padding: 16, marginTop: 12 },
  returnTimeline: { padding: 16, marginTop: 16 },
  tlRow: { flexDirection: 'row', gap: 12 },
  tlRail: { alignItems: 'center', width: 14 },
  tlDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: '#D6DAE4', marginTop: 3 },
  tlDone: { backgroundColor: '#2E9E5E', borderColor: '#2E9E5E' },
  tlNow: { borderColor: G.blue, borderWidth: 3, backgroundColor: '#FFFFFF' },
  tlLine: { flex: 1, width: 1.5, backgroundColor: 'rgba(28,31,42,0.08)', marginVertical: 3 },
  tlLineDone: { backgroundColor: '#2E9E5E' },
  tlBody: { flex: 1, paddingBottom: 14 },
  tlTitle: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  tlTitleNow: { color: G.blue600 },
  tlTodoText: { color: G.faint },
  tlSub: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },

  report: { padding: 16, gap: 8 },
  chipRed: { alignSelf: 'flex-start', height: 26, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#FDF0F2', justifyContent: 'center' },
  chipRedText: { color: '#D9536A', fontSize: 12, fontFamily: fonts.medium },
  quote: { color: G.ink, fontSize: 14, lineHeight: 21, fontFamily: fonts.regular },
  reportMeta: { color: G.muted, fontSize: 12, fontFamily: fonts.regular },

  empty: { color: G.muted, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular },
  messages: { gap: 12 },
  msgWrap: { alignItems: 'flex-start', maxWidth: '88%' },
  msgWrapMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  msgMeta: { color: G.muted, fontSize: 11, fontFamily: fonts.regular, marginBottom: 4 },
  msgMetaMine: { textAlign: 'right' },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  bubbleMine: { backgroundColor: G.blue, borderBottomRightRadius: 6 },
  bubbleOther: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 6 },
  bubbleTeam: { backgroundColor: '#F1F5FF', borderBottomLeftRadius: 6 },
  bubbleText: { color: G.ink, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  bubbleTextMine: { color: '#FFFFFF' },

  compose: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 16 },
  composeInput: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: G.ink,
  },
  send: { width: 48, height: 48, borderRadius: 14, backgroundColor: G.blue, alignItems: 'center', justifyContent: 'center' },
  sendOff: { backgroundColor: '#C9D5FA' },

  noteGreen: { padding: 14, borderRadius: 16, backgroundColor: '#EEF9F2', marginTop: 16 },
  noteNeutral: { padding: 14, borderRadius: 16, backgroundColor: '#F5F6F9', marginTop: 12 },
  noteAmber: { padding: 14, borderRadius: 16, backgroundColor: '#FFF6EE', marginTop: 12 },
  noteText: { color: G.ink, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular },
  noteAmberText: { color: '#B5621F', fontSize: 13, lineHeight: 19, fontFamily: fonts.regular },
  noteStrong: { fontFamily: fonts.medium, color: '#DB7A2E' },

  hero: { alignItems: 'center', marginTop: 8, marginBottom: 16 },
  heroTile: { width: 88, height: 88, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  heroImg: { width: 60, height: 60, resizeMode: 'contain' },
  heroTitle: { color: G.ink, fontSize: 24, fontFamily: fonts.medium, marginTop: 16, textAlign: 'center' },
  heroSub: { color: G.muted, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular, marginTop: 6, textAlign: 'center', paddingHorizontal: 8 },

  rows: { marginTop: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rowKey: { color: G.muted, fontSize: 14, fontFamily: fonts.regular },
  rowVal: { color: G.ink, fontSize: 14, fontFamily: fonts.medium, flexShrink: 1, textAlign: 'right' },
  rowStrong: { fontVariant: ['tabular-nums'] },
  found: { padding: 16, marginTop: 12 },
  foundTitle: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  foundText: { color: G.slate, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular, marginTop: 6 },

  title: { color: G.ink, fontSize: 26, lineHeight: 32, letterSpacing: -0.4, fontFamily: fonts.medium, marginTop: 4 },
  sub: { color: G.muted, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular, marginTop: 6 },
  options: { gap: 10, marginTop: 20 },
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
  optionOff: { opacity: 0.6 },
  optionTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  optionSub: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, marginTop: 2 },
  free: { color: G.ink, fontSize: 13, fontFamily: fonts.medium },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#CED3DF', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: G.blue, backgroundColor: G.blue },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  checks: { overflow: 'hidden' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 52 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#CED3DF', alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: G.blue, borderColor: G.blue },
  checkLabel: { flex: 1, color: G.ink, fontSize: 14, fontFamily: fonts.regular },
  codeCard: { padding: 20, marginTop: 20, alignItems: 'center' },
  codeLabel: { color: G.muted, fontSize: 13, fontFamily: fonts.regular },
  code: { color: G.ink, fontSize: 30, letterSpacing: 2, fontFamily: fonts.medium, marginTop: 8 },
  codeHint: { color: G.slate, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular, textAlign: 'center', marginTop: 10 },
  footHint: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, textAlign: 'center', marginTop: 8 },
});

// Kept for callers that only need the label (e.g. the orders list).
export const conditionOf = (c: Case) => CONDITION_LABEL[c.order.gadget?.condition ?? ''] ?? null;
