import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Image, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  PillTabs,
  GadgetImage,
  HeartButton,
  isUrgent,
  timeLeft,
  startsLabel,
  useNow,
} from '../../components/glass';
import { fonts } from '../../constants';
import { meService, AuctionCard, WatchFilter } from '../../services';
import { useWatchStore } from '../../store/watchStore';
import { formatCurrency } from '../../utils';

export const WatchlistScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const now = useNow();
  const toggle = useWatchStore(s => s.toggle);
  const [filter, setFilter] = useState<WatchFilter>('all');
  const [rows, setRows] = useState<AuctionCard[]>([]);
  const [counts, setCounts] = useState<Record<WatchFilter, number>>({ all: 0, ending_soon: 0, starting_soon: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (f: WatchFilter) => {
    try {
      const res = await meService.watchlist(f);
      setRows(res.auctions);
      setCounts(res.counts);
    } catch {
      // keep what we had
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(filter);
    }, [load, filter])
  );

  const unwatch = async (id: string) => {
    setRows(r => r.filter(x => x.id !== id));
    setCounts(c => ({ ...c, all: Math.max(0, c.all - 1) }));
    await toggle(id);
    load(filter);
  };

  return (
    <GlassScreen>
      <GlassHeader title="Watchlist" />
      <FlatList
        data={rows}
        keyExtractor={a => a.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={G.blue}
            onRefresh={async () => {
              setRefreshing(true);
              await load(filter);
              setRefreshing(false);
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.tabs}>
            <PillTabs
              value={filter}
              onChange={f => {
                setLoading(true);
                setFilter(f);
              }}
              tabs={[
                { key: 'all', label: 'All', count: counts.all },
                { key: 'ending_soon', label: 'Ending soon', count: counts.ending_soon },
                { key: 'starting_soon', label: 'Starting soon', count: counts.starting_soon },
              ]}
            />
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        renderItem={({ item }) => {
          const scheduled = item.status === 'scheduled';
          const urgent = !scheduled && isUrgent(item.end_time, now);
          return (
            <Pressable
              onPress={() => navigation.navigate('AuctionDetail', { auctionId: item.id })}
              accessibilityRole="button"
              accessibilityLabel={item.title}
            >
              <GlassCard style={styles.row}>
                <GadgetImage uri={item.image} size={52} style={styles.thumb} />
                <View style={styles.body}>
                  <Text style={styles.title} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <View style={styles.priceRow}>
                    <Text style={styles.price}>{formatCurrency(item.current_price)}</Text>
                    <Text style={styles.meta}>
                      {scheduled ? 'Starting price' : `${item.total_bids} bid${item.total_bids === 1 ? '' : 's'}`}
                    </Text>
                  </View>
                  <Text style={[styles.when, urgent && styles.urgent]}>
                    {scheduled ? startsLabel(item.start_time) : `Ends in ${timeLeft(item.end_time, now)}`}
                  </Text>
                </View>
                <HeartButton on onPress={() => unwatch(item.id)} />
              </GlassCard>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={G.blue} style={styles.loader} />
          ) : (
            <GlassCard style={styles.empty}>
              <Ionicons name="heart-outline" size={28} color={G.pink} />
              <Text style={styles.emptyTitle}>
                {filter === 'all' ? 'Nothing watched yet' : 'Nothing here right now'}
              </Text>
              <Text style={styles.emptyText}>
                Tap the heart on any auction to keep an eye on it. We'll alert you before it ends.
              </Text>
            </GlassCard>
          )
        }
        ListFooterComponent={
          <Pressable onPress={() => navigation.navigate('Alerts')} accessibilityRole="button" style={styles.footer}>
            <GlassCard style={styles.alertCard}>
              <Image source={require('../../../assets/icons/bell.png')} style={styles.alertIcon} />
              <View style={styles.body}>
                <Text style={styles.alertTitle}>Can't find it?</Text>
                <Text style={styles.alertText}>Get an alert when it's listed.</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={G.faint} />
            </GlassCard>
          </Pressable>
        }
      />
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 120 },
  tabs: { paddingBottom: 14 },
  gap: { height: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
  thumb: { width: 64, height: 64, borderRadius: 12 },
  body: { flex: 1, gap: 2 },
  title: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  price: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  meta: { color: G.muted, fontSize: 11, fontFamily: fonts.regular },
  when: { color: G.muted, fontSize: 12, fontFamily: fonts.regular },
  urgent: { color: G.orangeInk },
  loader: { marginTop: 40 },
  empty: { alignItems: 'center', padding: 20, gap: 6 },
  emptyTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  emptyText: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center', lineHeight: 19 },
  footer: { marginTop: 10 },
  alertCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  alertIcon: { width: 32, height: 32, resizeMode: 'contain' },
  alertTitle: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  alertText: { color: G.muted, fontSize: 12, fontFamily: fonts.regular },
});
