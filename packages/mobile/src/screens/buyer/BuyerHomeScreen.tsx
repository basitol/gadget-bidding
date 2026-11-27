import React, { useCallback, useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, StyleSheet, RefreshControl, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  G,
  MONO,
  GlassScreen,
  GlassCard,
  Chip,
  SectionLabel,
  TimerChip,
  GadgetImage,
  PrimaryButton,
  useNow,
} from '../../components/glass';
import { fonts } from '../../constants';
import { auctionService, notificationService } from '../../services';
import { useAuthStore } from '../../store';
import { useWatchStore } from '../../store/watchStore';
import { Auction } from '../../types';
import { formatCurrency } from '../../utils';
import { CATEGORY_CHIPS, initialsOf } from './categories';

const TRUST = [
  { label: 'Escrow payments', icon: require('../../../assets/icons/shield.png') },
  { label: 'IMEI checked', icon: require('../../../assets/icons/phonecheck.png') },
  { label: 'Hub inspected', icon: require('../../../assets/icons/box.png') },
];

const bidsOf = (a: Auction) => (a as any).total_bids ?? a.bid_count ?? 0;

export const BuyerHomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const user = useAuthStore(s => s.user);
  const loadWatch = useWatchStore(s => s.load);
  const now = useNow();
  const [featured, setFeatured] = useState<Auction | null>(null);
  const [live, setLive] = useState<Auction[]>([]);
  const [unread, setUnread] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [ending, hot, count] = await Promise.allSettled([
      auctionService.getEndingSoon(1, 1),
      auctionService.getAuctions({ status: 'active', sort_by: 'bid_count' }, 1, 10),
      notificationService.getUnreadCount(),
    ]);
    if (ending.status === 'fulfilled') setFeatured(ending.value.data?.[0] ?? null);
    if (hot.status === 'fulfilled') setLive(hot.value.data ?? []);
    if (count.status === 'fulfilled') setUnread(count.value.data?.unread_count ?? 0);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      loadWatch();
    }, [load, loadWatch])
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const open = (auctionId: string) => navigation.navigate('AuctionDetail', { auctionId });
  const explore = (params?: object) => navigation.navigate('Explore', params);

  return (
    <GlassScreen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={G.blue} />}
      >
        <View style={styles.top}>
          <Image source={require('../../../assets/brand/logo-wordmark.png')} style={styles.wordmark} accessibilityLabel="Gadgets Bidding" />
          <View style={styles.topActions}>
            <Pressable
              onPress={() => navigation.navigate('Notifications')}
              style={styles.roundButton}
              accessibilityRole="button"
              accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
            >
              <Image source={require('../../../assets/icons/bell.png')} style={styles.bell} />
              {unread > 0 ? <View style={styles.dot} /> : null}
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('Profile')}
              style={[styles.roundButton, styles.avatar]}
              accessibilityRole="button"
              accessibilityLabel="Profile"
            >
              <Text style={styles.avatarText}>{initialsOf(user?.full_name)}</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.title} accessibilityRole="header">
          Find your next gadget,{'\n'}
          <Text style={{ color: G.blue }}>at your price.</Text>
        </Text>

        <Pressable onPress={() => explore({ focusSearch: true })} style={styles.search} accessibilityRole="search">
          <Ionicons name="search" size={16} color={G.muted} />
          <Text style={styles.searchText}>Search iPhone 15, PS5, MacBook…</Text>
        </Pressable>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {CATEGORY_CHIPS.map(c => (
            <Chip key={c.label} label={c.label} selected={c.slug === null} onPress={() => explore({ category: c.slug })} />
          ))}
        </ScrollView>

        {featured ? (
          <Pressable onPress={() => open(featured.id)} accessibilityRole="button" accessibilityLabel={featured.gadget?.title}>
            <GlassCard style={styles.featured}>
              <View style={styles.featuredTop}>
                <TimerChip end={featured.end_time} now={now} />
                <View style={styles.inspected}>
                  <Text style={styles.inspectedText}>Inspected</Text>
                </View>
              </View>
              <GadgetImage uri={featured.gadget?.images?.[0]} size={150} style={styles.featuredImage} />
              <Text style={styles.kicker}>ENDING SOON · {bidsOf(featured)} BIDS</Text>
              <Text style={styles.featuredTitle} numberOfLines={1}>
                {featured.gadget?.title}
              </Text>
              <View style={styles.featuredFoot}>
                <Text style={styles.featuredPrice}>{formatCurrency(featured.current_price)}</Text>
                <PrimaryButton label="Bid" compact onPress={() => open(featured.id)} />
              </View>
            </GlassCard>
          </Pressable>
        ) : null}

        <View style={styles.trust}>
          {TRUST.map(t => (
            <GlassCard key={t.label} style={styles.trustCard}>
              <Image source={t.icon} style={styles.trustIcon} />
              <Text style={styles.trustText}>{t.label}</Text>
            </GlassCard>
          ))}
        </View>

        <SectionLabel
          right={
            <Pressable onPress={() => explore()} hitSlop={8}>
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          }
        >
          Live now
        </SectionLabel>
        {live.length ? (
          <FlatList
            horizontal
            data={live}
            keyExtractor={a => a.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.liveList}
            renderItem={({ item }) => (
              <Pressable onPress={() => open(item.id)} style={styles.liveCard} accessibilityRole="button" accessibilityLabel={item.gadget?.title}>
                <GadgetImage uri={item.gadget?.images?.[0]} size={84} style={styles.liveImage} />
                <TimerChip end={item.end_time} now={now} style={styles.liveTimer} />
                <View style={styles.liveBody}>
                  <Text style={styles.liveTitle} numberOfLines={1}>
                    {item.gadget?.title}
                  </Text>
                  <Text style={styles.livePrice}>{formatCurrency(item.current_price)}</Text>
                </View>
              </Pressable>
            )}
          />
        ) : (
          <GlassCard style={styles.empty}>
            <Text style={styles.emptyText}>No live auctions right now. New ones go live every day.</Text>
          </GlassCard>
        )}
      </ScrollView>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { width: 128, height: 28, resizeMode: 'contain' },
  topActions: { flexDirection: 'row', gap: 8 },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bell: { width: 24, height: 24, resizeMode: 'contain' },
  dot: { position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: G.orange, borderWidth: 1.5, borderColor: '#FFFFFF' },
  avatar: { backgroundColor: G.blueTint },
  avatarText: { color: G.blue, fontSize: 13, fontFamily: fonts.medium },
  title: { color: G.ink, fontSize: 26, lineHeight: 32, fontFamily: fonts.medium, letterSpacing: -0.5, marginTop: 20 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    marginTop: 16,
  },
  searchText: { color: G.faint, fontSize: 14, fontFamily: fonts.regular },
  chips: { gap: 8, paddingVertical: 14 },

  featured: { padding: 14 },
  featuredTop: { flexDirection: 'row', justifyContent: 'space-between' },
  inspected: { height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: G.greenTint, justifyContent: 'center' },
  inspectedText: { color: G.green, fontSize: 11, fontFamily: fonts.medium },
  featuredImage: { height: 170, borderRadius: 14, marginTop: 10, backgroundColor: 'transparent' },
  kicker: { fontFamily: MONO, fontSize: 10, letterSpacing: 0.6, color: G.muted, marginTop: 10 },
  featuredTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium, marginTop: 4 },
  featuredFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  featuredPrice: { color: G.ink, fontSize: 22, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },

  trust: { flexDirection: 'row', gap: 8, marginVertical: 16 },
  trustCard: { flex: 1, alignItems: 'center', paddingVertical: 12, gap: 6 },
  trustIcon: { width: 30, height: 30, resizeMode: 'contain' },
  trustText: { color: G.slate, fontSize: 11, fontFamily: fonts.medium, textAlign: 'center' },

  seeAll: { color: G.blue, fontSize: 13, fontFamily: fonts.medium },
  liveList: { gap: 10, paddingRight: 20 },
  liveCard: { width: 140, borderRadius: 18, backgroundColor: G.card, borderWidth: 1, borderColor: G.cardBorder, overflow: 'hidden' },
  liveImage: { height: 96 },
  liveTimer: { position: 'absolute', top: 8, left: 8 },
  liveBody: { padding: 10, gap: 2 },
  liveTitle: { color: G.ink, fontSize: 12, fontFamily: fonts.medium },
  livePrice: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  empty: { padding: 16 },
  emptyText: { color: G.muted, fontSize: 13, fontFamily: fonts.regular },
});
