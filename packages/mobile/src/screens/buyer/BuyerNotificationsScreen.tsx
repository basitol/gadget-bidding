import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  SectionList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  ImageSourcePropType,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { G, GlassScreen, GlassHeader, GlassCard, Chip, SectionLabel, PrimaryButton } from '../../components/glass';
import { fonts } from '../../constants';
import { notificationService } from '../../services';
import { Notification } from '../../types';
import { formatCurrency } from '../../utils';

type Filter = 'all' | 'bids' | 'orders';

const BID_TYPES = new Set([
  'outbid',
  'bid_placed',
  'auction_won',
  'auction_lost',
  'auction_ending',
  'auction_ending_soon',
  'bid_defaulted',
  'saved_search_match',
]);
const ORDER_TYPES = new Set([
  'order_created',
  'order_shipped',
  'order_delivered',
  'payment_initiated',
  'payment_received',
  'payment_failed',
  'payment_reminder',
  'fulfillment_updated',
]);

const ICONS: Record<string, ImageSourcePropType> = {
  gavel: require('../../../assets/icons/gavel.png'),
  autobid: require('../../../assets/icons/autobid.png'),
  wallet: require('../../../assets/icons/wallet.png'),
  truck: require('../../../assets/icons/truck.png'),
  tag: require('../../../assets/icons/tag.png'),
  bell: require('../../../assets/icons/bell.png'),
  box: require('../../../assets/icons/box.png'),
  shield: require('../../../assets/icons/shield.png'),
};

const parseData = (n: Notification): Record<string, any> => {
  if (!n.data) return {};
  if (typeof n.data === 'string') {
    try {
      return JSON.parse(n.data);
    } catch {
      return {};
    }
  }
  return n.data as Record<string, any>;
};

type Action = { label: string; primary: boolean; go: () => void };

/** "2m", "18m", "1h", "Yesterday", "Mon", "12 Nov". */
const ago = (iso: string) => {
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return `${Math.floor(s / 3600)}h`;
  const yesterday = new Date(today.getTime() - 86400_000);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (s < 6 * 86400) return d.toLocaleDateString('en-NG', { weekday: 'short' });
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
};

