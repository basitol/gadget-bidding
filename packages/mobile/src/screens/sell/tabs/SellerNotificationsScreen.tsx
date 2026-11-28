import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  SectionList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Image,
  Alert,
  ImageSourcePropType,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { G, GlassScreen, GlassHeader, GlassCard, Chip, SectionLabel, PrimaryButton, useNow } from '../../../components/glass';
import { fonts } from '../../../constants';
import { api, getErrorMessage, auctionService, notificationService } from '../../../services';
import { useToastStore } from '../../../store/toastStore';
import { formatCurrency } from '../../../utils';
import { sellerTabsService, byWhen, hoursLeft } from '../../../services/sellerTabs.service';

type Filter = 'all' | 'sales' | 'listings' | 'money';

type FeedItem = {
  id: string;
  kind: string;
  category: 'sales' | 'listings' | 'money' | 'other';
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  order_id: string | null;
  auction_id: string | null;
  gadget_id: string | null;
  dispute_id: string | null;
  live: { dropoff_due_at?: string; price?: number; bids?: number; end_time?: string; respond_by?: string };
  action: { type: string; label: string; primary: boolean } | null;
};

const ICON: Record<string, ImageSourcePropType> = {
  sold: require('../../../../assets/icons/tag.png'),
  new_bid: require('../../../../assets/icons/gavel.png'),
  bidding_ended: require('../../../../assets/icons/gavel.png'),
  changes: require('../../../../assets/icons/camera.png'),
  case: require('../../../../assets/icons/shield.png'),
  payout: require('../../../../assets/icons/wallet.png'),
  payout_account: require('../../../../assets/icons/wallet.png'),
  hub_passed: require('../../../../assets/icons/box.png'),
  order: require('../../../../assets/icons/truck.png'),
  approved: require('../../../../assets/icons/store.png'),
  unsold: require('../../../../assets/icons/tag.png'),
  application: require('../../../../assets/icons/idcard.png'),
  other: require('../../../../assets/icons/bell.png'),
};

const toast = (m: string, t: 'success' | 'error' = 'error') => useToastStore.getState().show(m, t);

