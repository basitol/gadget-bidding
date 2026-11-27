import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { G, GlassScreen, GlassHeader, GlassCard, PrimaryButton } from '../../components/glass';
import { fonts } from '../../constants';
import { socketService } from '../../services';
import { supportService, SupportMessage, SupportOrder, SupportThread } from '../../services/support.service';
import { getErrorMessage } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';

/**
 * Buyer chat with the Gadgets Bidding team. Opened from Profile › Help centre, or from an
 * order's "Get help" (route params orderId + orderNumber), which shows the order on top and
 * starts the message with "About order GB-…".
 */

const SUPPORT_TEAL = { bg: '#E6F7F7', fg: '#0E8B8A' };

const toast = (m: string) => useToastStore.getState().show(m, 'error');

const mergeById = (current: SupportMessage[], incoming: SupportMessage[]) => {
  const map = new Map<string, SupportMessage>();
  [...current, ...incoming].forEach(m => m?.id && map.set(m.id, m));
  return Array.from(map.values()).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
};

/* Dates (design guide › Voice & formats): "Today", "Yesterday", "Nov 24", "6:00 pm". */
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
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();

type Row = { kind: 'day'; key: string; label: string } | { kind: 'msg'; key: string; m: SupportMessage };

/** Messages with a day heading wherever the date changes. */
const withDays = (messages: SupportMessage[]): Row[] => {
  const rows: Row[] = [];
  let last = '';
  for (const m of messages) {
    const day = new Date(m.created_at).toDateString();
    if (day !== last) {
      rows.push({ kind: 'day', key: `day-${day}`, label: dayLabel(m.created_at) });
      last = day;
    }
    rows.push({ kind: 'msg', key: m.id, m });
  }
  return rows;
};

const useKeyboardOpen = () => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
};

