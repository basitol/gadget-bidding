import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Alert,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  PrimaryButton,
  TextButton,
  FooterBar,
  useNow,
  GlassKeyboardView,
} from '../../../components/glass';
import { fonts } from '../../../constants';
import { Case, caseService, sellerCaseService } from '../../../services/case.service';
import { formatCurrency } from '../../../utils';
import { Label, Ticks, Timeline, TimelineStep, TINT, whenLabel } from '../onboarding/kit';
import {
  useSellerCase,
  CaseLoading,
  ItemCard,
  BuyerSaysCard,
  HubFoundCard,
  PayoutHeldNote,
  StatusChip,
  EvidenceTile,
  openFile,
  countdown,
  dayLabel,
  sinceLabel,
  thingOf,
  toast,
  errText,
  cs,
} from './shared';
import { CaseClosedView } from './CaseClosedScreen';

/**
 * Case D-115 on one of the seller's sales. Waiting for their reply: the deadline, what the buyer
 * says, what our hub found, and the two options. After they reply: their reply and where the case
 * is. Decided: the Case closed screen.
 */
export const SellerCaseScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const disputeId: string = route.params?.disputeId;
  const { c, setC, load, error } = useSellerCase(disputeId);
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));

  if (!c) return <CaseLoading title="Case" onBack={back} error={error} onRetry={load} />;
  if (!c.seller) return <CaseLoading title="Case" onBack={back} error="This case isn't on one of your sales." />;
  if (!c.in_review) return <CaseClosedView c={c} setC={setC} navigation={navigation} />;
  if (c.seller?.can_reply)
    return <AwaitingReply c={c} setC={setC} reload={load} navigation={navigation} onBack={back} />;
  return <UnderReview c={c} setC={setC} reload={load} onBack={back} />;
};

/* ---------------- Waiting for the seller's reply ---------------- */

const AwaitingReply: React.FC<{
  c: Case;
  setC: (c: Case) => void;
  reload: () => Promise<void>;
  navigation: any;
  onBack: () => void;
}> = ({ c, setC, reload, navigation, onBack }) => {
  const [refreshing, setRefreshing] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const thing = thingOf(c);

  const accept = () =>
    Alert.alert(
      'Accept the return and refund?',
      `The buyer sends the ${thing} back to the hub and gets ${formatCurrency(c.order.total_amount)} back. You won't be paid for this sale, and it counts as 1 failed sale on your rating. The ${thing} comes back to you.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept and refund',
          style: 'destructive',
          onPress: async () => {
            setAccepting(true);
            try {
              setC(await sellerCaseService.acceptRefund(c.id));
            } catch (e) {
              toast(errText(e, "That didn't go through. Try again."));
            } finally {
              setAccepting(false);
            }
          },
        },
      ]
    );

  return (
    <GlassScreen>
      <GlassHeader title={`Case ${c.case_number}`} onBack={onBack} />
      <ScrollView
        contentContainerStyle={cs.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={G.blue}
            onRefresh={async () => {
              setRefreshing(true);
              await reload();
              setRefreshing(false);
            }}
          />
        }
      >
        <Deadline respondBy={c.seller!.respond_by} />

        <ItemCard c={c} style={cs.gap} />
        <BuyerSaysCard c={c} style={cs.gap} />
        <HubFoundCard c={c} style={cs.gap} />
        <PayoutHeldNote c={c} style={cs.gap} />

        <Label style={cs.section}>Your options</Label>
        <Ticks
          items={[
            'Reply with photos or a note — our team will review both sides',
            `Or accept a return: the buyer is refunded and the ${thing} comes back to you`,
          ]}
        />
      </ScrollView>
      <FooterBar>
        <PrimaryButton
          label="Reply with evidence"
          onPress={() => navigation.navigate('CaseReply', { disputeId: c.id })}
        />
        {c.seller?.can_accept ? (
          accepting ? (
            <ActivityIndicator color={G.slate} style={styles.busy} />
          ) : (
            <TextButton label="Accept the return and refund" onPress={accept} />
          )
        ) : null}
      </FooterBar>
    </GlassScreen>
  );
};

/** The red banner with the time left to reply (ticks on its own, so the screen doesn't re-render). */
const Deadline: React.FC<{ respondBy: string }> = ({ respondBy }) => {
  const now = useNow(1000);
  const left = new Date(respondBy).getTime() - now;
  if (left <= 0) {
    return (
      <View style={styles.deadline}>
        <Text style={styles.deadlineText}>The 48 hours are up. Reply now: our team hasn't decided yet.</Text>
      </View>
    );
  }
  return (
    <View
      style={styles.deadline}
      accessible
      accessibilityLabel={`Reply before the deadline, or we'll decide with what we have. ${countdown(left)} left.`}
    >
      <Text style={styles.deadlineText}>Reply before the deadline, or we'll decide with what we have</Text>
      <Text style={styles.deadlineTime}>{countdown(left)}</Text>
    </View>
  );
};

/* ---------------- Replied (or second review): our team is on it ---------------- */

