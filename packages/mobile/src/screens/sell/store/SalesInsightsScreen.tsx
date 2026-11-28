import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { G, GlassScreen, GlassHeader, GlassCard } from '../../../components/glass';
import { fonts } from '../../../constants';
import { formatCurrency } from '../../../utils';
import { sellerInsightsService, InsightPeriod, SalesInsightsData } from '../../../services/sellerInsights.service';
import { TINT } from '../onboarding/kit';
import { LoadingScreen, Overline, toast, errText, s as shared } from './shared';

const PERIODS: { key: InsightPeriod; label: string }[] = [
  { key: '30d', label: '30 days' },
  { key: '6m', label: '6 months' },
  { key: '1y', label: '1 year' },
];

const count = (n: number) => n.toLocaleString('en-NG');
/** ₦26.4M from a million up, else ₦617,500. */
const shortMoney = (n: number) =>
  n >= 1_000_000 ? `₦${(n / 1_000_000).toFixed(n >= 100_000_000 ? 0 : 1).replace(/\.0$/, '')}M` : formatCurrency(Math.round(n));
/** Averages read better to the nearest thousand: ₦712,000. */
const roundMoney = (n: number) => formatCurrency(n >= 10_000 ? Math.round(n / 1000) * 1000 : Math.round(n));
const oneDecimal = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

type Delta = { text: string; tone: 'up' | 'down' | 'flat' } | null;
const pctDelta = (pct: number | null, suffix = ''): Delta =>
  pct === null ? null : pct === 0 ? { text: 'Same as before', tone: 'flat' } : { text: `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct)}%${suffix}`, tone: pct > 0 ? 'up' : 'down' };

const Tile: React.FC<{ label: string; value: string; delta?: Delta; caption?: string }> = ({ label, value, delta, caption }) => (
  <GlassCard style={styles.tile}>
    <Text style={styles.tileLabel}>{label}</Text>
    <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
      {value}
    </Text>
    {delta ? (
      <Text style={[styles.tileCaption, delta.tone === 'up' ? styles.up : delta.tone === 'down' ? styles.down : null]}>{delta.text}</Text>
    ) : caption ? (
      <Text style={styles.tileCaption}>{caption}</Text>
    ) : null}
  </GlassCard>
);

/** Earnings after fees, one bar per week-ish (30 days) or month; the latest bar in blue. Plain views. */
const EarningsChart: React.FC<{ bars: SalesInsightsData['chart'] }> = ({ bars }) => {
  const max = Math.max(0, ...bars.map(b => b.amount));
  const millions = max >= 1_000_000;
  const unit = millions ? 1_000_000 : 1_000;
  const value = (n: number) => {
    if (!n) return '0';
    const v = n / unit;
    return millions ? (v >= 10 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '')) : String(Math.round(v));
  };
  const dense = bars.length > 6;
  const summary = bars.map(b => `${b.label} ${formatCurrency(b.amount)}`).join(', ');
  return (
    <GlassCard style={styles.chartCard}>
      <View style={styles.chartHead}>
        <Text style={styles.chartTitle}>Earnings after fees</Text>
        <Text style={styles.chartUnit}>{millions ? '₦ millions' : '₦ thousands'}</Text>
      </View>
      <View style={[styles.bars, dense && styles.barsDense]} accessible accessibilityLabel={`Earnings after fees. ${summary}`}>
        {bars.map((b, i) => {
          const last = i === bars.length - 1;
          const h = max ? Math.max(4, Math.round((b.amount / max) * BAR_MAX)) : 4;
          return (
            <View key={b.from} style={styles.barCol}>
              <Text style={[styles.barValue, dense && styles.small]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {value(b.amount)}
              </Text>
              <View style={[styles.bar, { height: h }, last ? styles.barNow : styles.barBefore]} />
              <Text style={[styles.barLabel, dense && styles.small]} numberOfLines={1}>
                {b.label}
              </Text>
            </View>
          );
        })}
      </View>
    </GlassCard>
  );
};

/**
 * Store › Sales insights: what you earned, sold and how many people looked, against the same length
 * of time before; earnings by week or month; what sells best; and a tip when your own auctions show one.
 */
