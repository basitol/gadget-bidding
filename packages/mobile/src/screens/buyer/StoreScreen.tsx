import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { G, GlassScreen, GlassHeader, GlassCard, PillTabs, AuctionTile, PrimaryButton, useNow } from '../../components/glass';
import { fonts } from '../../constants';
import { api } from '../../services';
import type { AuctionCard } from '../../services';
import { useToastStore } from '../../store/toastStore';
import { useAuthStore } from '../../store';

type Store = {
  id: string;
  code: string;
  location: string;
  selling_since: string;
  badges: { verified_business: boolean; cac_registered: boolean; top_seller: boolean };
  stats: { sales: number; rating: number | null; rating_count: number; followers: number };
  live_count: number;
  following: boolean;
  is_me: boolean;
  /** What the seller wrote, and opening hours (null when not set). */
  about?: string | null;
  hours?: Record<string, { open: string; close: string } | null> | null;
  /** "Open Mon–Sat, 9:00 am–6:00 pm" */
  hours_line?: string | null;
  /** The seller is away: no new listings for now; live auctions still run. */
  away?: boolean;
};
type Reviews = {
  average: number | null;
  count: number;
  breakdown: { score: number; count: number }[];
  reviews: {
    id: string;
    score: number;
    comment: string | null;
    item: string | null;
    buyer: string;
    created_at: string;
    /** The seller's public reply. */
    reply?: { text: string; at: string } | null;
  }[];
};
type Tab = 'live' | 'reviews' | 'about';

const monthYear = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { month: 'short', year: 'numeric' });
const shortCount = (n: number) => n.toLocaleString('en-NG');