const UnderReview: React.FC<{
  c: Case;
  setC: (c: Case) => void;
  reload: () => Promise<void>;
  onBack: () => void;
}> = ({ c, setC, reload, onBack }) => {
  const [refreshing, setRefreshing] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const side = c.seller!;
  const secondReview = !!side.second_review_requested_at;
  const files = side.files ?? [];
  const thread = c.messages.filter(m => m.id !== side.reply_message_id);

  const steps: TimelineStep[] = [
    {
      title: 'Buyer reported a problem',
      sub: dayLabel(c.created_at),
      state: 'done',
    },
    side.replied_at
      ? {
          title: 'You replied',
          sub: `${sinceLabel(side.replied_at)}${files.length ? ` · ${files.length} file${files.length === 1 ? '' : 's'}` : ''}`,
          state: 'done',
        }
      : { title: 'Your reply', sub: 'Not sent', state: 'todo' },
    ...(secondReview
      ? [
          {
            title: 'You asked for a second review',
            sub: whenLabel(side.second_review_requested_at),
            state: 'done' as const,
          },
        ]
      : []),
    {
      title: secondReview ? 'Second review' : 'Team review',
      sub: c.next_step || 'Usually within 2 working days',
      state: 'current',
    },
    { title: 'Decision', sub: "We'll notify you", state: 'todo' },
  ];

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

  return (
    <GlassScreen>
      <GlassHeader title={`Case ${c.case_number}`} onBack={onBack} />
      <GlassKeyboardView>
        <ScrollView
          contentContainerStyle={cs.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={G.blue}
              onRefresh={async () => {
                setRefreshing(true);
                await reload();
                setRefreshing(false);
              }}
            />
          }
        >
          <ItemCard c={c} />
          <View style={cs.gap}>
            <Timeline steps={steps} />
          </View>

          {side.replied_at ? (
            <GlassCard style={[cs.card, cs.gap]}>
              <View style={styles.cardHead}>
                <Text style={cs.cardTitle}>Your reply</Text>
                {side.position_label ? <StatusChip label={side.position_label} tone="blue" /> : null}
              </View>
              {side.reply ? <Text style={cs.body}>{side.reply}</Text> : null}
              {files.length ? (
                <View style={styles.tiles}>
                  {files.map((f, i) => (
                    <EvidenceTile
                      key={f.url}
                      icon={
                        f.kind === 'pdf'
                          ? 'document-text-outline'
                          : f.kind === 'video'
                            ? 'videocam-outline'
                            : 'image-outline'
                      }
                      label={f.kind === 'pdf' ? f.name : f.kind === 'video' ? 'Video' : `Photo ${i + 1}`}
                      onPress={() => openFile(f.url)}
                    />
                  ))}
                </View>
              ) : null}
            </GlassCard>
          ) : null}

          <BuyerSaysCard c={c} style={cs.gap} />
          <HubFoundCard c={c} style={cs.gap} />
          <PayoutHeldNote c={c} style={cs.gap} />

          {thread.length ? (
            <>
              <Label style={cs.section}>Messages</Label>
              <View style={styles.thread}>
                {thread.map(m => (
                  <View key={m.id} style={[styles.msgWrap, m.mine && styles.msgWrapMine]}>
                    <Text style={[styles.msgMeta, m.mine && styles.msgMetaMine]}>
                      {m.author} · {whenLabel(m.at)}
                    </Text>
                    <View
                      style={[
                        styles.bubble,
                        m.mine ? styles.bubbleMine : m.role === 'team' ? styles.bubbleTeam : styles.bubbleOther,
                      ]}
                    >
                      <Text style={[styles.bubbleText, m.mine && styles.bubbleTextMine]}>{m.body}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <View style={styles.compose}>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder="Answer our team"
                  placeholderTextColor={G.faint}
                  style={styles.composeInput}
                  multiline
                  maxLength={2000}
                  accessibilityLabel="Message for our team"
                />
                <Pressable
                  onPress={send}
                  disabled={!text.trim() || sending}
                  style={({ pressed }) => [
                    styles.send,
                    (!text.trim() || sending) && styles.sendOff,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                >
                  {sending ? (
                    <ActivityIndicator color={G.faint} size="small" />
                  ) : (
                    <Ionicons name="paper-plane" size={16} color={text.trim() ? '#FFFFFF' : G.faint} />
                  )}
                </Pressable>
              </View>
              <Text style={[cs.caption, styles.composeHint]}>Our team and the buyer see what you write here.</Text>
            </>
          ) : null}
        </ScrollView>
      </GlassKeyboardView>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  busy: { minHeight: 44, marginTop: 6 },
  deadline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: TINT.red.bg,
  },
  deadlineText: {
    flex: 1,
    color: TINT.red.text,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.regular,
  },
  deadlineTime: {
    color: TINT.red.text,
    fontSize: 19,
    fontFamily: fonts.medium,
    fontVariant: ['tabular-nums'],
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  thread: { gap: 12 },
  msgWrap: { alignItems: 'flex-start', maxWidth: '88%' },
  msgWrapMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  msgMeta: {
    color: G.muted,
    fontSize: 12,
    fontFamily: fonts.regular,
    marginBottom: 4,
  },
  msgMetaMine: { textAlign: 'right' },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  bubbleMine: { backgroundColor: G.blue, borderBottomRightRadius: 6 },
  bubbleOther: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 6 },
  bubbleTeam: { backgroundColor: TINT.blue.bg, borderBottomLeftRadius: 6 },
  bubbleText: {
    color: G.ink,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.regular,
  },
  bubbleTextMine: { color: '#FFFFFF' },
  compose: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
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
  composeHint: { marginTop: 8 },
  send: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: G.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendOff: { backgroundColor: TINT.fill },
});
