import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { G, GlassScreen, GlassCard, GadgetImage, useNow } from '../../../components/glass';
import { fonts } from '../../../constants';
import { api, auctionService } from '../../../services';
import { useReloadOnReconnect } from '../../../store/networkStore';
import { useToastStore } from '../../../store/toastStore';
import { formatCurrency } from '../../../utils';
import { sellerTabsService, SellerHome, SellerTodo, byWhen, hoursLeft, timeLeftLong } from '../../../services/sellerTabs.service';
import { initialsOf } from '../../buyer/categories';
import { TINT } from '../onboarding/kit';

type PayoutSummary = {
  ready: number;
  in_escrow: number;
  next_payout_at: string | null;
  blocked: null | { code: 'PAYOUT_ACCOUNT_REQUIRED' | 'TWO_STEP_REQUIRED'; message: string };
};

const ICON = {
  dropoff: require('../../../../assets/icons/box.png'),
  changes: require('../../../../assets/icons/camera.png'),
  case: require('../../../../assets/icons/shield.png'),
};

/** "Today, 6 pm" / "Tomorrow, 6 pm" / "Mon, 6 pm" */
const payoutWhen = (iso: string | null) => {
  if (!iso) return 'Nothing waiting';
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined }).toLowerCase();
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === new Date(now.getTime() + 86_400_000).toDateString()) return `Tomorrow, ${time}`;
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })}, ${time}`;
};

const isSoon = (iso: string | null, now: number) => !!iso && new Date(iso).getTime() - now < 24 * 3_600_000;

/** Seller home: what's waiting for payout, what needs doing, what's live, and how the store is doing. */
export const SellerHomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const now = useNow(1000);
  const [home, setHome] = useState<SellerHome | null>(null);
  const [payouts, setPayouts] = useState<PayoutSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setHome(await sellerTabsService.home());
    } catch (e) {
      if (!home) useToastStore.getState().show(e instanceof Error ? e.message : "Couldn't load your home");
    }
    api
      .get('/seller/payouts')
      .then(r => setPayouts(r.data?.data ?? null))
      .catch(() => setPayouts(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useReloadOnReconnect(load);

  const openTodo = async (t: SellerTodo) => {
    if (t.kind === 'case') return navigation.navigate('SellerCase', { disputeId: t.id });
    if (t.kind === 'dropoff') return t.order_id ? navigation.navigate('SellerOrder', { orderId: t.order_id }) : navigation.navigate('Orders');
    try {
      const res = await auctionService.getGadget(t.id);
      navigation.navigate('CreateGadget', { gadget: res.data });
    } catch (e) {
      useToastStore.getState().show(e instanceof Error ? e.message : "Couldn't open that listing");
    }
  };

  const todoSub = (t: SellerTodo) => {
    if (t.kind === 'dropoff' && t.due_at) return { text: `Drop off ${byWhen(t.due_at, now)}`, urgent: isSoon(t.due_at, now) };
    if (t.kind === 'case' && t.due_at) return { text: `${t.item} · ${hoursLeft(t.due_at, now)} to respond`, urgent: true };
    return { text: [t.item, t.note].filter(Boolean).join(' — '), urgent: false };
  };

  const name = home?.business_name ?? '';

  return (
    <GlassScreen>
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
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initialsOf(name)}</Text>
          </View>
          <View style={styles.flex}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              {home?.verified ? (
                <Ionicons name="checkmark-circle" size={16} color={G.blue} accessibilityLabel="Verified business" />
              ) : null}
            </View>
            {home?.shop_line ? (
              <Text style={styles.shop} numberOfLines={2}>
                {home.shop_line}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={() => navigation.navigate('Notifications')}
            style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={home?.unread_notifications ? `Notifications, ${home.unread_notifications} unread` : 'Notifications'}
          >
            <Ionicons name="notifications-outline" size={20} color={G.ink} />
            {home?.unread_notifications ? <View style={styles.dot} /> : null}
          </Pressable>
        </View>

        <LinearGradient colors={['#5B84FF', '#4F7BFF', '#6F8DFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.payout}>
          <View style={styles.payoutTop}>
            <Text style={styles.payoutLabel}>Ready for payout</Text>
            <Pressable onPress={() => navigation.navigate('Payouts')} hitSlop={8} accessibilityRole="link">
              <Text style={styles.payoutLink}>Payouts ›</Text>
            </Pressable>
          </View>
          <Text style={styles.payoutAmount}>{payouts ? formatCurrency(payouts.ready) : '–'}</Text>
          <View style={styles.payoutTiles}>
            <View style={styles.payoutTile}>
              <Text style={styles.tileLabel}>In escrow</Text>
              <Text style={styles.tileValue}>{payouts ? formatCurrency(payouts.in_escrow) : '–'}</Text>
            </View>
            <View style={styles.payoutTile}>
              <Text style={styles.tileLabel}>Next payout</Text>
              <Text style={styles.tileValue} numberOfLines={1}>
                {!payouts
                  ? '–'
                  : payouts.blocked && payouts.ready > 0
                    ? payouts.blocked.code === 'TWO_STEP_REQUIRED'
                      ? 'Turn on 2-step'
                      : 'Add payout account'
                    : payoutWhen(payouts.next_payout_at)}
              </Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.sectionRow}>
          <Text style={styles.section}>Needs your attention</Text>
          {home?.todo_count ? (
            <View style={styles.todoChip}>
              <Text style={styles.todoChipText}>{home.todo_count} to do</Text>
            </View>
          ) : null}
        </View>
        {home && !home.todo.length ? (
          <GlassCard style={styles.empty}>
            <Text style={styles.emptyText}>You're all caught up.</Text>
          </GlassCard>
        ) : null}
        {home?.todo.map(t => {
          const sub = todoSub(t);
          return (
            <Pressable
              key={`${t.kind}-${t.id}`}
              onPress={() => openTodo(t)}
              style={({ pressed }) => [styles.todoWrap, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`${t.title}. ${sub.text}`}
            >
              <GlassCard style={styles.todo}>
                <Image source={ICON[t.kind]} style={styles.todoIcon} />
                <View style={styles.flex}>
                  <Text style={styles.todoTitle} numberOfLines={1}>
                    {t.title}
                  </Text>
                  <Text style={[styles.todoSub, sub.urgent && styles.urgent]} numberOfLines={1}>
                    {sub.text}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={G.faint} />
              </GlassCard>
            </Pressable>
          );
        })}

        <View style={[styles.sectionRow, styles.sectionGap]}>
          <Text style={styles.section}>Live now</Text>
          <Pressable onPress={() => navigation.navigate('Listings')} hitSlop={8} accessibilityRole="link">
            <Text style={styles.link}>All listings</Text>
          </Pressable>
        </View>
        <GlassCard style={styles.list}>
          {home && !home.live.length ? (
            <View style={styles.liveEmpty}>
              <Text style={styles.emptyText}>Nothing live right now.</Text>
              <Pressable onPress={() => navigation.navigate('CreateGadget')} hitSlop={8} accessibilityRole="link">
                <Text style={styles.link}>List a gadget</Text>
              </Pressable>
            </View>
          ) : null}
          {home?.live.map((a, i) => (
            <Pressable
              key={a.id}
              onPress={() => navigation.navigate('AuctionDetail', { auctionId: a.id })}
              style={({ pressed }) => [styles.liveRow, i < home.live.length - 1 && styles.rowLine, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <GadgetImage uri={a.image} size={40} style={styles.thumb} />
              <View style={styles.flex}>
                <Text style={styles.liveTitle} numberOfLines={1}>
                  {a.title}
                </Text>
                <Text style={styles.liveSub}>
                  {a.bids} bid{a.bids === 1 ? '' : 's'} · ends in {timeLeftLong(a.end_time, now)}
                </Text>
              </View>
              <Text style={styles.livePrice}>{formatCurrency(a.price)}</Text>
            </Pressable>
          ))}
        </GlassCard>

        <View style={styles.stats}>
          {[
            { value: home ? String(home.stats.sold_30d) : '–', label: 'Sold · 30 days' },
            { value: home?.stats.rating != null ? home.stats.rating.toFixed(1) : '–', label: 'Rating' },
            { value: home?.stats.on_time_dropoff != null ? `${home.stats.on_time_dropoff}%` : '–', label: 'On-time drop-off' },
          ].map(s => (
            <GlassCard key={s.label} style={styles.stat}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </GlassCard>
          ))}
        </View>
      </ScrollView>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(28,31,42,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: G.blue, fontSize: 15, fontFamily: fonts.medium },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: G.ink, fontSize: 18, fontFamily: fonts.medium, letterSpacing: -0.2, flexShrink: 1 },
  shop: { color: G.muted, fontSize: 12, lineHeight: 16, fontFamily: fonts.regular, marginTop: 2 },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { position: 'absolute', top: 10, right: 11, width: 8, height: 8, borderRadius: 4, backgroundColor: G.orange, borderWidth: 1.5, borderColor: '#FFFFFF' },

  payout: { borderRadius: 20, padding: 18, marginBottom: 22 },
  payoutTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payoutLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontFamily: fonts.regular },
  payoutLink: { color: '#FFFFFF', fontSize: 13, fontFamily: fonts.medium },
  payoutAmount: { color: '#FFFFFF', fontSize: 30, fontFamily: fonts.medium, letterSpacing: -0.6, marginTop: 6, fontVariant: ['tabular-nums'] },
  payoutTiles: { flexDirection: 'row', gap: 8, marginTop: 14 },
  payoutTile: { flex: 1, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 12, paddingVertical: 10 },
  tileLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontFamily: fonts.regular },
  tileValue: { color: '#FFFFFF', fontSize: 15, fontFamily: fonts.medium, marginTop: 2 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  section: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  todoChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: TINT.amber.bg },
  todoChipText: { color: TINT.amber.text, fontSize: 12, fontFamily: fonts.medium },
  link: { color: G.blue600, fontSize: 13, fontFamily: fonts.medium },

  todoWrap: { marginBottom: 8 },
  todo: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  todoIcon: { width: 32, height: 32, resizeMode: 'contain' },
  todoTitle: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  todoSub: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },
  urgent: { color: G.red },
  empty: { padding: 16, marginBottom: 8 },
  emptyText: { color: G.muted, fontSize: 14, fontFamily: fonts.regular },

  sectionGap: { marginTop: 14 },
  list: { overflow: 'hidden', marginBottom: 14 },
  liveEmpty: { padding: 16, gap: 6 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(28,31,42,0.08)' },
  thumb: { width: 40, height: 40, borderRadius: 10 },
  liveTitle: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  liveSub: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, marginTop: 2, fontVariant: ['tabular-nums'] },
  livePrice: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },

  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, paddingVertical: 12, paddingHorizontal: 12 },
  statValue: { color: G.ink, fontSize: 20, fontFamily: fonts.medium },
  statLabel: { color: G.muted, fontSize: 11, fontFamily: fonts.regular, marginTop: 2 },
});
