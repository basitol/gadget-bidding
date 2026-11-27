import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  Chip,
  GadgetImage,
  SecondaryButton,
  timeLeft,
  isUrgent,
  useNow,
} from '../../components/glass';
import { Bone, SkeletonGroup } from '../../components/glass/Skeleton';
import { BottomSheet } from '../../components/motion';
import { fonts } from '../../constants';
import { auctionService, meService } from '../../services';
import { useToastStore } from '../../store/toastStore';
import { Auction } from '../../types';
import { formatCurrency } from '../../utils';
import { CATEGORY_CHIPS } from './categories';

const toast = (msg: string, type: 'success' | 'error' = 'success') => useToastStore.getState().show(msg, type);

/** Shorter grade for the tile badge. */
const GRADE: Record<string, string> = {
  new: 'New',
  like_new: 'Like new',
  excellent: 'Grade A',
  good: 'Grade B',
  fair: 'Grade C',
  for_parts: 'For parts',
};

/** Product-line names people search for, per category ("iPhone" rather than "Apple"). */
const BRAND_LABEL: Record<string, Record<string, string>> = {
  smartphones: { apple: 'iPhone', google: 'Google Pixel' },
  laptops: { apple: 'MacBook' },
  tablets: { apple: 'iPad' },
  smartwatches: { apple: 'Apple Watch' },
};
const brandLabel = (slug: string, brand: string) => BRAND_LABEL[slug]?.[brand.toLowerCase()] ?? brand;

const SORTS = [
  { key: 'ending_soon', label: 'Ending soon' },
  { key: 'bid_count', label: 'Most bids' },
  { key: 'price_asc', label: 'Lowest price' },
  { key: 'price_desc', label: 'Highest price' },
  { key: 'newest', label: 'Newest' },
] as const;
type SortKey = (typeof SORTS)[number]['key'];

const labelFor = (slug: string, name?: string) => CATEGORY_CHIPS.find(c => c.slug === slug)?.label ?? name ?? 'Category';

/* ================= Category ================= */

/**
 * One category's live auctions: brand chips, sort, "Grade A only", and a two-column grid.
 * Params: { slug, label } (older links pass { category, label }).
 */
