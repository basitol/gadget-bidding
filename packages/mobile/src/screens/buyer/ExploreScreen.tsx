import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  Chip,
  SectionLabel,
  AuctionTile,
  CONDITION_LABEL,
  PrimaryButton,
  useNow,
} from '../../components/glass';
import { BottomSheet } from '../../components/motion';
import { fonts } from '../../constants';
import { auctionService, meService } from '../../services';
import { useToastStore } from '../../store/toastStore';
import { Auction } from '../../types';
import { CATEGORY_CHIPS } from './categories';

const RECENT_KEY = 'gb_recent_searches';
const SORTS = [
  { key: 'ending_soon', label: 'Ending soonest' },
  { key: 'bid_count', label: 'Most bids' },
  { key: 'price_asc', label: 'Price: low to high' },
  { key: 'price_desc', label: 'Price: high to low' },
  { key: 'newest', label: 'Newly listed' },
] as const;
type SortKey = (typeof SORTS)[number]['key'];

export const ExploreScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const now = useNow();
  const input = useRef<TextInput>(null);
  const [query, setQuery] = useState<string>(route.params?.query ?? '');
  const [category, setCategory] = useState<string | null>(route.params?.category ?? null);
  const [sort, setSort] = useState<SortKey>('ending_soon');
  const [sortOpen, setSortOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [results, setResults] = useState<Auction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [alertSaved, setAlertSaved] = useState(false);

  // Home's chips and search bar (and the not-found state) hand over a category, query or focus request.
  useEffect(() => {
    if (route.params?.category !== undefined) setCategory(route.params.category);
    if (route.params?.query) setQuery(route.params.query);
    if (route.params?.focusSearch) setTimeout(() => input.current?.focus(), 250);
  }, [route.params]);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then(v => setRecent(v ? JSON.parse(v) : []))
      .catch(() => {});
  }, []);

  const remember = useCallback((q: string) => {
    const term = q.trim();
    if (term.length < 2) return;
    setRecent(prev => {
      const next = [term, ...prev.filter(r => r.toLowerCase() !== term.toLowerCase())].slice(0, 6);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // Debounced search
  useEffect(() => {
    setLoading(true);
    setAlertSaved(false);
    const t = setTimeout(async () => {
      try {
        const res = await auctionService.getAuctions(
          {
            search: query.trim() || undefined,
            category: category ?? undefined,
            sort_by: sort === 'newest' ? undefined : sort,
          },
          1,
          40
        );
        setResults(res.data ?? []);
        setTotal((res as any).pagination?.total ?? res.data?.length ?? 0);
      } catch {
        setResults([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, category, sort]);

  const saveAlert = async () => {
    try {
      await meService.saveSearch({ query: query.trim() || undefined, category_slug: category ?? undefined });
      setAlertSaved(true);
      useToastStore.getState().show("We'll tell you when it's listed", 'success');
    } catch (e) {
      useToastStore.getState().show(e instanceof Error ? e.message : "Couldn't save that alert", 'error');
    }
  };

  const header = (
    <View>
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <Ionicons name="search" size={16} color={G.muted} />
          <TextInput
            ref={input}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => remember(query)}
            placeholder="Search iPhone, PS5, MacBook…"
            placeholderTextColor={G.faint}
            returnKeyType="search"
            style={styles.searchInput}
            accessibilityLabel="Search auctions"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color={G.faint} />
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={() => setSortOpen(true)} style={styles.filter} accessibilityRole="button" accessibilityLabel="Sort">
          <Ionicons name="filter-outline" size={18} color={G.ink} />
        </Pressable>
      </View>

      <View style={styles.chips}>
        {CATEGORY_CHIPS.map(c => (
          <Chip key={c.label} label={c.label} selected={category === c.slug} onPress={() => setCategory(c.slug)} />
        ))}
      </View>

      {recent.length && !query ? (
        <View style={styles.recent}>
          <SectionLabel>Recent searches</SectionLabel>
          <View style={styles.recentChips}>
            {recent.map(r => (
              <Chip key={r} label={r} onPress={() => setQuery(r)} />
            ))}
          </View>
        </View>
      ) : null}

      <Text style={styles.count}>
        {loading ? 'Searching…' : `${total} auction${total === 1 ? '' : 's'}`}
        {sort !== 'ending_soon' ? ` · ${SORTS.find(s => s.key === sort)?.label}` : ''}
      </Text>
    </View>
  );

  return (
    <GlassScreen>
      <GlassHeader title="Explore" />
      <FlatList
        data={loading ? [] : results}
        keyExtractor={a => a.id}
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.content}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => remember(query)}
        renderItem={({ item }) => (
          <AuctionTile
            title={item.gadget?.title ?? 'Gadget'}
            image={item.gadget?.images?.[0]}
            subtitle={item.gadget?.condition ? CONDITION_LABEL[item.gadget.condition] : null}
            price={item.current_price}
            end={item.end_time}
            now={now}
            onPress={() => {
              remember(query);
              navigation.navigate('AuctionDetail', { auctionId: item.id });
            }}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={G.blue} style={styles.loader} />
          ) : (
            <GlassCard style={styles.empty}>
              <Image source={require('../../../assets/icons/bell.png')} style={styles.emptyIcon} />
              <Text style={styles.emptyTitle}>Can't find it?</Text>
              <Text style={styles.emptyText}>
                {query || category
                  ? "Nothing live matches right now. We'll tell you the moment one is listed."
                  : 'No live auctions right now.'}
              </Text>
              {query || category ? (
                <PrimaryButton
                  label={alertSaved ? 'Alert saved' : 'Get an alert when it’s listed'}
                  onPress={saveAlert}
                  disabled={alertSaved}
                  style={styles.emptyButton}
                />
              ) : null}
            </GlassCard>
          )
        }
      />

      <BottomSheet visible={sortOpen} onClose={() => setSortOpen(false)}>
        <Text style={styles.sheetTitle}>Sort by</Text>
        {SORTS.map(s => (
          <Pressable
            key={s.key}
            onPress={() => {
              setSort(s.key);
              setSortOpen(false);
            }}
            style={styles.sheetRow}
            accessibilityRole="radio"
            accessibilityState={{ selected: sort === s.key }}
          >
            <Text style={styles.sheetText}>{s.label}</Text>
            {sort === s.key ? <Ionicons name="checkmark" size={18} color={G.blue} /> : null}
          </Pressable>
        ))}
      </BottomSheet>
    </GlassScreen>
  );
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 120 },
  column: { gap: 10, marginBottom: 10 },
  searchRow: { flexDirection: 'row', gap: 8 },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, color: G.ink, fontSize: 14, fontFamily: fonts.regular },
  filter: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 16 },
  recent: { marginBottom: 12 },
  recentChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  count: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginBottom: 10 },
  loader: { marginTop: 40 },
  empty: { alignItems: 'center', padding: 20, gap: 6 },
  emptyIcon: { width: 44, height: 44, resizeMode: 'contain' },
  emptyTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium, marginTop: 4 },
  emptyText: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, textAlign: 'center', lineHeight: 19 },
  emptyButton: { alignSelf: 'stretch', marginTop: 10 },
  sheetTitle: { color: G.ink, fontSize: 17, fontFamily: fonts.medium, marginBottom: 8 },
  sheetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48 },
  sheetText: { color: G.ink, fontSize: 15, fontFamily: fonts.regular },
});
