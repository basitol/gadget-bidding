import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import { G, GlassScreen, GlassHeader, GlassCard, FooterBar, PrimaryButton, TextButton } from '../../../components/glass';
import { fonts } from '../../../constants';
import { Case, sellerCaseService } from '../../../services/case.service';
import { formatCurrency } from '../../../utils';
import { Hero, Label, Note, TINT } from '../onboarding/kit';
import {
  useSellerCase,
  CaseLoading,
  CASE_ICONS,
  Row,
  RadioCard,
  dayLabel,
  soonLabel,
  thingOf,
  problemPhrase,
  goHome,
  toast,
  errText,
  cs,
} from './shared';

/** Case closed, on its own route (e.g. from a notification). Case D-115 shows the same once decided. */
export const CaseClosedScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const disputeId: string = route.params?.disputeId;
  const { c, setC, load, error } = useSellerCase(disputeId);
  const open = !!c?.in_review;
  // Still open (e.g. a second review): the case screen shows where it is.
  useEffect(() => {
    if (open) navigation.replace('SellerCase', { disputeId });
  }, [open, navigation, disputeId]);
  if (!c || open) {
    return (
      <CaseLoading
        title="Case closed"
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
        error={error}
        onRetry={load}
      />
    );
  }
  return <CaseClosedView c={c} setC={setC} navigation={navigation} />;
};

/** Decided in your favour, or Buyer refunded (with getting the item back). */
export const CaseClosedView: React.FC<{ c: Case; setC: (c: Case) => void; navigation: any }> = ({ c, setC, navigation }) => {
  if (c.outcome === 'not_upheld') return <DecidedForYou c={c} navigation={navigation} />;
  if (c.outcome === 'refund') return <BuyerRefunded c={c} setC={setC} navigation={navigation} />;
  return (
    <GlassScreen>
      <GlassHeader title="Case closed" onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined} />
      <ScrollView contentContainerStyle={[cs.content, styles.top]}>
        <Hero icon={CASE_ICONS.shield} tint={TINT.fill} title="This case is closed" sub="Our team closed it. Contact support if you have a question." />
        <GlassCard style={cs.rows}>
          <Row k="Case" v={`${c.case_number} · closed`} last />
        </GlassCard>
      </ScrollView>
      <FooterBar>
        <PrimaryButton label="Back to seller home" onPress={() => goHome(navigation)} />
      </FooterBar>
    </GlassScreen>
  );
};

/* ---------------- Decided in your favour ---------------- */

const DecidedForYou: React.FC<{ c: Case; navigation: any }> = ({ c, navigation }) => {
  const thing = thingOf(c);
  const side = c.seller;
  const p = side?.payout;
  const account = p?.account;
  const when = !p
    ? '—'
    : p.status === 'paid'
      ? `Paid ${dayLabel(p.paid_at)}`
      : p.status === 'sending'
        ? 'On its way to your bank'
        : p.blocked === 'PAYOUT_ACCOUNT_REQUIRED'
          ? 'Once you add your payout account'
          : p.blocked === 'TWO_STEP_REQUIRED'
            ? 'Once you turn on 2-step sign-in'
            : `Next payout run, ${soonLabel(p.next_run_at)}`;

  return (
    <GlassScreen>
      <GlassHeader title="Case closed" onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined} />
      <ScrollView contentContainerStyle={[cs.content, styles.top]}>
        <Hero
          icon={CASE_ICONS.shield}
          tint={TINT.green.bg}
          title="Decided in your favour"
          sub={`${side?.replied_at ? 'Your evidence showed' : 'Our hub found'} the ${thing} matched the listing when it was sold. The buyer keeps the item.`}
        />
        <GlassCard style={cs.rows}>
          <Row k="Case" v={`${c.case_number} · closed`} />
          <Row k={p?.status === 'paid' ? 'Payout' : 'Payout released'} v={formatCurrency(p?.amount ?? 0)} />
          {account ? (
            <Row k="Paid to" v={`Business ${account.bank_name} account ending ${account.account_last4}`} />
          ) : (
            <Row k="Paid to" v="Add your payout account" vColor={G.blue600} onPress={() => navigation.navigate('PayoutAccount')} />
          )}
          {p?.blocked === 'TWO_STEP_REQUIRED' && p.status !== 'paid' ? (
            <Row k="When" v={when} vColor={G.blue600} onPress={() => navigation.navigate('TwoStepSetup')} last />
          ) : (
            <Row k="When" v={when} last />
          )}
        </GlassCard>
        {c.findings ? (
          <GlassCard style={[cs.card, cs.gap]}>
            <Text style={cs.cardTitle}>Note from our team</Text>
            <Text style={cs.body}>{c.findings}</Text>
          </GlassCard>
        ) : null}
        <Text style={cs.centerCaption}>This case doesn't affect your seller rating.</Text>
      </ScrollView>
      <FooterBar>
        <PrimaryButton label="See payouts" onPress={() => navigation.navigate('MainTabs', { screen: 'Payouts' })} />
        <TextButton label="Back to seller home" onPress={() => goHome(navigation)} />
      </FooterBar>
    </GlassScreen>
  );
};