export const BuyerNotificationsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await notificationService.getNotifications(1, 50);
      setItems(res.data ?? []);
    } catch {
      setItems(prev => prev ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const markRead = (n: Notification) => {
    if (n.is_read) return;
    setItems(list => list?.map(x => (x.id === n.id ? { ...x, is_read: true } : x)) ?? null);
    notificationService.markAsRead(n.id).catch(() => {});
  };

  const readAll = async () => {
    setItems(list => list?.map(x => ({ ...x, is_read: true })) ?? null);
    await notificationService.markAllAsRead().catch(() => load());
  };

  /** What each alert looks like and where its button goes. */
  const describe = (n: Notification): { icon: ImageSourcePropType; action: Action | null; open: () => void } => {
    const d = parseData(n);
    const auction = (params: object = {}) => () =>
      d.auctionId && navigation.navigate('AuctionDetail', { auctionId: d.auctionId, ...params });
    const order = () => d.orderId && navigation.navigate('OrderDetail', { orderId: d.orderId });
    const openDefault = d.orderId ? order : d.auctionId ? auction() : () => {};

    switch (n.type as string) {
      case 'outbid':
        if (d.autoBidMax) {
          return {
            icon: ICONS.autobid,
            open: openDefault,
            action: { label: 'Change max', primary: false, go: () => d.auctionId && navigation.navigate('AutoBid', { auctionId: d.auctionId }) },
          };
        }
        return {
          icon: ICONS.gavel,
          open: openDefault,
          action: d.nextBid
            ? {
                label: `Bid ${formatCurrency(d.nextBid)}`,
                primary: true,
                go: () => d.auctionId && navigation.navigate('PlaceBid', { auctionId: d.auctionId, amount: d.nextBid }),
              }
            : { label: 'Bid again', primary: true, go: () => d.auctionId && navigation.navigate('Outbid', { auctionId: d.auctionId }) },
        };
      case 'auction_won':
        return d.secondChance
          ? {
              icon: ICONS.tag,
              open: openDefault,
              action: { label: 'See offer', primary: false, go: () => d.orderId && navigation.navigate('YouWon', { orderId: d.orderId }) },
            }
          : {
              icon: ICONS.shield,
              open: openDefault,
              action: d.orderId
                ? { label: 'Pay now', primary: true, go: () => navigation.navigate('YouWon', { orderId: d.orderId }) }
                : null,
            };
      case 'payment_failed':
        return {
          icon: ICONS.wallet,
          open: openDefault,
          action: { label: 'Fix payment', primary: true, go: () => d.orderId && navigation.navigate('CheckoutPayment', { orderId: d.orderId }) },
        };
      case 'payment_reminder':
        return {
          icon: ICONS.wallet,
          open: openDefault,
          action: { label: 'Pay now', primary: true, go: () => d.orderId && navigation.navigate('Checkout', { orderId: d.orderId }) },
        };
      case 'order_delivered':
        return d.action === 'confirm_delivery'
          ? { icon: ICONS.truck, open: openDefault, action: { label: 'Confirm delivery', primary: true, go: order } }
          : { icon: ICONS.truck, open: openDefault, action: null };
      case 'order_shipped':
        return { icon: ICONS.truck, open: openDefault, action: null };
      case 'fulfillment_updated':
      case 'order_created':
        return { icon: ICONS.box, open: openDefault, action: null };
      case 'payment_received':
        return { icon: ICONS.wallet, open: openDefault, action: null };
      case 'auction_ending_soon':
      case 'saved_search_match':
        return { icon: ICONS.bell, open: openDefault, action: null };
      default:
        return { icon: ICONS.bell, open: openDefault, action: null };
    }
  };

  const sections = useMemo(() => {
    const list = (items ?? []).filter(n =>
      filter === 'all' ? true : filter === 'bids' ? BID_TYPES.has(n.type as string) : ORDER_TYPES.has(n.type as string) || !!parseData(n).orderId
    );
    const today = new Date().toDateString();
    const todays = list.filter(n => new Date(n.created_at).toDateString() === today);
    const earlier = list.filter(n => new Date(n.created_at).toDateString() !== today);
    return [
      ...(todays.length ? [{ title: 'Today', data: todays }] : []),
      ...(earlier.length ? [{ title: 'Earlier', data: earlier }] : []),
    ];
  }, [items, filter]);

  const hasUnread = (items ?? []).some(n => !n.is_read);

  return (
    <GlassScreen>
      <GlassHeader
        title="Notifications"
        onBack={() => navigation.goBack()}
        right={
          <Pressable onPress={readAll} disabled={!hasUnread} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.readAll, !hasUnread && styles.readAllOff]}>Read all</Text>
          </Pressable>
        }
      />
      <SectionList
        sections={sections}
        keyExtractor={n => n.id}
        contentContainerStyle={styles.content}
        stickySectionHeadersEnabled={false}
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
        ListHeaderComponent={
          <View style={styles.filters}>
            <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
            <Chip label="Bids" selected={filter === 'bids'} onPress={() => setFilter('bids')} />
            <Chip label="Orders" selected={filter === 'orders'} onPress={() => setFilter('orders')} />
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHead}>
            <SectionLabel plain>{section.title}</SectionLabel>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        renderItem={({ item }) => {
          const { icon, action, open } = describe(item);
          const unread = !item.is_read;
          return (
            <Pressable
              onPress={() => {
                markRead(item);
                open();
              }}
              accessibilityRole="button"
              accessibilityLabel={`${unread ? 'Unread. ' : ''}${item.title}. ${item.message}`}
            >
              <GlassCard style={[styles.card, !unread && styles.cardRead]}>
                <View style={styles.iconTile}>
                  <Image source={icon} style={styles.icon} />
                </View>
                <View style={styles.body}>
                  <View style={styles.titleRow}>
                    <Text style={styles.title} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.time}>{ago(item.created_at)}</Text>
                    {unread ? <View style={styles.dot} /> : <View style={styles.dotSpace} />}
                  </View>
                  <Text style={styles.message}>{item.message}</Text>
                  {action ? (
                    action.primary ? (
                      <PrimaryButton
                        label={action.label}
                        compact
                        onPress={() => {
                          markRead(item);
                          action.go();
                        }}
                        style={styles.action}
                      />
                    ) : (
                      <Pressable
                        onPress={() => {
                          markRead(item);
                          action.go();
                        }}
                        style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
                        accessibilityRole="button"
                      >
                        <Text style={styles.secondaryText}>{action.label}</Text>
                      </Pressable>
                    )
                  ) : null}
                </View>
              </GlassCard>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          items === null ? (
            <ActivityIndicator color={G.blue} style={styles.loader} />
          ) : (
            <GlassCard style={styles.empty}>
              <Image source={ICONS.bell} style={styles.emptyIcon} />
              <Text style={styles.emptyTitle}>You're all caught up</Text>
              <Text style={styles.emptyText}>Outbids, wins and order updates show up here.</Text>
            </GlassCard>
          )
        }
        ListFooterComponent={
          <Pressable onPress={() => navigation.navigate('Settings')} style={styles.footer} accessibilityRole="link">
            <Text style={styles.footerText}>Notification settings</Text>
          </Pressable>
        }
      />
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 120 },
  readAll: { color: G.blue, fontSize: 14, fontFamily: fonts.medium },
  readAllOff: { color: G.faint },
  filters: { flexDirection: 'row', gap: 8, paddingBottom: 6 },
  sectionHead: { paddingTop: 16 },
  gap: { height: 10 },
  card: { flexDirection: 'row', gap: 12, padding: 14 },
  cardRead: { opacity: 0.92 },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F3F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { width: 30, height: 30, resizeMode: 'contain' },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, color: G.ink, fontSize: 15, fontFamily: fonts.medium, lineHeight: 20 },
  time: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: G.blue, marginTop: 6 },
  dotSpace: { width: 8 },
  message: { color: G.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, marginTop: 4 },
  action: { alignSelf: 'flex-start', marginTop: 12 },
  secondary: {
    alignSelf: 'flex-start',
    marginTop: 12,
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(28,31,42,0.06)',
    justifyContent: 'center',
  },
  secondaryText: { color: G.ink, fontSize: 13, fontFamily: fonts.medium },
  pressed: { opacity: 0.7 },
  loader: { marginTop: 40 },
  empty: { alignItems: 'center', padding: 20, gap: 6, marginTop: 16 },
  emptyIcon: { width: 40, height: 40, resizeMode: 'contain' },
  emptyTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  emptyText: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center' },
  footer: { alignItems: 'center', paddingVertical: 20 },
  footerText: { color: G.blue, fontSize: 14, fontFamily: fonts.medium },
});