export const CategoryBrowseScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const slug: string = route.params?.slug ?? route.params?.category;
  const label: string = route.params?.label ?? labelFor(slug);
  const now = useNow(1000);
  const [brands, setBrands] = useState<{ brand: string; count: number }[]>([]);
  const [brand, setBrand] = useState<string | null>(null);
  const [gradeA, setGradeA] = useState(false);
  const [sort, setSort] = useState<SortKey>('ending_soon');
  const [sortSheet, setSortSheet] = useState(false);
  const [rows, setRows] = useState<Auction[] | null>(null);
  const [total, setTotal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadFacets = useCallback(
    () =>
      auctionService
        .liveFacets(slug)
        .then(f => setBrands(f.category?.brands ?? []))
        .catch(() => {}),
    [slug]
  );

  const load = useCallback(async () => {
    try {
      const res = await auctionService.getAuctions(
        { category: slug, status: 'active', brand: brand ?? undefined, condition: gradeA ? 'excellent' : undefined, sort_by: sort },
        1,
        50
      );
      setRows(res.data ?? []);
      setTotal((res as any).pagination?.total ?? res.data?.length ?? 0);
    } catch (e) {
      setRows(r => r ?? []);
      toast(e instanceof Error && e.message ? e.message : "We couldn't load these auctions. Pull down to try again.", 'error');
    }
  }, [slug, brand, gradeA, sort]);

  useEffect(() => {
    loadFacets();
  }, [loadFacets]);
  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), loadFacets()]);
    setRefreshing(false);
  };

  // Drop anything whose clock has run out while the list was open.
  const live = useMemo(() => (rows ?? []).filter(a => new Date(a.end_time).getTime() > now), [rows, now]);
  const sortLabel = SORTS.find(s => s.key === sort)?.label ?? 'Sort';
  const filtered = !!brand || gradeA;

  const alert = async () => {
    setSaving(true);
    try {
      await meService.saveSearch({
        category_slug: slug,
        query: brand ? brandLabel(slug, brand) : undefined,
        condition: gradeA ? 'a_or_better' : undefined,
      });
      toast("Saved. We'll tell you when one's listed.");
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : "We couldn't save that alert. Try again.", 'error');
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label={`All ${label.toLowerCase()}`} selected={!brand} onPress={() => setBrand(null)} />
        {brands.map(b => (
          <Chip key={b.brand} label={brandLabel(slug, b.brand)} selected={brand === b.brand} onPress={() => setBrand(b.brand)} />
        ))}
      </ScrollView>
      <View style={styles.bar}>
        <Text style={styles.count}>
          {rows === null ? ' ' : `${total} live auction${total === 1 ? '' : 's'}`}
        </Text>
        <View style={styles.barActions}>
          <Pressable
            onPress={() => setSortSheet(true)}
            style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Sort: ${sortLabel}`}
          >
            <Ionicons name="swap-vertical" size={14} color={G.ink} />
            <Text style={styles.pillText}>{sortLabel}</Text>
          </Pressable>
          <Pressable
            onPress={() => setGradeA(v => !v)}
            style={({ pressed }) => [styles.pill, gradeA && styles.pillOn, pressed && styles.pressed]}
            accessibilityRole="switch"
            accessibilityState={{ checked: gradeA }}
            accessibilityLabel="Grade A only"
          >
            <Text style={[styles.pillText, gradeA && styles.pillTextOn]}>Grade A only</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <GlassScreen>
      <GlassHeader title={label} onBack={() => navigation.goBack()} />
      <FlatList
        data={rows === null ? [] : live}
        keyExtractor={a => a.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={G.blue} />}
        renderItem={({ item }) => {
          const condition = (item as any).gadget?.condition as string | undefined;
          const bids = (item as any).total_bids ?? item.bid_count ?? 0;
          return (
            <Pressable
              onPress={() => navigation.navigate('AuctionDetail', { auctionId: item.id })}
              style={({ pressed }) => [styles.tileWrap, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`${item.gadget?.title}, ${formatCurrency(item.current_price)}, ${timeLeft(item.end_time, now)} left, ${bids} bids`}
            >
              <GlassCard style={styles.tile}>
                <View style={styles.tileImg}>
                  <GadgetImage uri={item.gadget?.images?.[0]} size={100} />
                  {condition && GRADE[condition] ? (
                    <View style={styles.grade}>
                      <Text style={styles.gradeText}>{GRADE[condition]}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.tileTitle} numberOfLines={2}>
                  {item.gadget?.title}
                </Text>
                <View style={styles.tileFoot}>
                  <Text style={styles.tilePrice}>{formatCurrency(item.current_price)}</Text>
                  <Text style={[styles.tileTime, isUrgent(item.end_time, now) && styles.tileUrgent]}>
                    {timeLeft(item.end_time, now)}
                  </Text>
                </View>
                <Text style={styles.tileBids}>
                  {bids} bid{bids === 1 ? '' : 's'}
                </Text>
              </GlassCard>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          rows === null ? (
            <SkeletonGroup style={styles.skeleton}>
              {[0, 1].map(r => (
                <View key={r} style={styles.gridRow}>
                  <Bone h={230} r={18} style={styles.flex} />
                  <Bone h={230} r={18} style={styles.flex} />
                </View>
              ))}
            </SkeletonGroup>
          ) : (
            <GlassCard style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {filtered ? 'Nothing matches right now' : `No live ${label.toLowerCase()} right now`}
              </Text>
              <Text style={styles.emptyText}>
                New auctions go live every day. Save an alert and we'll tell you when one's listed.
              </Text>
              <SecondaryButton
                label={saving ? 'Saving…' : "Tell me when one's listed"}
                onPress={alert}
                disabled={saving}
                style={styles.emptyBtn}
              />
            </GlassCard>
          )
        }
      />

      <BottomSheet visible={sortSheet} onClose={() => setSortSheet(false)}>
        <Text style={styles.sheetTitle}>Sort by</Text>
        {SORTS.map(s => (
          <Pressable
            key={s.key}
            onPress={() => {
              setSort(s.key);
              setSortSheet(false);
            }}
            style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityState={{ selected: s.key === sort }}
          >
            <Text style={[styles.sheetRowText, s.key === sort && styles.sheetRowOn]}>{s.label}</Text>
            {s.key === sort ? <Ionicons name="checkmark" size={18} color={G.blue} /> : null}
          </Pressable>
        ))}
      </BottomSheet>
    </GlassScreen>
  );
};

/* ================= Browse by category (sheet on Home) ================= */

/** Every category with how many auctions are live in it right now. */
export const CategoriesSheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  onPick: (slug: string, label: string) => void;
}> = ({ visible, onClose, onPick }) => {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [extra, setExtra] = useState<{ slug: string; name: string }[]>([]);

  useEffect(() => {
    if (!visible) return;
    auctionService
      .liveFacets()
      .then(f => {
        setCounts(Object.fromEntries(f.categories.map(c => [c.slug, c.count])));
        setExtra(f.categories.filter(c => !CATEGORY_CHIPS.some(x => x.slug === c.slug)));
      })
      .catch(() => setCounts({}));
  }, [visible]);

  const list = [
    ...CATEGORY_CHIPS.filter(c => c.slug).map(c => ({ slug: c.slug as string, label: c.label })),
    ...extra.map(c => ({ slug: c.slug, label: c.name })),
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.sheetTitle}>Browse by category</Text>
      <Text style={styles.sheetSub}>Inspected at our hub before it reaches you.</Text>
      {list.map(c => {
        const n = counts?.[c.slug] ?? 0;
        return (
          <Pressable
            key={c.slug}
            onPress={() => onPick(c.slug, c.label)}
            style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`${c.label}, ${n} live`}
          >
            <Text style={styles.sheetRowText}>{c.label}</Text>
            <View style={styles.sheetRight}>
              <Text style={styles.sheetCount}>{counts === null ? ' ' : n ? `${n} live` : 'None live'}</Text>
              <Ionicons name="chevron-forward" size={16} color={G.faint} />
            </View>
          </Pressable>
        );
      })}
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  chips: { gap: 8, paddingBottom: 14 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 8 },
  count: { color: G.muted, fontSize: 14, fontFamily: fonts.regular },
  barActions: { flexDirection: 'row', gap: 8 },
  pill: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pillOn: { backgroundColor: G.ink },
  pillText: { color: G.ink, fontSize: 13, fontFamily: fonts.medium },
  pillTextOn: { color: '#FFFFFF' },

  gridRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  tileWrap: { flex: 1, maxWidth: '50%' },
  tile: { padding: 10, flex: 1 },
  tileImg: {
    height: 120,
    borderRadius: 14,
    backgroundColor: 'rgba(241,245,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    overflow: 'hidden',
  },
  grade: {
    position: 'absolute',
    top: 8,
    left: 8,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
  },
  gradeText: { color: G.ink, fontSize: 11, fontFamily: fonts.medium },
  tileTitle: { color: G.ink, fontSize: 14, lineHeight: 19, fontFamily: fonts.medium },
  tileFoot: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 6, gap: 6 },
  tilePrice: { color: G.ink, fontSize: 16, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  tileTime: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  tileUrgent: { color: G.orangeInk },
  tileBids: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, marginTop: 4 },

  skeleton: { gap: 0 },
  empty: { padding: 20, alignItems: 'center', gap: 6 },
  emptyTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium, textAlign: 'center' },
  emptyText: { color: G.muted, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular, textAlign: 'center' },
  emptyBtn: { marginTop: 10, alignSelf: 'stretch' },

  sheetTitle: { color: G.ink, fontSize: 19, fontFamily: fonts.medium, marginBottom: 4 },
  sheetSub: { color: G.muted, fontSize: 14, fontFamily: fonts.regular, marginBottom: 6 },
  sheetRow: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: G.line,
  },
  sheetRowText: { color: G.ink, fontSize: 16, fontFamily: fonts.regular },
  sheetRowOn: { color: G.blue600, fontFamily: fonts.medium },
  sheetRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sheetCount: { color: G.muted, fontSize: 13, fontFamily: fonts.regular },
});