/** "5m", "2h", "Yesterday", "Mon", "24 Nov" */
const ago = (iso: string, now: number) => {
  const d = new Date(iso);
  const s = (now - d.getTime()) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return `${Math.floor(s / 3600)}h`;
  if (d.toDateString() === new Date(now - 86_400_000).toDateString()) return 'Yesterday';
  if (s < 6 * 86_400) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

/** "4m" / "1h 27m" / "2d 3h" */
const endsIn = (iso: string, now: number) => {
  const m = Math.max(0, Math.floor((new Date(iso).getTime() - now) / 60_000));
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
};

/** The line under the title, worked out now where it depends on the clock. */
const messageFor = (n: FeedItem, now: number) => {
  if (n.kind === 'sold' && n.live.dropoff_due_at) {
    return `The buyer has paid. Drop it at the Computer Village hub ${byWhen(n.live.dropoff_due_at, now)}.`;
  }
  if (n.kind === 'new_bid' && n.live.end_time && n.live.price != null) {
    const bids = n.live.bids ?? 0;
    return `Now ${formatCurrency(n.live.price)} · ${bids} bid${bids === 1 ? '' : 's'} · ${
      new Date(n.live.end_time).getTime() > now ? `ends in ${endsIn(n.live.end_time, now)}` : 'ended'
    }.`;
  }
  if (n.kind === 'case' && n.live.respond_by) {
    const left = hoursLeft(n.live.respond_by, now);
    return n.message.replace(/Reply within .*$/, left === 'overdue' ? 'Reply now.' : `Reply within ${left.replace(' left', '')}.`);
  }
  return n.message;
};

/** Seller notifications: sales, listings and money, with the next step on each. */
export const SellerNotificationsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const now = useNow(30_000);
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (f: Filter) => {
    try {
      const res = await api.get('/seller/notifications', { params: { filter: f } });
      setItems(res.data?.data?.items ?? []);
      setFailed(false);
    } catch (e) {
      setItems(prev => prev ?? []);
      setFailed(true);
      toast(getErrorMessage(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(filter);
    }, [load, filter])
  );

  const markRead = (n: FeedItem) => {
    if (n.is_read) return;
    setItems(list => list?.map(x => (x.id === n.id ? { ...x, is_read: true } : x)) ?? null);
    notificationService.markAsRead(n.id).catch(() => {});
  };

  const readAll = async () => {
    setItems(list => list?.map(x => ({ ...x, is_read: true })) ?? null);
    try {
      await notificationService.markAllAsRead();
    } catch {
      load(filter);
    }
  };

  const fixListing = async (gadgetId: string) => {
    try {
      const res = await auctionService.getGadget(gadgetId);
      navigation.navigate('CreateGadget', { gadget: res.data });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't open that listing");
    }
  };

  const sendToHub = (n: FeedItem) =>
    Alert.alert('Handed it in at the hub?', "Tap this once the item is with our hub team. They'll check it against your listing.", [
      { text: 'Not yet', style: 'cancel' },
      {
        text: "Yes, it's at the hub",
        onPress: async () => {
          setBusy(n.id);
          try {
            await sellerTabsService.sendToHub(n.order_id!);
            toast('Marked as dropped off', 'success');
            load(filter);
          } catch (e) {
            toast(e instanceof Error ? e.message : "That didn't work. Try again.");
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  const runAction = (n: FeedItem) => {
    switch (n.action?.type) {
      case 'send_to_hub':
        return sendToHub(n);
      case 'fix_listing':
        return n.gadget_id && fixListing(n.gadget_id);
      case 'view_case':
        return n.dispute_id && navigation.navigate('SellerCase', { disputeId: n.dispute_id });
      case 'see_payouts':
        return navigation.navigate('MainTabs', { screen: 'Payouts' });
      case 'relist':
        return navigation.navigate('MainTabs', { screen: 'Listings', params: { tab: 'unsold' } });
      case 'open_chat':
        return navigation.navigate('SupportChat');
      default:
        return undefined;
    }
  };

  /** Tapping the card itself. */
  const open = (n: FeedItem) => {
    if (n.action && n.kind !== 'sold') return runAction(n);
    if (n.kind === 'sold') return n.order_id ? navigation.navigate('SellerOrder', { orderId: n.order_id }) : navigation.navigate('MainTabs', { screen: 'Orders' });
    if (n.auction_id && ['new_bid', 'approved', 'bidding_ended'].includes(n.kind)) {
      return navigation.navigate('AuctionDetail', { auctionId: n.auction_id });
    }
    if (n.kind === 'unsold') return navigation.navigate('MainTabs', { screen: 'Listings', params: { tab: 'unsold' } });
    if (n.kind === 'application') return navigation.navigate('SellerStatus');
    if (n.order_id) return navigation.navigate('SellerOrder', { orderId: n.order_id });
    return undefined;
  };

  const sections = useMemo(() => {
    const list = items ?? [];
    const today = new Date(now).toDateString();
    const todays = list.filter(n => new Date(n.created_at).toDateString() === today);
    const earlier = list.filter(n => new Date(n.created_at).toDateString() !== today);
    return [
      ...(todays.length ? [{ title: 'Today', data: todays }] : []),
      ...(earlier.length ? [{ title: 'Earlier', data: earlier }] : []),
    ];
  }, [items, now]);

  const hasUnread = (items ?? []).some(n => !n.is_read);

  return (
    <GlassScreen>
      <GlassHeader
        title="Notifications"
        onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'))}
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
              await load(filter);
              setRefreshing(false);
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.filters}>
            {(
              [
                ['all', 'All'],
                ['sales', 'Sales'],
                ['listings', 'Listings'],
                ['money', 'Money'],
              ] as [Filter, string][]
            ).map(([key, label]) => (
              <Chip
                key={key}
                label={label}
                selected={filter === key}
                onPress={() => {
                  if (key === filter) return;
                  setItems(null);
                  setFilter(key);
                }}
              />
            ))}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHead}>
            <SectionLabel plain>{section.title}</SectionLabel>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        renderItem={({ item }) => {
          const unread = !item.is_read;
          const message = messageFor(item, now);
          const a = item.action;
          return (
            <Pressable
              onPress={() => {
                markRead(item);
                open(item);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${unread ? 'Unread. ' : ''}${item.title}. ${message}`}
            >
              <GlassCard style={[styles.card, !unread && styles.cardRead]}>
                <View style={styles.iconTile}>
                  <Image source={ICON[item.kind] ?? ICON.other} style={styles.icon} />
                </View>
                <View style={styles.body}>
                  <View style={styles.titleRow}>
                    <Text style={styles.title} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.time}>{ago(item.created_at, now)}</Text>
                    {unread ? <View style={styles.dot} /> : <View style={styles.dotSpace} />}
                  </View>
                  <Text style={styles.message}>{message}</Text>
                  {a ? (
                    a.primary ? (
                      <PrimaryButton
                        label={busy === item.id ? 'One moment…' : a.label}
                        compact
                        disabled={busy === item.id}
                        onPress={() => {
                          markRead(item);
                          runAction(item);
                        }}
                        style={styles.action}
                      />
                    ) : (
                      <Pressable
                        onPress={() => {
                          markRead(item);
                          runAction(item);
                        }}
                        style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
                        accessibilityRole="button"
                      >
                        <Text style={styles.secondaryText}>{a.label}</Text>
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
          ) : failed ? (
            <GlassCard style={styles.empty}>
              <Text style={styles.emptyTitle}>We couldn't load your notifications</Text>
              <Pressable onPress={() => load(filter)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.footerText}>Try again</Text>
              </Pressable>
            </GlassCard>
          ) : (
            <GlassCard style={styles.empty}>
              <Image source={ICON.other} style={styles.emptyIcon} />
              <Text style={styles.emptyTitle}>You're all caught up</Text>
              <Text style={styles.emptyText}>
                {filter === 'money'
                  ? 'Payouts to your bank show up here.'
                  : filter === 'listings'
                    ? 'New bids and listing reviews show up here.'
                    : 'Sales, bids and payouts show up here.'}
              </Text>
            </GlassCard>
          )
        }
        ListFooterComponent={
          <Pressable
            onPress={() => navigation.navigate('SellerNotificationSettings')}
            style={styles.footer}
            accessibilityRole="link"
          >
            <Text style={styles.footerText}>Notification settings</Text>
          </Pressable>
        }
      />
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
  content: { paddingHorizontal: 20, paddingBottom: 48 },
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
    borderColor: 'rgba(28,31,42,0.08)',
    justifyContent: 'center',
  },
  secondaryText: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  loader: { marginTop: 40 },
  empty: { alignItems: 'center', padding: 24, gap: 6, marginTop: 16 },
  emptyIcon: { width: 40, height: 40, resizeMode: 'contain' },
  emptyTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  emptyText: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center', lineHeight: 19 },
  footer: { alignItems: 'center', paddingVertical: 20 },
  footerText: { color: G.blue600, fontSize: 14, fontFamily: fonts.medium },
});