export const SupportScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const orderId: string | undefined = route?.params?.orderId;
  const orderNumber: string | undefined = route?.params?.orderNumber;
  const userId = useAuthStore(s => s.user?.id);
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardOpen();

  const [thread, setThread] = useState<SupportThread | null>(null);
  const [order, setOrder] = useState<SupportOrder | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  // Pre-filled from an order ("About order …") or the error screen ("App error GB-…").
  const draft: string | undefined = route?.params?.draft;
  const [text, setText] = useState(orderNumber ? `About order ${orderNumber}: ` : draft ?? '');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const [focused, setFocused] = useState(false);
  const listRef = useRef<FlatList<Row>>(null);
  const threadIdRef = useRef<string | null>(null);

  const scrollToEnd = (animated = true) => setTimeout(() => listRef.current?.scrollToEnd({ animated }), 50);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      // Live replies are a bonus; polling below covers a socket that won't connect.
      await socketService.connect().catch(() => {});
      const t = (await supportService.getMyThread(orderId)).data;
      threadIdRef.current = t.id;
      setThread(t);
      if (orderId && t.order) {
        setOrder(t.order);
        // The order page passes its number; fall back to the server's if it didn't.
        setText(cur => cur || `About order ${t.order!.order_number}: `);
      }
      socketService.joinSupportThread(t.id);
      const res = await supportService.getMessages(t.id, 1, 100);
      setMessages(res.data || []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
    return () => {
      if (threadIdRef.current) socketService.leaveSupportThread(threadIdRef.current);
    };
  }, [load]);

  // Replies arrive over the socket while the chat is open.
  useEffect(
    () =>
      socketService.on('support:message', (payload: { thread_id: string; message: SupportMessage }) => {
        if (!payload?.message?.id || payload.thread_id !== threadIdRef.current) return;
        setMessages(prev => mergeById(prev, [payload.message]));
        scrollToEnd();
      }),
    []
  );

  // Fallback if the socket drops: check every 15s while the app is in front.
  useEffect(() => {
    if (!thread?.id) return;
    const refresh = () => {
      if (AppState.currentState !== 'active') return;
      supportService
        .getMessages(thread.id, 1, 100)
        .then(res => setMessages(prev => mergeById(prev, res.data || [])))
        .catch(() => {});
    };
    const timer = setInterval(refresh, 15000);
    const sub = AppState.addEventListener('change', s => s === 'active' && refresh());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [thread?.id]);

  const body = text.trim();
  const canSend = !!thread && !!body && !sending;

  const send = async () => {
    if (!canSend || !thread) return;
    setSending(true);
    setText('');
    try {
      const res = await supportService.sendMessage(thread.id, body, order?.id);
      if (res.data?.id) setMessages(prev => mergeById(prev, [res.data]));
      scrollToEnd();
    } catch (e) {
      setText(body);
      toast(getErrorMessage(e) || "That didn't send. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  const rows = useMemo(() => withDays(messages), [messages]);

  return (
    <GlassScreen>
      <GlassHeader title="Chat with support" onBack={() => navigation.goBack()} />

      {loading ? (
        <ActivityIndicator color={G.blue} style={styles.loader} />
      ) : failed ? (
        <View style={styles.center}>
          <Text style={styles.centerTitle}>We couldn't open the chat</Text>
          <Text style={styles.centerSub}>Check your connection, then try again.</Text>
          <PrimaryButton label="Try again" onPress={load} style={styles.retry} />
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {order ? (
            <GlassCard style={styles.order}>
              <View style={styles.orderTile}>
                <Ionicons name="cube-outline" size={18} color={G.slate} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.orderTitle}>About order {order.order_number}</Text>
                {order.title ? (
                  <Text style={styles.orderSub} numberOfLines={1}>
                    {order.title}
                  </Text>
                ) : null}
              </View>
            </GlassCard>
          ) : null}

          <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={r => r.key}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListHeaderComponent={
              rows.length ? <Text style={styles.intro}>Our team replies here, usually within a day.</Text> : null
            }
            ListEmptyComponent={<EmptyChat />}
            renderItem={({ item }) =>
              item.kind === 'day' ? (
                <Text style={styles.day} accessibilityRole="header">
                  {item.label}
                </Text>
              ) : (
                <Bubble m={item.m} mine={item.m.sender_id === userId} />
              )
            }
          />

          <View style={[styles.composer, { paddingBottom: keyboardOpen ? 12 : Math.max(insets.bottom, 12) }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Write a message"
              placeholderTextColor={G.faint}
              multiline
              maxLength={2000}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={[styles.input, focused && styles.inputFocused]}
              accessibilityLabel="Message to support"
            />
            <Pressable
              onPress={send}
              disabled={!canSend}
              style={({ pressed }) => [styles.send, !canSend && styles.sendDisabled, pressed && canSend && styles.sendPressed]}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              accessibilityState={{ disabled: !canSend, busy: sending }}
            >
              {sending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Ionicons name="arrow-up" size={20} color={canSend ? '#FFFFFF' : G.faint} />
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </GlassScreen>
  );
};

const EmptyChat: React.FC = () => (
  <View style={styles.empty}>
    <View style={styles.emptyTile}>
      <Ionicons name="chatbubbles-outline" size={26} color={SUPPORT_TEAL.fg} />
    </View>
    <Text style={styles.centerTitle}>How can we help?</Text>
    <Text style={styles.centerSub}>
      Ask about bidding, paying, delivery or a problem with an order. Someone from our team replies here, usually
      within a day.
    </Text>
  </View>
);

const Bubble: React.FC<{ m: SupportMessage; mine: boolean }> = ({ m, mine }) => (
  <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
    {!mine ? <Text style={styles.sender}>Gadgets Bidding support</Text> : null}
    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
      <Text style={styles.body} selectable>
        {m.body}
      </Text>
    </View>
    <Text style={[styles.time, mine && styles.timeMine]}>{timeLabel(m.created_at)}</Text>
  </View>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loader: { marginTop: 60 },

  center: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  centerTitle: { color: G.ink, fontSize: 17, fontFamily: fonts.medium, marginTop: 16, textAlign: 'center' },
  centerSub: { color: G.slate, fontSize: 13, lineHeight: 20, fontFamily: fonts.regular, textAlign: 'center', marginTop: 4 },
  retry: { marginTop: 20, alignSelf: 'stretch' },

  order: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginHorizontal: 20, marginBottom: 4 },
  orderTile: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F1F3F9', alignItems: 'center', justifyContent: 'center' },
  orderTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  orderSub: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },

  list: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  intro: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center', marginBottom: 4 },
  day: { color: G.muted, fontSize: 13, fontFamily: fonts.medium, textAlign: 'center', marginTop: 16, marginBottom: 8 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingBottom: 48 },
  emptyTile: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: SUPPORT_TEAL.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  bubbleRow: { maxWidth: '84%', marginBottom: 12 },
  rowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  sender: { color: SUPPORT_TEAL.fg, fontSize: 13, fontFamily: fonts.medium, marginBottom: 4, marginLeft: 4 },
  bubble: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18 },
  bubbleMine: { backgroundColor: G.tile, borderBottomRightRadius: 8 },
  bubbleTheirs: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: G.cardBorder,
    borderBottomLeftRadius: 8,
  },
  body: { color: G.ink, fontSize: 16, lineHeight: 24, fontFamily: fonts.regular },
  time: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 4, marginLeft: 4, fontVariant: ['tabular-nums'] },
  timeMine: { marginLeft: 0, marginRight: 4 },

  // Frosted bar above the home indicator (design guide › Layout).
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.9)',
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 128,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EDEFF4',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: fonts.regular,
    color: G.ink,
  },
  inputFocused: { borderColor: G.blue },
  send: { width: 48, height: 48, borderRadius: 14, backgroundColor: G.blue, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { backgroundColor: '#F5F6F9' },
  sendPressed: { backgroundColor: G.blue600 },
});
