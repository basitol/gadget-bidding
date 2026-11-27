import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, RefreshControl, ActivityIndicator, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useReloadOnReconnect } from '../../store/networkStore';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  PillTabs,
  GadgetImage,
  PrimaryButton,
  timeLeft,
  isUrgent,
  useNow,
} from '../../components/glass';
import { BidsSkeleton } from '../../components/glass/Skeleton';
import { fonts } from '../../constants';
import { meService, MyBidRow, BidTab } from '../../services';
import { formatCurrency, formatDate } from '../../utils';

const Status: React.FC<{ tone: 'green' | 'red' | 'blue' | 'grey'; label: string }> = ({ tone, label }) => {
  const c = {
    green: [G.greenTint, G.green],
    red: [G.redTint, G.red],
    blue: [G.blueTint, G.blue],
    grey: ['rgba(28,31,42,0.06)', G.slate],
  }[tone];
  return (
    <View style={[styles.status, { backgroundColor: c[0] }]}>
      <Text style={[styles.statusText, { color: c[1] }]}>{label}</Text>
    </View>
  );
};

export const BidsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const now = useNow();
  const [tab, setTab] = useState<BidTab>('bidding');
  const [rows, setRows] = useState<MyBidRow[]>([]);
  const [counts, setCounts] = useState<Record<BidTab, number>>({ bidding: 0, won: 0, lost: 0 });
  const [loading, setLoading] = useState(true);
  // The tab pills are skeletons too until the first answer (their counts are unknown).
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (t: BidTab) => {
    try {
      const res = await meService.myBids(t);
      setRows(res.rows);
      setCounts(res.counts);
    } catch {
      // keep what we had
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(tab);
    }, [load, tab])
  );
  useReloadOnReconnect(useCallback(() => load(tab), [load, tab]));

  const openAuction = (id: string) => navigation.navigate('AuctionDetail', { auctionId: id });

  const renderBidding = (r: MyBidRow) => {
    const outbid = !r.is_leading;
    return (
      <GlassCard style={styles.card}>
        <Pressable onPress={() => openAuction(r.id)} style={styles.row} accessibilityRole="button" accessibilityLabel={r.title}>
          <GadgetImage uri={r.image} size={48} style={styles.thumb} />
          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={1}>
              {r.title}
            </Text>
            <Text style={styles.meta}>
              {r.auto_bid_max ? `Auto-bid up to ${formatCurrency(r.auto_bid_max)}` : `Your bid ${formatCurrency(r.my_bid)}`}
            </Text>
            {outbid ? <Status tone="red" label="Outbid" /> : <Status tone="green" label="Winning" />}
          </View>
          <View style={styles.right}>
            <Text style={styles.price}>{formatCurrency(r.current_price)}</Text>
            <Text style={[styles.time, isUrgent(r.end_time, now) && styles.urgent]}>{timeLeft(r.end_time, now)}</Text>
          </View>
        </Pressable>
        {outbid ? <PrimaryButton label="Bid again" onPress={() => openAuction(r.id)} style={styles.action} /> : null}
      </GlassCard>
    );
  };

  const renderWon = (r: MyBidRow) => {
    const toPay = r.order?.payment_status === 'pending' && r.order.fulfillment_status === 'pending';
    const label = !r.order
      ? 'Won'
      : toPay
        ? 'Payment due'
        : r.order.fulfillment_status === 'delivered'
          ? 'Delivered'
          : r.order.fulfillment_status === 'cancelled'
            ? 'Expired'
            : 'Paid';
    return (
      <GlassCard style={styles.card}>
        <Pressable
          onPress={() => (r.order ? navigation.navigate('OrderDetail', { orderId: r.order.id }) : openAuction(r.id))}
          style={styles.row}
          accessibilityRole="button"
          accessibilityLabel={r.title}
        >
          <GadgetImage uri={r.image} size={48} style={styles.thumb} />
          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={1}>
              {r.title}
            </Text>
            <Text style={styles.meta}>Won {formatDate(r.end_time)}</Text>
            <Status tone={toPay ? 'blue' : label === 'Expired' ? 'grey' : 'green'} label={label} />
          </View>
          <Text style={styles.price}>{formatCurrency(r.current_price)}</Text>
        </Pressable>
        {toPay && r.order ? (
          <PrimaryButton
            label="Pay now"
            onPress={() => navigation.navigate('YouWon', { orderId: r.order!.id })}
            style={styles.action}
          />
        ) : null}
      </GlassCard>
    );
  };

  const renderLost = (r: MyBidRow) => (
    <Pressable onPress={() => navigation.navigate('AuctionResult', { auctionId: r.id })} accessibilityRole="button" accessibilityLabel={r.title}>
      <GlassCard style={[styles.card, styles.row]}>
        <GadgetImage uri={r.image} size={48} style={styles.thumb} />
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {r.title}
          </Text>
          <Text style={styles.meta}>Your best bid {formatCurrency(r.my_bid)}</Text>
          <Status tone="grey" label={r.status === 'cancelled' ? 'No sale' : 'Sold to another bidder'} />
        </View>
        <Text style={styles.price}>{formatCurrency(r.current_price)}</Text>
      </GlassCard>
    </Pressable>
  );

  const empty = {
    bidding: ["You're not bidding on anything", 'Find something you like in Explore and place a bid.'],
    won: ['No wins yet', 'When you win an auction it shows up here, ready to pay.'],
    lost: ['Nothing lost', "Auctions you bid on but didn't win show up here."],
  }[tab];

  return (
    <GlassScreen>
      <GlassHeader title="My bids" />
      <FlatList
        data={rows}
        keyExtractor={r => r.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={G.blue}
            onRefresh={async () => {
              setRefreshing(true);
              await load(tab);
              setRefreshing(false);
            }}
          />
        }
        ListHeaderComponent={
          loadedOnce ? (
          <View style={styles.tabs}>
            <PillTabs
              value={tab}
              onChange={t => {
                setLoading(true);
                setRows([]);
                setTab(t);
              }}
              tabs={[
                { key: 'bidding', label: 'Bidding', count: counts.bidding },
                { key: 'won', label: 'Won', count: counts.won },
                { key: 'lost', label: 'Lost', count: counts.lost },
              ]}
            />
          </View>
          ) : null
        }
        renderItem={({ item }) => (tab === 'bidding' ? renderBidding(item) : tab === 'won' ? renderWon(item) : renderLost(item))}
        ListEmptyComponent={
          loading ? (
            <BidsSkeleton tabs={!loadedOnce} />
          ) : (
            <GlassCard style={styles.empty}>
              <Image source={require('../../../assets/icons/gavel.png')} style={styles.emptyIcon} />
              <Text style={styles.emptyTitle}>{empty[0]}</Text>
              <Text style={styles.emptyText}>{empty[1]}</Text>
              {tab === 'bidding' ? (
                <PrimaryButton label="Explore auctions" onPress={() => navigation.navigate('Explore')} style={styles.action} />
              ) : null}
            </GlassCard>
          )
        }
      />
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 120 },
  tabs: { paddingBottom: 14 },
  gap: { height: 10 },
  card: { padding: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 60, height: 60, borderRadius: 12 },
  body: { flex: 1, gap: 3 },
  title: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  meta: { color: G.muted, fontSize: 12, fontFamily: fonts.regular },
  right: { alignItems: 'flex-end', gap: 4 },
  price: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  time: { color: G.muted, fontSize: 11, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  urgent: { color: G.orangeInk },
  status: { alignSelf: 'flex-start', height: 20, paddingHorizontal: 8, borderRadius: 10, justifyContent: 'center', marginTop: 2 },
  statusText: { fontSize: 11, fontFamily: fonts.medium },
  action: { marginTop: 10 },
  loader: { marginTop: 40 },
  empty: { alignItems: 'center', padding: 20, gap: 6 },
  emptyIcon: { width: 40, height: 40, resizeMode: 'contain' },
  emptyTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  emptyText: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center', lineHeight: 19 },
});
