import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  Platform,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  PillTabs,
  GadgetImage,
  PrimaryButton,
  startsLabel,
  useNow,
  isUrgent,
} from '../../../components/glass';
import { BottomSheet } from '../../../components';
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
const digits = (v: string) => v.replace(/\D/g, '');

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
  const [pricing, setPricing] = useState<SellerListing | null>(null);
  const [start, setStart] = useState('');
  const [buyNow, setBuyNow] = useState('');

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

  const endListing = (l: SellerListing) =>
    Alert.alert('End this listing?', "It has no bids, so nobody loses out. You can relist it later.", [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'End listing',
        style: 'destructive',
        onPress: async () => {
          setBusy(l.id);
          try {
            await sellerTabsService.endListing(l.id);
            toast('Listing ended', 'success');
            load(tab);
          } catch (e) {
            toast(msg(e));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  const openPrices = (l: SellerListing) => {
    setStart(String(l.starting_price ?? l.price ?? ''));
    setBuyNow(l.buy_now_price ? String(l.buy_now_price) : '');
    setPricing(l);
  };

  const editOrEnd = (l: SellerListing) => {
    const options = ['Change prices', 'End listing', 'Cancel'];
    const pick = (i: number) => (i === 0 ? openPrices(l) : i === 1 ? endListing(l) : undefined);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: l.title, options, cancelButtonIndex: 2, destructiveButtonIndex: 1 },
        pick
      );
    } else {
      Alert.alert(l.title, undefined, [
        { text: options[0], onPress: () => pick(0) },
        { text: options[1], style: 'destructive', onPress: () => pick(1) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const savePrices = async () => {
    if (!pricing) return;
    const s = Number(digits(start));
    const b = buyNow ? Number(digits(buyNow)) : null;
    if (!s) return toast('Enter a starting price.');
    if (b != null && b <= s) return toast('The buy-now price has to be higher than the starting price.');
    setBusy(pricing.id);
    try {
      await sellerTabsService.updatePrices(pricing.id, { starting_price: s, buy_now_price: b });
      setPricing(null);
      toast('Prices updated', 'success');
      load(tab);
    } catch (e) {
      toast(msg(e));
    } finally {
      setBusy(null);
    }
  };

  const relist = (l: SellerListing) =>
    Alert.alert('Relist this gadget?', 'It goes live again with the same prices and photos.', [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Relist',
        onPress: async () => {
          setBusy(l.id);
          try {
            await sellerTabsService.relist(l.id);
            toast('Relisted', 'success');
            setTab('live');
            load('live');
          } catch (e) {
            toast(msg(e));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

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
    const action =
      live && l.can_edit
        ? { label: 'Edit or end', onPress: () => editOrEnd(l) }
        : live
          ? { label: 'Manage', onPress: () => navigation.navigate('AuctionDetail', { auctionId: l.id }) }
          : tab === 'changes'
          ? { label: 'Fix listing', onPress: () => editGadget(l.id) }
          : tab === 'unsold'
            ? { label: 'Relist', onPress: () => relist(l) }
            : null;
    const open = () =>
      l.kind === 'auction' ? navigation.navigate('AuctionDetail', { auctionId: l.id }) : editGadget(l.id);
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

      <BottomSheet visible={!!pricing} onClose={() => setPricing(null)}>
        <Text style={styles.sheetTitle}>Change prices</Text>
        <Text style={styles.sheetSub}>No one has bid yet, so you can change these. The end time stays the same.</Text>
        <Text style={styles.label}>Starting price</Text>
        <TextInput
          value={start ? Number(digits(start)).toLocaleString('en-NG') : ''}
          onChangeText={setStart}
          keyboardType="number-pad"
          style={styles.input}
          placeholder="₦0"
          placeholderTextColor={G.faint}
          accessibilityLabel="Starting price"
        />
        <Text style={styles.label}>Buy-now price (optional)</Text>
        <TextInput
          value={buyNow ? Number(digits(buyNow)).toLocaleString('en-NG') : ''}
          onChangeText={setBuyNow}
          keyboardType="number-pad"
          style={styles.input}
          placeholder="No buy-now price"
          placeholderTextColor={G.faint}
          accessibilityLabel="Buy-now price"
        />
        <PrimaryButton label={busy ? 'Saving…' : 'Save prices'} onPress={savePrices} disabled={!!busy} style={styles.save} />
      </BottomSheet>
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
  sheetTitle: { color: G.ink, fontSize: 19, fontFamily: fonts.medium },
  sheetSub: { color: G.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, marginTop: 6, marginBottom: 12 },
  label: { color: G.slate, fontSize: 14, fontFamily: fonts.medium, marginTop: 10, marginBottom: 8 },
  input: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#F5F6F9',
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: G.ink,
  },
  save: { marginTop: 18 },
});