/* ---------------- Buyer refunded ---------------- */

const BuyerRefunded: React.FC<{ c: Case; setC: (c: Case) => void; navigation: any }> = ({ c, setC, navigation }) => {
  const thing = thingOf(c);
  const side = c.seller;
  const back = side?.item_return ?? null;
  const [editing, setEditing] = useState(!back?.method);
  const [method, setMethod] = useState<'collect' | 'deliver'>(back?.method ?? 'collect');
  const [busy, setBusy] = useState(false);
  const choosing = !!back?.can_choose && (editing || !back.method);

  const confirm = async () => {
    setBusy(true);
    try {
      setC(await sellerCaseService.chooseReturn(c.id, method));
      setEditing(false);
      toast(method === 'deliver' ? "Saved. Our rider will bring it to your shop." : "Saved. Collect it from the hub when it's back.", 'success');
    } catch (e) {
      toast(errText(e, "That didn't save. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const askReview = () =>
    Alert.alert(
      'Ask for a second review?',
      "A different person on our team looks at the case again. You can do this once, and the buyer's refund waits until we decide.",
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Ask for a review',
          onPress: async () => {
            setBusy(true);
            try {
              setC(await sellerCaseService.secondReview(c.id));
              toast("We'll take another look and tell you within 2 working days.", 'success');
            } catch (e) {
              toast(errText(e, "That didn't go through. Try again."));
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );

  const sub = side?.accepted_at
    ? `You accepted the return, so the buyer gets their money back and the ${thing} returns to you.`
    : `The ${thing} ${problemPhrase(c.problem.type)}, so the buyer gets their money back and the item returns to you.`;

  const fs = side?.failed_sales;
  const failedNote = !fs
    ? null
    : fs.count <= 1
      ? `This counts as 1 failed sale on your rating. ${fs.limit} in ${fs.window_days} days pauses new listings for review.`
      : fs.count < fs.limit
        ? `This counts as a failed sale on your rating. You have ${fs.count} in the last ${fs.window_days} days; ${fs.limit} pauses new listings for review.`
        : `This counts as a failed sale on your rating. With ${fs.count} in the last ${fs.window_days} days, new listings are paused for review.`;

  return (
    <GlassScreen>
      <GlassHeader title="Case closed" onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined} />
      <ScrollView contentContainerStyle={[cs.content, styles.top]}>
        <Hero icon={CASE_ICONS.box} tint={TINT.red.bg} title="Buyer refunded" sub={sub} />
        <GlassCard style={cs.rows}>
          <Row k="Case" v={`${c.case_number} · closed`} />
          <Row k="Buyer refund" v={formatCurrency(c.order.total_amount)} />
          <Row k="Your payout" v={formatCurrency(0)} />
          <Row k="Platform fee" v="Not charged" last />
        </GlassCard>

        {back ? (
          <>
            <Label style={cs.section}>{`Get your ${thing} back`}</Label>
            {choosing ? (
              <View style={styles.options} accessibilityRole="radiogroup">
                <RadioCard
                  on={method === 'collect'}
                  title="Collect from the hub"
                  sub={`Free · within ${back.free_days} days · show code ${back.code}`}
                  onPress={() => setMethod('collect')}
                />
                <RadioCard
                  on={method === 'deliver'}
                  title="Send it to my shop"
                  sub="Rider delivers it"
                  right={formatCurrency(back.delivery_fee)}
                  onPress={() => setMethod('deliver')}
                />
              </View>
            ) : (
              <ChosenReturn c={c} onChange={back.can_choose ? () => setEditing(true) : undefined} />
            )}
          </>
        ) : null}

        {failedNote ? (
          <Note tone="amber" style={cs.gap}>
            {failedNote}
          </Note>
        ) : null}

        {side?.can_ask_second_review ? (
          <Pressable onPress={askReview} disabled={busy} style={cs.linkWrap} accessibilityRole="button" hitSlop={6}>
            <Text style={cs.link}>Disagree? Ask for a second review</Text>
          </Pressable>
        ) : null}
        {c.findings && !side?.accepted_at ? (
          <GlassCard style={[cs.card, cs.gap]}>
            <Text style={cs.cardTitle}>Note from our team</Text>
            <Text style={cs.body}>{c.findings}</Text>
          </GlassCard>
        ) : null}
      </ScrollView>
      <FooterBar>
        {choosing ? (
          <PrimaryButton label={busy ? 'Saving…' : 'Confirm'} onPress={confirm} disabled={busy} />
        ) : (
          <PrimaryButton label="Back to seller home" onPress={() => goHome(navigation)} />
        )}
      </FooterBar>
    </GlassScreen>
  );
};

/** What the seller chose, and when the item will be ready. */
const ChosenReturn: React.FC<{ c: Case; onChange?: () => void }> = ({ c, onChange }) => {
  const b = c.seller!.item_return!;
  const deliver = b.method === 'deliver';
  const atHub = !!b.at_hub_since;
  const status = b.returned_at
    ? `Back with you since ${dayLabel(b.returned_at)}.`
    : !b.buyer_return_status
      ? "The buyer is sending it back to the hub. We'll tell you when it arrives."
      : b.buyer_return_status === 'started'
        ? `On its way back to the hub${b.buyer_return_due_at ? `, due by ${dayLabel(b.buyer_return_due_at)}` : ''}. We'll tell you when it arrives.`
        : deliver
          ? "It's at the hub. Our rider will call before bringing it to your shop."
          : `It's at the hub. Collect it by ${dayLabel(b.free_until)} for free; after that it's ${formatCurrency(b.storage_fee_per_day)} a day.`;

  return (
    <GlassCard style={[cs.card, styles.chosen]}>
      <View style={styles.chosenHead}>
        <View style={cs.flex}>
          <Text style={cs.cardTitle}>{deliver ? 'Send it to my shop' : 'Collect from the hub'}</Text>
          <Text style={styles.chosenSub}>
            {deliver
              ? `Rider delivers it · ${formatCurrency(b.delivery_fee)} off your next payout`
              : `Free · show code ${b.code}`}
          </Text>
        </View>
        {onChange ? (
          <Pressable onPress={onChange} hitSlop={8} style={styles.change} accessibilityRole="button" accessibilityLabel="Change how you get it back">
            <Text style={cs.link}>Change</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.status, atHub && !b.returned_at && styles.statusReady]}>
        <Text style={[styles.statusText, atHub && !b.returned_at && styles.statusTextReady]}>{status}</Text>
      </View>
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  top: { paddingTop: 12 },
  options: { gap: 10 },
  chosen: { gap: 12 },
  chosenHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  chosenSub: { color: G.muted, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, marginTop: 2 },
  change: { minHeight: 44, justifyContent: 'center', marginTop: -12 },
  status: { borderRadius: 12, backgroundColor: TINT.fill, paddingHorizontal: 12, paddingVertical: 10 },
  statusReady: { backgroundColor: TINT.green.bg },
  statusText: { color: G.slate, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular },
  statusTextReady: { color: G.green },
});
