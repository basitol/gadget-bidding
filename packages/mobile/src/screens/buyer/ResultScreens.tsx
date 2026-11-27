import React, { useCallback, useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  SectionLabel,
  PrimaryButton,
  SecondaryButton,
  FooterBar,
  CheckList,
  GadgetImage,
  timeLeft,
  isUrgent,
  useNow,
} from '../../components/glass';
import { Bone, SkeletonGroup } from '../../components/glass/Skeleton';
import { fonts } from '../../constants';
import { meService } from '../../services';
import { useToastStore } from '../../store/toastStore';
import { formatCurrency } from '../../utils';

export type AuctionResult = {
  auction_id: string;
  /** The seller put it up again: the new run's id. */
  relisted_auction_id: string | null;
  outcome: 'won' | 'lost' | 'sold' | 'no_sale' | 'cancelled' | 'live';
  reason: 'reserve' | 'no_bids' | null;
  title: string;
  image: string | null;
  sold_for: number | null;
  highest_bid: number | null;
  my_top_bid: number | null;
  bid_count: number;
  bidder_count: number;
  ended_at: string | null;
  next_in_line: boolean;
  watched: boolean;
  had_auto_bid: boolean;
  order_id: string | null;
  alert: { query: string; category_slug: string | null };
  similar: { id: string; title: string; image: string | null; current_price: number; end_time: string }[];
};

const toast = (msg: string, type: 'success' | 'error' = 'success') => useToastStore.getState().show(msg, type);

