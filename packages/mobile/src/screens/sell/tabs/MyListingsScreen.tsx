import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  PillTabs,
  GadgetImage,
  startsLabel,
  useNow,
  isUrgent,
} from '../../../components/glass';
import { fonts } from '../../../constants';
import { auctionService } from '../../../services';
import { useReloadOnReconnect } from '../../../store/networkStore';
import { useToastStore } from '../../../store/toastStore';
import { formatCurrency } from '../../../utils';
import { sellerTabsService, ListingTab, SellerListing, timeLeftLong } from '../../../services/sellerTabs.service';
import { TINT } from '../onboarding/kit';

const toast = (m: string, t: 'success' | 'error' = 'error') => useToastStore.getState().show(m, t);
const msg = (e: unknown) => (e instanceof Error ? e.message : "That didn't work. Try again.");
const day = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

const EMPTY: Record<ListingTab, string> = {
  live: 'Nothing live right now. Tap + to list a gadget.',
  review: 'Nothing waiting for review.',
  changes: 'No listings need changes.',
  unsold: "Listings that end without a sale show here, so you can relist them.",
};

/** My listings: live, in review, needing changes, and ones that didn't sell. */
export const MyListingsScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const now = useNow(1000);
  const [tab, setTab] = useState<ListingTab>(route.params?.tab ?? 'live');
  const [items, setItems] = useState<SellerListing[]>([]);
  const [counts, setCounts] = useState<Record<ListingTab, number>>({ live: 0, review: 0, changes: 0, unsold: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (t: ListingTab) => {
    try {
      const res = await sellerTabsService.listings(t);
      setItems(res.items);
      setCounts(res.counts);
    } catch (e) {
      toast(msg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(tab);
    }, [load, tab])
  );
  // Opened from an alert ("Relist", "Fix listing"): jump to that tab.
  const wanted = route.params?.tab as ListingTab | undefined;
  useEffect(() => {
    if (wanted && wanted !== tab) {
      setLoading(true);
      setItems([]);
      setTab(wanted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);
  useReloadOnReconnect(useCallback(() => load(tab), [load, tab]));

  const editGadget = async (gadgetId: string) => {
    setBusy(gadgetId);
    try {
      const res = await auctionService.getGadget(gadgetId);
      navigation.navigate('CreateGadget', { gadget: res.data });
    } catch (e) {
      toast(msg(e));
    } finally {
      setBusy(null);
    }
  };

  const chipFor = (l: SellerListing): { label: string; bg: string; text: string } => {
    if (tab === 'live')
      return l.status === 'scheduled'
        ? { label: 'Scheduled', bg: TINT.blue.bg, text: TINT.blue.text }
        : { label: 'Live', bg: TINT.green.bg, text: TINT.green.text };
    if (tab === 'review') return { label: 'In review', bg: TINT.blue.bg, text: TINT.blue.text };
    if (tab === 'changes') return { label: 'Needs changes', bg: TINT.amber.bg, text: TINT.amber.text };
    return { label: l.ended_by_seller ? 'Ended by you' : "Didn't sell", bg: TINT.fill, text: G.slate };
  };

  const subFor = (l: SellerListing) => {
    if (tab === 'live')
      return l.bids
        ? `${l.bids} bid${l.bids === 1 ? '' : 's'} · ${l.watching} watching`
        : `No bids yet · ${l.watching} watching`;
    if (tab === 'review') return `Sent ${day(l.sent_at)} · our team checks it within a day`;
    if (tab === 'changes') return l.note || 'Our team asked for changes';
    return `${l.bids ? `${l.bids} bid${l.bids === 1 ? '' : 's'}` : 'No bids'} · ended ${day(l.ended_at)}`;
  };

  const renderItem = ({ item: l }: { item: SellerListing }) => {
    const chip = chipFor(l);
    const live = tab === 'live';
    const scheduled = l.status === 'scheduled';
    // Live and didn't-sell listings open Manage listing (edit, end, end early, note, photo, relist).
    const manage = () => navigation.navigate('ManageListing', { auctionId: l.id });
    const action = live
      ? { label: l.can_edit ? 'Edit or end' : 'Manage', onPress: manage }
      : tab === 'changes'
        ? { label: 'Fix listing', onPress: () => editGadget(l.id) }
        : tab === 'unsold'
          ? { label: 'Relist', onPress: () => navigation.navigate('Relist', { auctionId: l.id }) }
          : null;
    const open = () => (l.kind === 'auction' ? manage() : editGadget(l.id));
    return (
      <Pressable onPress={open} style={({ pressed }) => pressed && styles.pressed} accessibilityRole="button" accessibilityLabel={l.title}>
        <GlassCard style={styles.card}>
          <View style={styles.row}>
            <GadgetImage uri={l.image} size={52} style={styles.thumb} />
            <View style={styles.body}>
              <Text style={styles.title} numberOfLines={1}>
                {l.title}
              </Text>
              <Text style={styles.sub} numberOfLines={tab === 'changes' ? 2 : 1}>
                {subFor(l)}
              </Text>
              <View style={[styles.chip, { backgroundColor: chip.bg }]}>
                <Text style={[styles.chipText, { color: chip.text }]}>{chip.label}</Text>
              </View>
            </View>
            <View style={styles.right}>
              <Text style={styles.price}>{formatCurrency(l.price)}</Text>
              {live && l.end_time ? (
                <Text style={[styles.time, !scheduled && isUrgent(l.end_time, now) && styles.urgent]}>
                  {scheduled && l.start_time ? startsLabel(l.start_time).replace('Starts ', '') : timeLeftLong(l.end_time, now)}
                </Text>
              ) : null}
            </View>
          </View>
          {action ? (
            <Pressable
              onPress={action.onPress}
              disabled={busy === l.id}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              {busy === l.id ? <ActivityIndicator color={G.blue} /> : <Text style={styles.actionText}>{action.label}</Text>}
            </Pressable>
          ) : null}
        </GlassCard>
      </Pressable>
    );
  };

  return (
    <GlassScreen>
      <GlassHeader
        title="My listings"
        right={
          <Pressable
            onPress={() => navigation.navigate('CreateGadget')}
            style={({ pressed }) => [styles.add, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="List a gadget"
          >
            <Ionicons name="add" size={22} color="#FFFFFF" />
          </Pressable>
        }
      />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          <PillTabs
            value={tab}
            onChange={t => {
              setLoading(true);
              setItems([]);
              setTab(t);
            }}
            tabs={[
              { key: 'live', label: 'Live' },
              { key: 'review', label: 'In review', count: counts.review || undefined },
              { key: 'changes', label: 'Needs changes', count: counts.changes || undefined },
              { key: 'unsold', label: "Didn't sell", count: counts.unsold || undefined },
            ]}
          />
        </ScrollView>
      </View>
      <FlatList
        data={items}
        keyExtractor={l => l.id}
        renderItem={renderItem}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        showsVerticalScrollIndicator={false}
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
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={G.blue} style={styles.loader} />
          ) : (
            <GlassCard style={styles.empty}>
              <Text style={styles.emptyText}>{EMPTY[tab]}</Text>
            </GlassCard>
          )
        }
      />

    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
  add: { width: 40, height: 40, borderRadius: 12, backgroundColor: G.blue, alignItems: 'center', justifyContent: 'center' },
  tabs: { paddingHorizontal: 20, paddingBottom: 14 },
  content: { paddingHorizontal: 20, paddingBottom: 120 },
  gap: { height: 10 },
  card: { padding: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  thumb: { width: 52, height: 52, borderRadius: 12 },
  body: { flex: 1, gap: 3 },
  title: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  sub: { color: G.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.regular },
  chip: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 3 },
  chipText: { fontSize: 11, fontFamily: fonts.medium },
  right: { alignItems: 'flex-end', gap: 3 },
  price: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  time: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  urgent: { color: G.orangeInk },
  action: {
    marginTop: 12,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  loader: { marginTop: 40 },
  empty: { padding: 18 },
  emptyText: { color: G.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, textAlign: 'center' },
});