export const SalesInsightsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [period, setPeriod] = useState<InsightPeriod>('6m');
  const [byPeriod, setByPeriod] = useState<Partial<Record<InsightPeriod, SalesInsightsData>>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [loading, setLoading] = useState<InsightPeriod | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const latest = useRef(period);

  const load = useCallback(async (p: InsightPeriod) => {
    setFailed(null);
    setLoading(p);
    try {
      const data = await sellerInsightsService.get(p);
      setByPeriod(prev => ({ ...prev, [p]: data }));
    } catch (e) {
      const msg = errText(e, "Couldn't load your insights");
      setFailed(msg);
      if (latest.current === p) toast(msg);
    } finally {
      setLoading(l => (l === p ? null : l));
    }
  }, []);

  useEffect(() => {
    latest.current = period;
    if (!byPeriod[period]) load(period);
  }, [period, byPeriod, load]);

  const data = byPeriod[period] ?? Object.values(byPeriod)[0];
  if (!data) {
    return (
      <LoadingScreen title="Sales insights" onBack={() => navigation.goBack()} failed={failed} onRetry={() => load(period)} />
    );
  }
  const stale = data.period !== period;

  return (
    <GlassScreen>
      <GlassHeader title="Sales insights" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={shared.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={G.blue}
            onRefresh={async () => {
              setRefreshing(true);
              await load(period);
              setRefreshing(false);
            }}
          />
        }
      >
        <View style={styles.tabs} accessibilityRole="tablist">
          {PERIODS.map(t => {
            const on = t.key === period;
            return (
              <Pressable
                key={t.key}
                onPress={() => setPeriod(t.key)}
                style={({ pressed }) => [styles.tab, on && styles.tabOn, pressed && !on && shared.pressed]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {stale && loading ? <ActivityIndicator color={G.blue} style={styles.loader} /> : null}
        <View style={stale ? styles.stale : undefined}>
          <View style={styles.grid}>
            <Tile
              label="Earned"
              value={shortMoney(data.earned.amount)}
              delta={pctDelta(data.earned.change_pct, ' vs before')}
              caption={data.earned.amount ? 'Nothing to compare yet' : 'Nothing earned in this time'}
            />
            <Tile
              label="Items sold"
              value={`${count(data.items_sold.count)} sold`}
              delta={
                data.items_sold.change > 0
                  ? { text: `↑ ${data.items_sold.change}`, tone: 'up' }
                  : data.items_sold.change < 0
                    ? { text: `↓ ${Math.abs(data.items_sold.change)}`, tone: 'down' }
                    : data.items_sold.count
                      ? { text: 'Same as before', tone: 'flat' }
                      : null
              }
            />
          </View>
          <View style={styles.grid}>
            <Tile
              label="Sell-through"
              value={data.sell_through.pct === null ? '–' : `${data.sell_through.pct}%`}
              caption={data.sell_through.pct === null ? 'No auctions ended' : 'Listings that sold'}
            />
            <Tile
              label="Listing views"
              value={count(data.views.count)}
              delta={pctDelta(data.views.change_pct)}
              caption={data.views.count ? 'Nothing to compare yet' : undefined}
            />
          </View>

          <EarningsChart bars={data.chart} />

          <Overline>What sells best</Overline>
          <GlassCard style={shared.group}>
            {data.best_sellers.length ? (
              data.best_sellers.map(b => (
                <View key={b.label} style={[styles.row, shared.divider]}>
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {b.label}
                  </Text>
                  <Text style={styles.rowValue}>{`${b.sold} sold · avg ${roundMoney(b.avg_price)}`}</Text>
                </View>
              ))
            ) : (
              <View style={[styles.row, shared.divider]}>
                <Text style={styles.rowLabel}>Nothing sold in this time yet</Text>
              </View>
            )}
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Avg. bids per sale</Text>
              <Text style={styles.rowValue}>{data.avg_bids_per_sale === null ? '–' : oneDecimal(data.avg_bids_per_sale)}</Text>
            </View>
          </GlassCard>

          {data.tip ? (
            <GlassCard style={styles.tip}>
              <Text style={styles.tipText}>
                <Text style={styles.tipLead}>Tip: </Text>
                {data.tip.text.charAt(0).toLowerCase() + data.tip.text.slice(1)}
              </Text>
            </GlassCard>
          ) : null}
        </View>
      </ScrollView>
    </GlassScreen>
  );
};

const BAR_MAX = 120;

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 16 },
  tab: { flex: 1, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: G.ink },
  tabText: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  tabTextOn: { color: '#FFFFFF' },
  stale: { opacity: 0.5 },
  loader: { marginBottom: 12 },
  grid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  tile: { flex: 1, padding: 16, minHeight: 112 },
  tileLabel: { color: G.slate, fontSize: 14, fontFamily: fonts.regular },
  tileValue: { color: G.ink, fontSize: 26, letterSpacing: -0.5, fontFamily: fonts.medium, fontVariant: ['tabular-nums'], marginTop: 6 },
  tileCaption: { color: G.muted, fontSize: 13, fontFamily: fonts.regular, marginTop: 4 },
  up: { color: G.green },
  down: { color: TINT.amber.text },
  chartCard: { padding: 16, marginTop: 4 },
  chartHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 },
  chartTitle: { color: G.ink, fontSize: 17, fontFamily: fonts.medium },
  chartUnit: { color: G.muted, fontSize: 13, fontFamily: fonts.regular },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  barsDense: { gap: 4 },
  barCol: { flex: 1, alignItems: 'center' },
  barValue: { color: G.slate, fontSize: 12, fontFamily: fonts.regular, fontVariant: ['tabular-nums'], marginBottom: 6 },
  bar: { alignSelf: 'stretch', borderRadius: 8 },
  barNow: { backgroundColor: G.blue },
  barBefore: { backgroundColor: 'rgba(79,123,255,0.3)' },
  barLabel: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, marginTop: 8 },
  small: { fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, minHeight: 56 },
  rowLabel: { flexShrink: 1, color: G.slate, fontSize: 15, fontFamily: fonts.regular },
  rowValue: { color: G.ink, fontSize: 15, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  tip: { padding: 16, marginTop: 16 },
  tipText: { color: G.slate, fontSize: 15, lineHeight: 22, fontFamily: fonts.regular },
  tipLead: { color: G.ink, fontFamily: fonts.medium },
});