export const StoreScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { sellerId } = route.params;
  const now = useNow();
  const signedIn = useAuthStore(s => s.isAuthenticated);
  const [store, setStore] = useState<Store | null>(null);
  const [auctions, setAuctions] = useState<AuctionCard[] | null>(null);
  const [reviews, setReviews] = useState<Reviews | null>(null);
  const [tab, setTab] = useState<Tab>('live');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const [p, a, r] = await Promise.allSettled([
      api.get(`/stores/${sellerId}`),
      api.get(`/stores/${sellerId}/auctions`),
      api.get(`/stores/${sellerId}/reviews`),
    ]);
    if (p.status === 'fulfilled') setStore(p.value.data.data);
    else setMissing(true);
    setAuctions(a.status === 'fulfilled' ? a.value.data.data : []);
    if (r.status === 'fulfilled') setReviews(r.value.data.data);
  }, [sellerId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFollow = async () => {
    if (!store) return;
    const was = store.following;
    setBusy(true);
    // Optimistic
    setStore({ ...store, following: !was, stats: { ...store.stats, followers: store.stats.followers + (was ? -1 : 1) } });
    try {
      const res = was ? await api.delete(`/stores/${sellerId}/follow`) : await api.put(`/stores/${sellerId}/follow`);
      const d = res.data.data;
      setStore(s => (s ? { ...s, following: d.following, stats: { ...s.stats, followers: d.followers } } : s));
      if (!was) useToastStore.getState().show(`Following ${store.code}. We'll tell you about new listings.`, 'success');
    } catch {
      setStore(store);
      useToastStore.getState().show("Couldn't update that. Try again.", 'error');
    } finally {
      setBusy(false);
    }
  };

  if (missing) {
    return (
      <GlassScreen>
        <GlassHeader title="Store" onBack={() => navigation.goBack()} />
        <GlassCard style={styles.empty}>
          <Text style={styles.emptyTitle}>This store isn't available</Text>
        </GlassCard>
      </GlassScreen>
    );
  }
  if (!store) {
    return (
      <GlassScreen>
        <GlassHeader title="Store" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={G.blue} style={styles.loader} />
      </GlassScreen>
    );
  }

  const header = (
    <View>
      <GlassCard style={styles.hero}>
        <LinearGradient colors={['#5B7CFA', '#9483EC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner} />
        <View style={styles.heroBody}>
          <View style={styles.heroTop}>
            <View style={styles.logo}>
              <Ionicons name="shield-checkmark-outline" size={22} color="#5B4FD8" />
            </View>
            {!store.is_me && signedIn ? (
              store.following ? (
                <Pressable
                  onPress={toggleFollow}
                  disabled={busy}
                  style={({ pressed }) => [styles.following, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Following. Tap to unfollow"
                >
                  <Text style={styles.followingText}>Following</Text>
                </Pressable>
              ) : (
                <PrimaryButton label="Follow" compact onPress={toggleFollow} disabled={busy} style={styles.follow} />
              )
            ) : null}
          </View>
          <Text style={styles.name} accessibilityRole="header">
            {store.badges.verified_business ? 'Verified seller' : 'Seller'} {store.code}
          </Text>
          <Text style={styles.meta}>
            {store.location} · selling since {monthYear(store.selling_since)}
          </Text>
          {store.hours_line ? <Text style={styles.meta}>{store.hours_line}</Text> : null}
          <Text style={styles.note}>
            Seller names are kept private.{' '}
            {store.badges.verified_business
              ? "Every seller is a registered business we've checked."
              : "This seller's business checks aren't finished yet."}
          </Text>
          {store.away ? (
            <Text style={styles.awayNote}>Away for now. Their live auctions still run.</Text>
          ) : null}
          {store.badges.verified_business || store.badges.top_seller || store.away ? (
            <View style={styles.badges}>
              {store.away ? <Badge tone="amber" label="Away" /> : null}
              {store.badges.verified_business ? <Badge tone="blue" label="Verified business" /> : null}
              {store.badges.cac_registered ? <Badge tone="purple" label="CAC registered" /> : null}
              {store.badges.top_seller ? <Badge tone="green" label="Top seller" /> : null}
            </View>
          ) : null}
          <View style={styles.statsLine} />
          <View style={styles.stats}>
            <Stat value={shortCount(store.stats.sales)} label="Sales" />
            <Stat value={store.stats.rating != null ? store.stats.rating.toFixed(1) : '–'} label="Rating" />
            <Stat value={shortCount(store.stats.followers)} label="Followers" />
          </View>
        </View>
      </GlassCard>

      <View style={styles.tabs}>
        <PillTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'live', label: 'Live auctions', count: store.live_count },
            { key: 'reviews', label: 'Reviews' },
            { key: 'about', label: 'About' },
          ]}
        />
      </View>
    </View>
  );

  const refresh = (
    <RefreshControl
      refreshing={refreshing}
      tintColor={G.blue}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
    />
  );

  if (tab === 'live') {
    return (
      <GlassScreen>
        <GlassHeader title="Store" onBack={() => navigation.goBack()} />
        <FlatList
          data={auctions ?? []}
          keyExtractor={a => a.id}
          numColumns={2}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.content}
          ListHeaderComponent={header}
          refreshControl={refresh}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <AuctionTile
              title={item.title}
              image={item.image}
              price={item.current_price}
              end={item.end_time}
              now={now}
              onPress={() => navigation.push('AuctionDetail', { auctionId: item.id })}
            />
          )}
          ListEmptyComponent={
            auctions === null ? (
              <ActivityIndicator color={G.blue} style={styles.loader} />
            ) : (
              <GlassCard style={styles.empty}>
                <Text style={styles.emptyTitle}>No live auctions right now</Text>
                <Text style={styles.emptyText}>
                  {store.following ? "You're following this store, so we'll tell you when something new goes live." : 'Follow the store to hear when something new goes live.'}
                </Text>
              </GlassCard>
            )
          }
        />
      </GlassScreen>
    );
  }

  return (
    <GlassScreen>
      <GlassHeader title="Store" onBack={() => navigation.goBack()} />
      <FlatList
        data={tab === 'reviews' ? reviews?.reviews ?? [] : []}
        keyExtractor={r => r.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            {header}
            {tab === 'reviews' && reviews && reviews.count > 0 ? (
              <GlassCard style={styles.summary}>
                <View>
                  <Text style={styles.big}>{reviews.average?.toFixed(1)}</Text>
                  <Stars score={Math.round(reviews.average ?? 0)} />
                  <Text style={styles.meta}>{shortCount(reviews.count)} ratings</Text>
                </View>
                <View style={styles.bars}>
                  {reviews.breakdown.map(b => (
                    <View key={b.score} style={styles.barRow}>
                      <Text style={styles.barLabel}>{b.score}</Text>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${reviews.count ? (b.count / reviews.count) * 100 : 0}%` }]} />
                      </View>
                    </View>
                  ))}
                </View>
              </GlassCard>
            ) : null}
            {tab === 'about' ? <About store={store} /> : null}
          </>
        }
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        refreshControl={refresh}
        renderItem={({ item }) => (
          <GlassCard style={styles.review}>
            <View style={styles.reviewTop}>
              <Stars score={item.score} />
              <Text style={styles.reviewDate}>{new Date(item.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}</Text>
            </View>
            {item.comment ? <Text style={styles.reviewText}>{item.comment}</Text> : null}
            <Text style={styles.reviewMeta}>{[item.buyer, item.item].filter(Boolean).join(' · ')}</Text>
            {item.reply ? (
              <View style={styles.reply}>
                <Text style={styles.replyLabel}>Reply from the seller</Text>
                <Text style={styles.replyText}>{item.reply.text}</Text>
              </View>
            ) : null}
          </GlassCard>
        )}
        ListEmptyComponent={
          tab === 'reviews' ? (
            <GlassCard style={styles.empty}>
              <Text style={styles.emptyTitle}>No reviews yet</Text>
              <Text style={styles.emptyText}>Buyers can rate this seller after their gadget is delivered.</Text>
            </GlassCard>
          ) : null
        }
      />
    </GlassScreen>
  );
};

const About: React.FC<{ store: Store }> = ({ store }) => (
  <GlassCard style={styles.aboutCard}>
    {store.about ? <Text style={[styles.aboutText, styles.divider]}>{store.about}</Text> : null}
    {[
      ['Location', store.location],
      ['Selling since', monthYear(store.selling_since)],
      ['Business checks', store.badges.verified_business ? 'Passed' : 'In progress'],
      ['CAC registration', store.badges.cac_registered ? 'Verified' : 'Not verified yet'],
      ['Completed sales', shortCount(store.stats.sales)],
      ...(store.hours_line ? [['Hours', store.away ? `Away for now · ${store.hours_line}` : store.hours_line]] : []),
    ].map(([k, v], i, arr) => (
      <View key={k} style={[styles.aboutRow, i < arr.length - 1 && styles.divider]}>
        <Text style={styles.aboutKey}>{k}</Text>
        <Text style={styles.aboutVal}>{v}</Text>
      </View>
    ))}
    <Text style={styles.aboutNote}>
      Every gadget from this store is checked at our Computer Village hub before it reaches you, and your money is held
      until you confirm it arrived.
    </Text>
  </GlassCard>
);

const Badge: React.FC<{ label: string; tone: 'blue' | 'purple' | 'green' | 'amber' }> = ({ label, tone }) => {
  const c = {
    blue: [G.blueTint, '#3E6AF0'],
    purple: ['#F5F2FF', '#7C68E8'],
    green: [G.greenTint, G.green],
    amber: ['#FFF6EE', G.orangeInk],
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c[0] }]}>
      <Text style={[styles.badgeText, { color: c[1] }]}>{label}</Text>
    </View>
  );
};

const Stat: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <View style={styles.stat}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const Stars: React.FC<{ score: number }> = ({ score }) => (
  <View style={styles.stars} accessibilityLabel={`${score} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map(n => (
      <Ionicons key={n} name={n <= score ? 'star' : 'star-outline'} size={14} color={n <= score ? '#F5A524' : G.faint} />
    ))}
  </View>
);

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  loader: { marginTop: 50 },
  pressed: { opacity: 0.7 },
  column: { gap: 12, marginBottom: 12 },
  gap: { height: 10 },

  hero: { overflow: 'hidden', marginTop: 4 },
  banner: { height: 84 },
  heroBody: { paddingHorizontal: 18, paddingBottom: 18 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: -36 },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#F5F3FF',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  follow: { minWidth: 92 },
  following: {
    height: 38,
    paddingHorizontal: 18,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(28,31,42,0.08)',
    justifyContent: 'center',
  },
  followingText: { color: G.ink, fontSize: 13, fontFamily: fonts.medium },
  name: { color: G.ink, fontSize: 22, fontFamily: fonts.medium, letterSpacing: -0.3, marginTop: 12 },
  meta: { color: G.muted, fontSize: 14, fontFamily: fonts.regular, marginTop: 4 },
  note: { color: G.muted, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular, marginTop: 8 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  badge: { height: 26, paddingHorizontal: 10, borderRadius: 8, justifyContent: 'center' },
  badgeText: { fontSize: 13, fontFamily: fonts.medium },
  statsLine: { height: 1, backgroundColor: 'rgba(28,31,42,0.06)', marginTop: 16 },
  stats: { flexDirection: 'row', marginTop: 14 },
  stat: { flex: 1 },
  statValue: { color: G.ink, fontSize: 20, fontFamily: fonts.medium },
  statLabel: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },

  tabs: { marginTop: 16, marginBottom: 14 },

  summary: { flexDirection: 'row', gap: 18, padding: 16, marginBottom: 10 },
  big: { color: G.ink, fontSize: 32, fontFamily: fonts.medium },
  bars: { flex: 1, justifyContent: 'center', gap: 5 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, width: 10 },
  barTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(28,31,42,0.06)', overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: '#F5A524' },
  stars: { flexDirection: 'row', gap: 2, marginTop: 4 },
  review: { padding: 14 },
  reviewTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewDate: { color: G.muted, fontSize: 12, fontFamily: fonts.regular },
  reviewText: { color: G.ink, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, marginTop: 8 },
  reviewMeta: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, marginTop: 8 },
  reply: { backgroundColor: '#F1F5FF', borderRadius: 12, padding: 12, marginTop: 10 },
  replyLabel: { color: G.blue600, fontSize: 13, fontFamily: fonts.medium },
  replyText: { color: G.slate, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, marginTop: 4 },
  awayNote: { color: G.slate, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular, marginTop: 8 },

  aboutCard: { overflow: 'hidden' },
  aboutRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: 'rgba(28,31,42,0.05)' },
  aboutKey: { color: G.muted, fontSize: 14, fontFamily: fonts.regular },
  aboutVal: { color: G.ink, fontSize: 14, lineHeight: 20, fontFamily: fonts.medium, textAlign: 'right', flexShrink: 1 },
  aboutText: { color: G.ink, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular, padding: 14 },
  aboutNote: { color: G.slate, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular, padding: 14, paddingTop: 4 },

  empty: { alignItems: 'center', padding: 20, gap: 6 },
  emptyTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  emptyText: { color: G.muted, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular, textAlign: 'center' },
});
