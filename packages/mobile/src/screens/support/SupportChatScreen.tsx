import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks';
import { fonts, spacing, borderRadius } from '../../constants';
import { LoadingScreen } from '../../components';
import {
  supportService,
  SupportMessage,
  SupportThread,
} from '../../services/support.service';
import { socketService } from '../../services';
import { useAuthStore } from '../../store/authStore';
import { formatRelativeTime } from '../../utils';
import { getErrorMessage } from '../../services/api';

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

function mergeById(
  current: SupportMessage[],
  incoming: SupportMessage[]
): SupportMessage[] {
  const map = new Map<string, SupportMessage>();
  [...current, ...incoming].forEach(m => {
    if (m?.id) map.set(m.id, m);
  });
  return Array.from(map.values()).sort((a, b) =>
    String(a.created_at).localeCompare(String(b.created_at))
  );
}

export const SupportChatScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useTheme();
  const user = useAuthStore(s => s.user);
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<FlatList>(null);
  const threadIdRef = useRef<string | null>(null);

  const refreshMessages = useCallback(async (threadId: string) => {
    try {
      const msgRes = await supportService.getMessages(threadId, 1, 100);
      const next = msgRes.data || [];
      setMessages(prev => mergeById(prev, next));
    } catch {
      // keep existing messages on poll failure
    }
  }, []);

  const load = useCallback(async () => {
    setError('');
    try {
      await socketService.connect();
      const threadRes = await supportService.getMyThread();
      const t = threadRes.data;
      threadIdRef.current = t.id;
      setThread(t);
      socketService.joinSupportThread(t.id);
      const msgRes = await supportService.getMessages(t.id, 1, 100);
      setMessages(msgRes.data || []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      if (threadIdRef.current) {
        socketService.leaveSupportThread(threadIdRef.current);
      }
    };
  }, [load]);

  // Live socket updates
  useEffect(() => {
    const handler = (payload: {
      thread_id: string;
      message: SupportMessage;
    }) => {
      if (!payload?.message?.id) return;
      if (
        threadIdRef.current &&
        payload.thread_id &&
        payload.thread_id !== threadIdRef.current
      ) {
        return;
      }
      setMessages(prev => mergeById(prev, [payload.message]));
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    };

    const unsubscribe = socketService.on('support:message', handler);
    return unsubscribe;
  }, []);

  // Polling fallback only; socket handles real-time updates.
  useEffect(() => {
    if (!thread?.id) return;

    const tick = () => {
      if (AppState.currentState === 'active') {
        refreshMessages(thread.id);
      }
    };

    const id = setInterval(tick, 15000);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') tick();
    });

    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [thread?.id, refreshMessages]);

  const send = async () => {
    if (!thread || !text.trim() || sending) return;
    setSending(true);
    setError('');
    const body = text.trim();
    setText('');
    try {
      const res = await supportService.sendMessage(thread.id, body);
      const message = res.data;
      if (message?.id) {
        setMessages(prev => mergeById(prev, [message]));
      } else {
        await refreshMessages(thread.id);
      }
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (err) {
      setText(body);
      setError(getErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  if (loading) return <LoadingScreen />;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.text }]}>
            Chat with GadgetBid
          </Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            Support team · live chat
          </Text>
        </View>
      </View>

      {error ? (
        <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: false })
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons
                name="chatbubbles-outline"
                size={40}
                color={colors.primary}
              />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                How can we help?
              </Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                Ask about listings, auctions, payouts, or order issues. An admin
                will reply here.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.sender_id === user?.id;
            return (
              <View
                style={[
                  styles.bubbleRow,
                  mine ? styles.bubbleRowMine : styles.bubbleRowTheirs,
                ]}
              >
                <View
                  style={[
                    styles.bubble,
                    mine
                      ? { backgroundColor: colors.primary }
                      : {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                          borderWidth: 1,
                        },
                  ]}
                >
                  {!mine ? (
                    <Text style={[styles.sender, { color: colors.primary }]}>
                      {item.sender?.full_name || 'Support'}
                    </Text>
                  ) : null}
                  <Text
                    style={[
                      styles.body,
                      { color: mine ? '#FFFFFF' : colors.text },
                    ]}
                  >
                    {item.body}
                  </Text>
                  <Text
                    style={[
                      styles.time,
                      {
                        color: mine
                          ? 'rgba(255,255,255,0.7)'
                          : colors.textMuted,
                      },
                    ]}
                  >
                    {formatRelativeTime(item.created_at)}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        <View
          style={[
            styles.composer,
            {
              borderTopColor: colors.border,
              backgroundColor: colors.backgroundLight || colors.background,
            },
          ]}
        >
          <TextInput
            style={[
              styles.input,
              {
                color: colors.text,
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
            placeholder="Type a message…"
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[
              styles.send,
              {
                backgroundColor: colors.primary,
                opacity: !text.trim() || sending ? 0.5 : 1,
              },
            ]}
            onPress={send}
            disabled={!text.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="send" size={18} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: { flex: 1 },
  title: { fontFamily: fonts.semiBold, fontSize: 17 },
  sub: { fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  error: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  empty: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 18,
    marginTop: spacing.md,
  },
  emptySub: {
    fontFamily: fonts.regular,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  bubbleRow: { marginBottom: spacing.md, maxWidth: '85%' },
  bubbleRowMine: { alignSelf: 'flex-end' },
  bubbleRowTheirs: { alignSelf: 'flex-start' },
  bubble: {
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sender: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    marginBottom: 4,
  },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  time: {
    fontFamily: fonts.regular,
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : 8,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