/** "Nov 24, 9:00 pm" (with the year when it isn't this year). */
const endedLabel = (iso: string) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  return `${date}, ${time}`;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** How an auction ended for this buyer: lost, ended without a sale, or cancelled. */
export const AuctionResultScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { auctionId } = route.params;
  const now = useNow(30_000);
  const [r, setR] = useState<AuctionResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let gone = false;
      meService
        .auctionResult(auctionId)
        .then(res => {
          if (gone) return;
          // Not an "ended" story: winners go to pay, live auctions go back to bidding.
          if (res.outcome === 'won' && res.order_id) navigation.replace('YouWon', { orderId: res.order_id });
          else if (res.outcome === 'live') navigation.replace('AuctionDetail', { auctionId });
          else setR(res);
        })
        .catch(() => !gone && setFailed(true));
      return () => {
        gone = true;
      };
    }, [auctionId, navigation])
  );

  const saveAlert = async () => {
    if (!r || saving || saved) return;
    setSaving(true);
    try {
      await meService.saveSearch({ query: r.alert.query, category_slug: r.alert.category_slug ?? undefined });
      setSaved(true);
      toast(`We'll tell you when a ${r.alert.query} is listed.`);
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : "We couldn't save that alert. Try again.", 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!r) {
    return (
      <GlassScreen>
        <GlassHeader title="Auction ended" onBack={() => navigation.goBack()} />
        {failed ? (
          <View style={styles.content}>
            <Text style={styles.heroSub}>We couldn't load this auction. Check your connection and try again.</Text>
          </View>
        ) : (
          <SkeletonGroup style={styles.content}>
            <View style={styles.hero}>
              <Bone w={84} h={84} r={24} />
              <Bone w="70%" h={24} r={10} style={styles.mt14} />
              <Bone w="85%" h={14} r={7} style={styles.mt10} />
            </View>
            <Bone h={190} r={20} />
            <Bone h={64} r={16} style={styles.mt14} />
          </SkeletonGroup>
        )}
      </GlassScreen>
    );
  }

  const noSale = r.outcome === 'no_sale';
  const lost = r.outcome === 'lost';
  const alertLabel = saved ? 'Alert saved' : saving ? 'Saving…' : undefined;

  let title: string;
  let sub: string;
  if (lost) {
    title = "You didn't win this one";
    sub = `The ${r.title} sold for ${formatCurrency(r.sold_for ?? 0)}. Your top bid was ${formatCurrency(r.my_top_bid ?? 0)}.`;
  } else if (r.outcome === 'sold') {
    title = 'This one sold';
    sub = `The ${r.title} sold for ${formatCurrency(r.sold_for ?? 0)}.`;
  } else if (noSale) {
    title = 'This auction ended without a sale';
    sub =
      r.reason === 'reserve'
        ? "Bids didn't reach the seller's reserve price, so nobody won. Nothing was charged."
        : 'Nobody bid on it before it ended, so nothing was sold.';
  } else {
    title = 'This auction was cancelled';
    sub = 'It was stopped before it ended. Nothing was charged.';
  }

  const relistLine = `The seller may relist it — we'll tell you if they do${
    r.watched ? ', because you watched it' : r.my_top_bid != null ? ', because you bid on it' : ''
  }`;

  return (
    <GlassScreen>
      <GlassHeader title="Auction ended" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={[styles.heroIcon, noSale && styles.heroIconWarm]}>
            <Image
              source={noSale ? require('../../../assets/icons/bell.png') : require('../../../assets/icons/gavel.png')}
              style={styles.heroImg}
            />
          </View>
          <Text style={styles.heroTitle} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.heroSub}>{sub}</Text>
        </View>

        {r.relisted_auction_id ? (
          <GlassCard style={styles.back}>
            <View style={styles.flex}>
              <Text style={styles.backTitle}>It's back up for auction</Text>
              <Text style={styles.backSub}>The seller relisted it. Bidding is open now.</Text>
            </View>
            <PrimaryButton
              label="View"
              compact
              onPress={() => navigation.push('AuctionDetail', { auctionId: r.relisted_auction_id })}
            />
          </GlassCard>
        ) : null}

        {lost || r.outcome === 'sold' ? (
          <GlassCard style={styles.summary}>
            <Row label="Sold for" value={formatCurrency(r.sold_for ?? 0)} />
            {lost ? <Row label="Your top bid" value={formatCurrency(r.my_top_bid ?? 0)} /> : null}
            <Row label="Bids" value={`${r.bid_count} from ${plural(r.bidder_count, 'person', 'people')}`} />
            {r.ended_at ? <Row label="Ended" value={endedLabel(r.ended_at)} last /> : null}
          </GlassCard>
        ) : null}

        {lost ? (
          <View style={styles.note}>
            <Text style={styles.noteText}>
              {r.next_in_line
                ? "Nothing was charged. If the winner doesn't pay within 24 hours, we may offer it to you at your bid."
                : 'Nothing was charged. Your bid hold is back in your wallet.'}
            </Text>
          </View>
        ) : null}

        {noSale || r.outcome === 'cancelled' ? (
          <GlassCard style={styles.item}>
            <GadgetImage uri={r.image ?? undefined} size={56} style={styles.itemImg} />
            <View style={styles.flex}>
              <Text style={styles.itemTitle} numberOfLines={2}>
                {r.title}
              </Text>
              {r.highest_bid != null ? <Text style={styles.itemSub}>Highest bid {formatCurrency(r.highest_bid)}</Text> : null}
              <Text style={styles.itemMeta}>
                {noSale ? (r.reason === 'reserve' ? 'Reserve not met' : 'No bids') : 'Cancelled'}
              </Text>
            </View>
          </GlassCard>
        ) : null}

        {noSale ? (
          <GlassCard style={styles.next}>
            <Text style={styles.nextTitle}>What happens now</Text>
            <CheckList
              items={[
                relistLine,
                ...(r.had_auto_bid ? ['Your auto-bid limit is released'] : []),
                `You can save a search to get alerts for similar ${r.alert.query}`,
              ]}
            />
          </GlassCard>
        ) : null}

        {r.similar.length ? (
          <>
            <View style={styles.section}>
              <SectionLabel>{lost || r.outcome === 'sold' ? 'Similar auctions ending soon' : 'You might like'}</SectionLabel>
            </View>
            <View style={styles.grid}>
              {r.similar.map(s => (
                <Pressable
                  key={s.id}
                  onPress={() => navigation.push('AuctionDetail', { auctionId: s.id })}
                  style={({ pressed }) => [styles.tileWrap, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`${s.title}, ${formatCurrency(s.current_price)}, ${timeLeft(s.end_time, now)} left`}
                >
                  <GlassCard style={styles.tile}>
                    <View style={styles.tileImg}>
                      <GadgetImage uri={s.image ?? undefined} size={96} />
                    </View>
                    <Text style={styles.tileTitle} numberOfLines={1}>
                      {s.title}
                    </Text>
                    <View style={styles.tileFoot}>
                      <Text style={styles.tilePrice}>{formatCurrency(s.current_price)}</Text>
                      <Text style={[styles.tileTime, isUrgent(s.end_time, now) && styles.tileUrgent]}>
                        {timeLeft(s.end_time, now)}
                      </Text>
                    </View>
                  </GlassCard>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {!noSale ? (
          <SecondaryButton
            label={alertLabel ?? 'Alert me when another is listed'}
            onPress={saveAlert}
            disabled={saving || saved}
            style={styles.alertBtn}
          />
        ) : null}
      </ScrollView>
      {noSale ? (
        <FooterBar>
          <PrimaryButton label={alertLabel ?? 'Save this search'} onPress={saveAlert} disabled={saving || saved} />
        </FooterBar>
      ) : null}
    </GlassScreen>
  );
};

const Row: React.FC<{ label: string; value: string; last?: boolean }> = ({ label, value, last }) => (
  <View style={[styles.row, !last && styles.rowRule]}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  mt10: { marginTop: 10 },
  mt14: { marginTop: 14 },

  hero: { alignItems: 'center', marginTop: 8, marginBottom: 20 },
  heroIcon: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  heroIconWarm: { backgroundColor: '#FFF1E2' },
  heroImg: { width: 56, height: 56, resizeMode: 'contain' },
  heroTitle: { color: G.ink, fontSize: 22, lineHeight: 28, fontFamily: fonts.medium, textAlign: 'center' },
  heroSub: { color: G.muted, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, textAlign: 'center', marginTop: 8 },

  summary: { paddingHorizontal: 16 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 12 },
  backTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  backSub: { color: G.slate, fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, gap: 12 },
  rowRule: { borderBottomWidth: 1, borderBottomColor: G.line },
  rowLabel: { color: G.slate, fontSize: 14, fontFamily: fonts.regular },
  rowValue: { color: G.ink, fontSize: 15, fontFamily: fonts.medium, fontVariant: ['tabular-nums'], flexShrink: 1, textAlign: 'right' },

  note: { marginTop: 12, padding: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.55)' },
  noteText: { color: G.ink, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular },

  item: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  itemImg: { width: 56, height: 56, borderRadius: 12 },
  itemTitle: { color: G.ink, fontSize: 16, fontFamily: fonts.medium },
  itemSub: { color: G.slate, fontSize: 13, fontFamily: fonts.regular, marginTop: 3 },
  itemMeta: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },

  next: { padding: 16, marginTop: 12 },
  nextTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium, marginBottom: 8 },

  section: { marginTop: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  tileWrap: { width: '48.3%' },
  tile: { padding: 10 },
  tileImg: {
    height: 112,
    borderRadius: 14,
    backgroundColor: 'rgba(241,245,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    overflow: 'hidden',
  },
  tileTitle: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  tileFoot: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 },
  tilePrice: { color: G.ink, fontSize: 15, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  tileTime: { color: G.muted, fontSize: 12, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  tileUrgent: { color: G.orangeInk },

  alertBtn: { marginTop: 20 },
});
