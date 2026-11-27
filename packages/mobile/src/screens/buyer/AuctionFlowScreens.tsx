import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  FlatList,
  StyleSheet,
  Switch,
  TextInput,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BID_PAYMENT_DEADLINE_HOURS } from '@gadget-bidding/shared';
import {
  G,
  GlassScreen,
  GlassHeader,
  GlassCard,
  SectionLabel,
  PrimaryButton,
  HeartButton,
  timeLeft,
  isUrgent,
  useNow,
  FooterBar,
} from '../../components/glass';
import { AuctionDetailSkeleton, FooterSkeleton } from '../../components/glass/Skeleton';
import { fonts } from '../../constants';
import { api, socketService } from '../../services';
import { meService } from '../../services/me.service';
import { useAuctionStore, useAuthStore } from '../../store';
import { useWatchStore } from '../../store/watchStore';
import { useToastStore } from '../../store/toastStore';
import { formatCurrency, mediaUrl } from '../../utils';
import { AuctionNotFound } from '../../components/states';

/* ---------------- Shared ---------------- */

const toast = (msg: string, type: 'success' | 'error' = 'error') =>
  useToastStore.getState().show(msg, type);

const GRADE: Record<string, { label: string; tone: 'green' | 'blue' }> = {
  new: { label: 'New · sealed', tone: 'green' },
  like_new: { label: 'Grade A · like new', tone: 'green' },
  excellent: { label: 'Grade A', tone: 'green' },
  good: { label: 'Grade B', tone: 'blue' },
  fair: { label: 'Grade C', tone: 'blue' },
  for_parts: { label: 'For parts', tone: 'blue' },
};
const shortGrade = (c?: string) =>
  (GRADE[c ?? '']?.label ?? '').split(' · ')[0];

type SellerSummary = {
  id?: string;
  code: string;
  verified_business: boolean;
  rating: number | null;
  rating_count: number;
  sales: number;
};

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const specsOf = (a: any): Record<string, any> => {
  const s = a?.gadget?.specifications;
  if (!s) return {};
  if (typeof s === 'string') {
    try {
      return JSON.parse(s);
    } catch {
      return {};
    }
  }
  return s;
};

const increment = (a: any) =>
  Math.max(
    1,
    Math.floor(Number(a?.bid_increment ?? a?.min_bid_increment) || 100)
  );
const minBid = (a: any) =>
  Math.floor(Number(a?.current_price) || 0) + increment(a);
const deliveryFee = (a: any) => Number(a?.delivery_fee ?? 0);

/** Loads the auction + bids, keeps them live over the socket, and reports when I'm outbid. */
const useLiveAuction = (auctionId: string, onOutbid?: () => void) => {
  const {
    currentAuction,
    currentBids,
    fetchAuction,
    fetchAuctionBids,
    subscribeToAuction,
    unsubscribeFromAuction,
  } = useAuctionStore();
  const onOutbidRef = useRef(onOutbid);
  onOutbidRef.current = onOutbid;
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setMissing(false);
    fetchAuction(auctionId).then(() => {
      // Ended and removed, taken down, or a bad link: show "We can't find that auction".
      const s = useAuctionStore.getState();
      if (s.currentAuction?.id !== auctionId && /not found|valid UUID/i.test(s.error ?? '')) setMissing(true);
    });
    fetchAuctionBids(auctionId);
    let cancelled = false;
    socketService
      .connect()
      .then(() => !cancelled && subscribeToAuction(auctionId));
    const off = socketService.on('outbid', (d: { auction_id: string }) => {
      if (d.auction_id === auctionId) {
        fetchAuctionBids(auctionId);
        onOutbidRef.current?.();
      }
    });
    return () => {
      cancelled = true;
      off();
      unsubscribeFromAuction(auctionId);
    };
  }, [
    auctionId,
    fetchAuction,
    fetchAuctionBids,
    subscribeToAuction,
    unsubscribeFromAuction,
  ]);

  const auction =
    currentAuction?.id === auctionId ? (currentAuction as any) : null;
  return { auction, bids: auction ? (currentBids as any[]) : [], missing };
};

const ProductMini: React.FC<{
  auction: any;
  seller?: SellerSummary | null;
  subtitle?: React.ReactNode;
}> = ({ auction, seller, subtitle }) => (
  <GlassCard style={styles.mini}>
    <View style={styles.miniImage}>
      {auction?.gadget?.images?.[0] ? (
        <Image
          source={{ uri: mediaUrl(auction.gadget.images[0]) }}
          style={styles.miniImg}
          resizeMode="contain"
        />
      ) : null}
    </View>
    <View style={styles.flex}>
      <Text style={styles.miniTitle} numberOfLines={1}>
        {auction?.gadget?.title}
      </Text>
      {subtitle ?? (
        <Text style={styles.miniSub} numberOfLines={1}>
          {[
            seller
              ? `${seller.verified_business ? 'Verified seller' : 'Seller'} ${seller.code}`
              : null,
            shortGrade(auction?.gadget?.condition),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      )}
    </View>
  </GlassCard>
);

const StatPair: React.FC<{
  left: [string, string];
  right: [string, string];
  urgent?: boolean;
}> = ({ left, right, urgent }) => (
  <View style={styles.pair}>
    <GlassCard style={styles.pairCard}>
      <Text style={styles.pairLabel}>{left[0]}</Text>
      <Text style={styles.pairValue}>{left[1]}</Text>
    </GlassCard>
    <GlassCard style={styles.pairCard}>
      <Text style={styles.pairLabel}>{right[0]}</Text>
      <Text style={[styles.pairValue, urgent && styles.urgent]}>
        {right[1]}
      </Text>
    </GlassCard>
  </View>
);

const BottomBar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={styles.bottom}>{children}</View>
);

/* ================= Auction ================= */

const WIDTH = Dimensions.get('window').width - 40;

export const AuctionScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const { auctionId } = route.params;
  const now = useNow();
  const watching = useWatchStore(s => s.ids.has(auctionId));
  const toggleWatch = useWatchStore(s => s.toggle);
  const [page, setPage] = useState(0);
  const [seller, setSeller] = useState<SellerSummary | null>(null);
  const focused = useRef(true);

  const me = useAuthStore(s => s.user?.id);
  const { auction, bids, missing } = useLiveAuction(auctionId, () => {
    if (focused.current) navigation.navigate('Outbid', { auctionId });
  });

  useEffect(() => {
    useWatchStore.getState().load();
    api
      .get(`/auctions/${auctionId}/seller`)
      .then(r => setSeller(r.data.data))
      .catch(() => {});
    const f = navigation.addListener('focus', () => (focused.current = true));
    const b = navigation.addListener('blur', () => (focused.current = false));
    return () => {
      f();
      b();
    };
  }, [auctionId, navigation]);

  if (!auction && missing) return <AuctionNotFound navigation={navigation} />;

  if (!auction) {
    return (
      <GlassScreen>
        <GlassHeader title="Loading" onBack={() => navigation.goBack()} />
        <ScrollView contentContainerStyle={styles.skeletonContent} scrollEnabled={false}>
          <AuctionDetailSkeleton />
        </ScrollView>
        <FooterBar>
          <FooterSkeleton />
        </FooterBar>
      </GlassScreen>
    );
  }

  const specs = specsOf(auction);
  const images: string[] = auction.gadget?.images ?? [];
  const live =
    auction.status === 'active' && new Date(auction.end_time).getTime() > now;
  const scheduled = auction.status === 'scheduled';
  const grade = GRADE[auction.gadget?.condition];
  const imeiClean =
    String(specs.imei_blacklist ?? '').toLowerCase() === 'clean';
  const details: [string, string][] = [
    ['Storage', specs.storage],
    ['Colour', specs.color],
    ['Battery health', specs.battery_health ? `${specs.battery_health}%` : ''],
    [
      'In the box',
      Array.isArray(specs.included)
        ? specs.included.join(', ')
        : specs.included,
    ],
    ['Known faults', specs.known_faults],
  ].filter((d): d is [string, string] => !!d[1]);

  return (
    <GlassScreen>
      <GlassHeader
        title="Auction"
        onBack={() => navigation.goBack()}
        right={
          <HeartButton
            on={watching}
            onPress={() => toggleWatch(auctionId)}
            size={40}
          />
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <GlassCard style={styles.gallery}>
          <FlatList
            data={images.length ? images : ['']}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(u, i) => `${u}-${i}`}
            onMomentumScrollEnd={e =>
              setPage(Math.round(e.nativeEvent.contentOffset.x / (WIDTH - 2)))
            }
            renderItem={({ item }) => (
              <View style={[styles.slide, { width: WIDTH - 2 }]}>
                {item ? (
                  <Image
                    source={{ uri: mediaUrl(item) }}
                    style={styles.slideImg}
                    resizeMode="contain"
                  />
                ) : null}
              </View>
            )}
          />
          {live ? (
            <View style={styles.liveChip}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          ) : null}
          {images.length > 1 ? (
            <View style={styles.dots}>
              {images.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dotSm, i === page && styles.dotOn]}
                />
              ))}
            </View>
          ) : null}
        </GlassCard>

        <Text style={styles.title} accessibilityRole="header">
          {auction.gadget?.title}
        </Text>
        <View style={styles.tags}>
          {grade ? <Tag tone={grade.tone} label={grade.label} /> : null}
          {specs.battery_health ? (
            <Tag tone="blue" label={`Battery ${specs.battery_health}%`} />
          ) : null}
          {imeiClean ? <Tag tone="purple" label="IMEI clean" /> : null}
        </View>

        <GlassCard style={styles.priceCard}>
          <View style={styles.flex}>
            <Text style={styles.pairLabel}>
              {scheduled
                ? 'Starting price'
                : `Current bid · ${auction.bid_count ?? auction.total_bids ?? 0} bids`}
            </Text>
            <Text style={styles.bigValue}>
              {formatCurrency(auction.current_price)}
            </Text>
          </View>
          <View style={styles.endsBox}>
            <Text style={styles.pairLabel}>
              {scheduled ? 'Starts in' : live ? 'Ends in' : 'Status'}
            </Text>
            <Text
              style={[
                styles.bigValue,
                live && isUrgent(auction.end_time, now) && styles.urgent,
              ]}
            >
              {scheduled
                ? timeLeft(auction.start_time, now)
                : live
                  ? timeLeft(auction.end_time, now)
                  : 'Ended'}
            </Text>
          </View>
        </GlassCard>

        {seller ? (
          <Pressable
            onPress={() => {
              const sellerId = seller.id ?? auction.seller_id;
              if (sellerId) navigation.navigate('Store', { sellerId });
            }}
            accessibilityRole="button"
            accessibilityLabel={`Open store ${seller.code}`}
          >
            <GlassCard style={styles.sellerCard}>
              <View style={styles.sellerIcon}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={18}
                  color={G.blue}
                />
              </View>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>
                  {seller.verified_business ? 'Verified seller' : 'Seller'}{' '}
                  {seller.code}
                </Text>
                <Text style={styles.rowSub}>
                  {[
                    seller.verified_business
                      ? 'Verified business'
                      : 'Computer Village seller',
                    seller.rating != null
                      ? `${seller.rating.toFixed(1)} rating`
                      : null,
                    `${seller.sales} sale${seller.sales === 1 ? '' : 's'}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={G.faint} />
            </GlassCard>
          </Pressable>
        ) : null}

        <Text style={styles.h2}>What we check</Text>
        {[
          'IMEI or serial checked against stolen lists',
          'Inspected at our Computer Village hub before delivery',
          'Your money is held until you confirm it arrived',
        ].map(t => (
          <View key={t} style={styles.check}>
            <Ionicons name="checkmark" size={16} color={G.green} />
            <Text style={styles.checkText}>{t}</Text>
          </View>
        ))}

        {details.length ? (
          <>
            <Text style={styles.h2}>Details</Text>
            <GlassCard style={styles.table}>
              {details.map(([k, v], i) => (
                <View
                  key={k}
                  style={[
                    styles.tRow,
                    i < details.length - 1 && styles.tDivider,
                  ]}
                >
                  <Text style={styles.tKey}>{k}</Text>
                  <Text style={styles.tVal}>{v}</Text>
                </View>
              ))}
            </GlassCard>
          </>
        ) : null}

        {auction.gadget?.description ? (
          <Text style={styles.description}>{auction.gadget.description}</Text>
        ) : null}

        <View style={styles.bidsHead}>
          <Text style={styles.h2}>Recent bids</Text>
          <Text style={styles.hint}>Names are hidden</Text>
        </View>
        <GlassCard style={styles.table}>
          {bids.length ? (
            bids.slice(0, 5).map((b: any, i: number, arr: any[]) => (
              <View
                key={b.id}
                style={[styles.tRow, i < arr.length - 1 && styles.tDivider]}
              >
                <Text
                  style={[
                    styles.tKey,
                    (b.is_mine || (me && b.bidder_id === me)) && styles.tMine,
                  ]}
                >
                  {b.is_mine || (me && b.bidder_id === me)
                    ? 'You'
                    : (b.bidder?.full_name ?? b.bidder_name ?? 'Bidder')}
                </Text>
                <Text style={styles.tVal}>
                  {formatCurrency(b.amount)} · {ago(b.bid_time ?? b.created_at)}
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.tRow}>
              <Text style={styles.tKey}>No bids yet. Be the first.</Text>
            </View>
          )}
        </GlassCard>

        {auction.seller_id !== me ? (
          <Pressable
            onPress={() => navigation.navigate('ReportListing', { auctionId })}
            style={styles.reportLink}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={styles.reportText}>
              Something wrong with this listing? <Text style={styles.reportStrong}>Report it</Text>
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <BottomBar>
        {live ? (
          <View style={styles.actions}>
            <Pressable
              onPress={() => navigation.navigate('AutoBid', { auctionId })}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryBtnText}>Auto-bid</Text>
            </Pressable>
            <PrimaryButton
              label="Place bid"
              onPress={() => navigation.navigate('PlaceBid', { auctionId })}
              style={styles.flex}
            />
          </View>
        ) : (
          scheduled ? (
            <PrimaryButton label="Not open for bids yet" onPress={() => {}} disabled />
          ) : (
            <PrimaryButton
              label="See how it ended"
              onPress={() => navigation.navigate('AuctionResult', { auctionId })}
            />
          )
        )}
      </BottomBar>
    </GlassScreen>
  );
};

const Tag: React.FC<{ label: string; tone: 'green' | 'blue' | 'purple' }> = ({
  label,
  tone,
}) => {
  const c = {
    green: ['#E7F6EC', G.green],
    blue: [G.blueTint, G.blue],
    purple: ['#F1ECFE', '#6D4AE0'],
  }[tone];
  return (
    <View style={[styles.tag, { backgroundColor: c[0] }]}>
      <Text style={[styles.tagText, { color: c[1] }]}>{label}</Text>
    </View>
  );
};

/* ================= Place a bid ================= */

export const PlaceBidScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const { auctionId, amount: preset } = route.params;
  const now = useNow();
  const { auction } = useLiveAuction(auctionId);
  const placeBid = useAuctionStore(s => s.placeBid);
  const [amount, setAmount] = useState<number | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seller, setSeller] = useState<SellerSummary | null>(null);

  useEffect(() => {
    api
      .get(`/auctions/${auctionId}/seller`)
      .then(r => setSeller(r.data.data))
      .catch(() => {});
  }, [auctionId]);

  const min = auction ? minBid(auction) : 0;
  const step = auction ? increment(auction) : 0;
  // Start at the minimum (or the amount a notification suggested); keep up if the price moves past it.
  useEffect(() => {
    if (!auction) return;
    setAmount(a => Math.max(min, a ?? preset ?? min));
  }, [auction, min, preset]);

  if (!auction || amount === null) {
    return (
      <GlassScreen>
        <GlassHeader title="Place a bid" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={G.blue} style={styles.loader} />
      </GlassScreen>
    );
  }

  const fee = deliveryFee(auction);
  const valid = amount >= min;

  const submit = async () => {
    setBusy(true);
    try {
      await placeBid(auctionId, amount);
      navigation.replace('BidPlaced', { auctionId, amount });
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : 'Your bid didn’t go through. Try again.';
      if (/bidding is paused/i.test(msg)) {
        navigation.navigate('AccountPaused');
        return;
      }
      toast(msg);
      if (/wallet/i.test(msg)) navigation.navigate('Wallet');
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassScreen>
      <GlassHeader title="Place a bid" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ProductMini auction={auction} seller={seller} />
        <StatPair
          left={['Current bid', formatCurrency(auction.current_price)]}
          right={['Ends in', timeLeft(auction.end_time, now)]}
          urgent={isUrgent(auction.end_time, now)}
        />

        <Text style={styles.label}>Your bid</Text>
        <View style={styles.stepper}>
          <Pressable
            onPress={() => setAmount(a => Math.max(min, (a ?? min) - step))}
            style={styles.stepBtn}
            accessibilityLabel="Lower bid"
          >
            <Ionicons name="remove" size={20} color={G.ink} />
          </Pressable>
          <View style={[styles.amountBox, !valid && styles.amountBad]}>
            <TextInput
              value={formatCurrency(amount)}
              onChangeText={t =>
                setAmount(Number(t.replace(/[^0-9]/g, '')) || 0)
              }
              keyboardType="number-pad"
              style={styles.amountText}
              accessibilityLabel="Bid amount"
            />
          </View>
          <Pressable
            onPress={() => setAmount(a => (a ?? min) + step)}
            style={styles.stepBtn}
            accessibilityLabel="Raise bid"
          >
            <Ionicons name="add" size={20} color={G.ink} />
          </Pressable>
        </View>
        <Text style={styles.helpCenter}>
          Minimum {formatCurrency(min)} · bids go up by {formatCurrency(step)}
        </Text>
        <View style={styles.quick}>
          {[5000, 10000, 25000].map(n => (
            <Pressable
              key={n}
              onPress={() => setAmount(a => (a ?? min) + n)}
              style={styles.quickBtn}
            >
              <Text style={styles.quickText}>+₦{n / 1000}k</Text>
            </Pressable>
          ))}
        </View>

        <GlassCard style={styles.summary}>
          <Row k="Your bid" v={formatCurrency(amount)} />
          <Row k="Delivery" v={fee ? formatCurrency(fee) : 'Free'} />
          <Row
            k="If you win, you pay"
            v={
              fee
                ? `${formatCurrency(amount)} + delivery`
                : formatCurrency(amount)
            }
            strong
          />
        </GlassCard>

        <Pressable
          onPress={() => setAgreed(a => !a)}
          style={styles.agree}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}
        >
          <View style={[styles.box, agreed && styles.boxOn]}>
            {agreed ? (
              <Ionicons name="checkmark" size={14} color="#FFF" />
            ) : null}
          </View>
          <Text style={styles.agreeText}>
            I understand a bid is a promise to buy. If I win, I'll pay within{' '}
            {BID_PAYMENT_DEADLINE_HOURS} hours.
          </Text>
        </Pressable>
      </ScrollView>
      <BottomBar>
        <PrimaryButton
          label={busy ? 'Placing bid…' : `Bid ${formatCurrency(amount)}`}
          onPress={submit}
          disabled={!agreed || !valid || busy}
        />
      </BottomBar>
    </GlassScreen>
  );
};

const Row: React.FC<{ k: string; v: string; strong?: boolean }> = ({
  k,
  v,
  strong,
}) => (
  <View style={styles.sumRow}>
    <Text style={styles.sumKey}>{k}</Text>
    <Text style={[styles.sumVal, strong && styles.sumStrong]}>{v}</Text>
  </View>
);

/* ================= Bid placed ================= */

export const BidPlacedScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const { auctionId, amount } = route.params;
  const now = useNow();
  const { auction } = useLiveAuction(auctionId, () =>
    navigation.replace('Outbid', { auctionId })
  );
  const [seller, setSeller] = useState<SellerSummary | null>(null);
  useEffect(() => {
    api
      .get(`/auctions/${auctionId}/seller`)
      .then(r => setSeller(r.data.data))
      .catch(() => {});
  }, [auctionId]);

  return (
    <GlassScreen>
      <GlassHeader title="Bid placed" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Image
              source={require('../../../assets/icons/gavel.png')}
              style={styles.heroImg}
            />
          </View>
          <Text style={styles.heroTitle} accessibilityRole="header">
            You're the highest bidder
          </Text>
          <Text style={styles.heroSub}>
            We'll tell you straight away if someone bids higher.
          </Text>
        </View>
        {auction ? (
          <>
            <ProductMini auction={auction} seller={seller} />
            <StatPair
              left={['Your bid', formatCurrency(amount)]}
              right={['Ends in', timeLeft(auction.end_time, now)]}
              urgent={isUrgent(auction.end_time, now)}
            />
          </>
        ) : null}
        <Pressable
          onPress={() => navigation.navigate('AutoBid', { auctionId })}
          accessibilityRole="button"
        >
          <GlassCard style={styles.promo}>
            <Image
              source={require('../../../assets/icons/autobid.png')}
              style={styles.promoIcon}
            />
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>Don't want to keep checking?</Text>
              <Text style={styles.rowSub}>
                Set a max and we'll bid for you.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={G.blue} />
          </GlassCard>
        </Pressable>
      </ScrollView>
      <BottomBar>
        <PrimaryButton
          label="Back to auction"
          onPress={() => navigation.goBack()}
        />
      </BottomBar>
    </GlassScreen>
  );
};

/* ================= Outbid ================= */

export const OutbidScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const { auctionId } = route.params;
  const now = useNow();
  const user = useAuthStore(s => s.user);
  const { auction, bids } = useLiveAuction(auctionId);
  const placeBid = useAuctionStore(s => s.placeBid);
  const [choice, setChoice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const myBid = useMemo(() => {
    const mine = bids.filter(
      (b: any) => b.is_mine || (user?.id && b.bidder_id === user.id)
    );
    return mine.length
      ? Math.max(...mine.map((b: any) => Number(b.amount)))
      : null;
  }, [bids, user?.id]);

  if (!auction) {
    return (
      <GlassScreen>
        <GlassHeader title="Outbid" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={G.blue} style={styles.loader} />
      </GlassScreen>
    );
  }

  const min = minBid(auction);
  const step = increment(auction);
  const options = [min, min + 2 * step, min + 6 * step];
  const amount = choice && choice >= min ? choice : min;
  const live =
    auction.status === 'active' && new Date(auction.end_time).getTime() > now;

  const bid = async () => {
    setBusy(true);
    try {
      await placeBid(auctionId, amount);
      navigation.replace('BidPlaced', { auctionId, amount });
    } catch (e) {
      toast(
        e instanceof Error
          ? e.message
          : 'Your bid didn’t go through. Try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassScreen>
      <GlassHeader title="Outbid" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={[styles.heroIcon, styles.heroIconWarm]}>
            <Image
              source={require('../../../assets/icons/bell.png')}
              style={styles.heroImg}
            />
          </View>
          <Text style={styles.heroTitle} accessibilityRole="header">
            You've been outbid
          </Text>
          <Text style={styles.heroSub}>
            Someone bid more than you on the {auction.gadget?.title}.{' '}
            {live ? "There's still time." : 'Bidding has ended.'}
          </Text>
        </View>

        <GlassCard style={styles.outbidCard}>
          <View style={styles.outbidRow}>
            <View style={styles.flex}>
              <Text style={styles.pairLabel}>Your bid</Text>
              <Text style={[styles.pairValue, styles.struck]}>
                {myBid ? formatCurrency(myBid) : '—'}
              </Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.pairLabel}>Highest bid now</Text>
              <Text style={styles.pairValue}>
                {formatCurrency(auction.current_price)}
              </Text>
            </View>
          </View>
          <View style={styles.endsStrip}>
            <Text style={styles.endsStripText}>Ends in</Text>
            <Text style={styles.endsStripText}>
              {timeLeft(auction.end_time, now)}
            </Text>
          </View>
        </GlassCard>

        {live ? (
          <>
            <Text style={styles.label}>Bid again</Text>
            <View style={styles.quick}>
              {options.map(o => (
                <Pressable
                  key={o}
                  onPress={() => setChoice(o)}
                  style={[styles.quickBtn, amount === o && styles.quickOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: amount === o }}
                >
                  <Text
                    style={[
                      styles.quickText,
                      amount === o && styles.quickTextOn,
                    ]}
                  >
                    {formatCurrency(o)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.helpCenter}>
              A bid is a promise to buy if you win.
            </Text>
          </>
        ) : null}
      </ScrollView>
      <BottomBar>
        {live ? (
          <>
            <PrimaryButton
              label={busy ? 'Placing bid…' : `Bid ${formatCurrency(amount)}`}
              onPress={bid}
              disabled={busy}
            />
            <Pressable
              onPress={() => navigation.replace('AutoBid', { auctionId })}
              style={styles.link}
              accessibilityRole="button"
            >
              <Text style={styles.linkText}>Set auto-bid instead</Text>
            </Pressable>
          </>
        ) : (
          <PrimaryButton label="Back" onPress={() => navigation.goBack()} />
        )}
      </BottomBar>
    </GlassScreen>
  );
};

/* ================= Auto-bid ================= */

export const AutoBidScreen: React.FC<{ navigation: any; route: any }> = ({
  navigation,
  route,
}) => {
  const { auctionId } = route.params;
  const now = useNow();
  const { auction } = useLiveAuction(auctionId);
  const [max, setMax] = useState<number | null>(null);
  const [notify, setNotify] = useState(true);
  const [existing, setExisting] = useState<{
    max_amount: number;
    is_active: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const a: any = await meService.getAutoBid(auctionId);
      setExisting(a);
      if (a?.is_active) {
        setMax(a.max_amount);
        setNotify(a.notify_on_max !== false);
      }
    } catch {
      // first time
    }
  }, [auctionId]);
  useEffect(() => {
    load();
  }, [load]);

  const min = auction ? minBid(auction) : 0;
  const step = auction ? increment(auction) : 0;
  useEffect(() => {
    if (auction && max === null) setMax(min + 10 * step);
  }, [auction, max, min, step]);

  if (!auction || max === null) {
    return (
      <GlassScreen>
        <GlassHeader title="Auto-bid" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={G.blue} style={styles.loader} />
      </GlassScreen>
    );
  }

  const valid = max >= min;
  const active = !!existing?.is_active;

  const save = async () => {
    setBusy(true);
    try {
      await meService.setAutoBid(auctionId, max, notify);
      useAuctionStore.getState().fetchAuction(auctionId);
      useAuctionStore.getState().fetchAuctionBids(auctionId);
      toast(`Auto-bid is on, up to ${formatCurrency(max)}`, 'success');
      navigation.goBack();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't turn on auto-bid");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await meService.cancelAutoBid(auctionId);
      toast('Auto-bid is off', 'success');
      navigation.goBack();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't turn off auto-bid");
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassScreen>
      <GlassHeader title="Auto-bid" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <ProductMini
            auction={auction}
            subtitle={
              <>
                <Text style={styles.miniSub}>
                  Current bid{' '}
                  <Text style={styles.miniStrong}>
                    {formatCurrency(auction.current_price)}
                  </Text>{' '}
                  · {auction.bid_count ?? auction.total_bids ?? 0} bids
                </Text>
                <Text style={styles.miniSub}>
                  Ends in {timeLeft(auction.end_time, now)}
                </Text>
              </>
            }
          />
          <GlassCard style={styles.promo}>
            <Image
              source={require('../../../assets/icons/autobid.png')}
              style={styles.promoIcon}
            />
            <Text style={[styles.rowSub, styles.flex]}>
              Set the most you'll pay. We bid the smallest step for you, only
              when someone outbids you, and stop at your max.
            </Text>
          </GlassCard>

          <Text style={styles.label}>Your maximum bid</Text>
          <View style={[styles.maxBox, !valid && styles.amountBad]}>
            <Text style={styles.maxCurrency}>₦</Text>
            <TextInput
              value={max.toLocaleString('en-NG')}
              onChangeText={t => setMax(Number(t.replace(/[^0-9]/g, '')) || 0)}
              keyboardType="number-pad"
              style={styles.maxInput}
              accessibilityLabel="Maximum bid"
            />
          </View>
          <Text style={[styles.help, !valid && styles.helpBad]}>
            Must be at least {formatCurrency(min)}
            {max > Number(auction.current_price)
              ? ` · that's ${formatCurrency(max - Number(auction.current_price))} above the current bid`
              : ''}
          </Text>
          <View style={styles.quick}>
            {[25000, 50000, 100000].map(n => (
              <Pressable
                key={n}
                onPress={() => setMax(m => (m ?? min) + n)}
                style={styles.quickBtn}
              >
                <Text style={styles.quickText}>+₦{n / 1000}k</Text>
              </Pressable>
            ))}
          </View>

          <GlassCard style={styles.summary}>
            <View style={styles.sumRow}>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>Tell me when I hit my max</Text>
                <Text style={styles.rowSub}>
                  So you can decide whether to go higher
                </Text>
              </View>
              <Switch
                value={notify}
                onValueChange={setNotify}
                trackColor={{ false: '#D8DCE6', true: G.blue }}
                thumbColor="#FFFFFF"
                accessibilityLabel="Tell me when I hit my max"
              />
            </View>
            <View style={styles.divider} />
            <Row k="Bid step" v={`${formatCurrency(step)} at a time`} />
          </GlassCard>

          <Row
            k="If you win, you pay at most"
            v={
              deliveryFee(auction)
                ? `${formatCurrency(max)} + delivery`
                : formatCurrency(max)
            }
            strong
          />
        </ScrollView>
      </KeyboardAvoidingView>
      <BottomBar>
        <PrimaryButton
          label={
            busy ? 'Saving…' : active ? 'Update auto-bid' : 'Turn on auto-bid'
          }
          onPress={save}
          disabled={!valid || busy}
        />
        {active ? (
          <Pressable
            onPress={turnOff}
            style={styles.link}
            accessibilityRole="button"
            disabled={busy}
          >
            <Text style={styles.linkText}>Turn off auto-bid</Text>
          </Pressable>
        ) : null}
      </BottomBar>
    </GlassScreen>
  );
};

/* ---------------- Styles ---------------- */

const styles = StyleSheet.create({
  reportLink: { alignItems: 'center', paddingVertical: 18 },
  reportText: { color: G.muted, fontSize: 13, fontFamily: fonts.regular },
  reportStrong: { color: G.blue600, fontFamily: fonts.medium },
  skeletonContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 30 },
  loader: { marginTop: 60 },
  pressed: { opacity: 0.7 },
  urgent: { color: G.orangeInk },

  gallery: { overflow: 'hidden', marginTop: 4 },
  slide: { height: 250, alignItems: 'center', justifyContent: 'center' },
  slideImg: { width: '80%', height: 220 },
  liveChip: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: G.red },
  liveText: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: G.ink,
    letterSpacing: 0.4,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    paddingBottom: 10,
  },
  dotSm: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(28,31,42,0.15)',
  },
  dotOn: { width: 16, backgroundColor: G.blue },

  title: {
    color: G.ink,
    fontSize: 24,
    lineHeight: 30,
    fontFamily: fonts.medium,
    letterSpacing: -0.4,
    marginTop: 16,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tag: {
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 8,
    justifyContent: 'center',
  },
  tagText: { fontSize: 12, fontFamily: fonts.medium },

  priceCard: { flexDirection: 'row', padding: 16, marginTop: 14 },
  endsBox: { alignItems: 'flex-start', minWidth: 110 },
  bigValue: {
    color: G.ink,
    fontSize: 24,
    fontFamily: fonts.medium,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },

  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginTop: 10,
  },
  sellerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: G.blueTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  rowSub: {
    color: G.muted,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: fonts.regular,
    marginTop: 2,
  },

  h2: {
    color: G.ink,
    fontSize: 16,
    fontFamily: fonts.medium,
    marginTop: 22,
    marginBottom: 10,
  },
  check: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  checkText: {
    flex: 1,
    color: G.slate,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.regular,
  },
  table: { overflow: 'hidden' },
  tRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 12,
  },
  tDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(28,31,42,0.05)' },
  tKey: { color: G.muted, fontSize: 14, fontFamily: fonts.regular },
  tMine: { color: G.blue, fontFamily: fonts.medium },
  tVal: {
    color: G.ink,
    fontSize: 14,
    fontFamily: fonts.medium,
    flexShrink: 1,
    textAlign: 'right',
  },
  description: {
    color: G.slate,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: fonts.regular,
    marginTop: 14,
  },
  bidsHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  hint: { color: G.muted, fontSize: 12, fontFamily: fonts.regular },

  bottom: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28, gap: 4 },
  actions: { flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    height: 50,
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  link: { alignItems: 'center', paddingVertical: 12 },
  linkText: { color: G.slate, fontSize: 14, fontFamily: fonts.medium },

  mini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginTop: 4,
  },
  miniImage: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: G.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniImg: { width: 40, height: 40 },
  miniTitle: { color: G.ink, fontSize: 15, fontFamily: fonts.medium },
  miniSub: {
    color: G.muted,
    fontSize: 12,
    fontFamily: fonts.regular,
    marginTop: 2,
  },
  miniStrong: { color: G.ink, fontFamily: fonts.medium },

  pair: { flexDirection: 'row', gap: 10, marginTop: 10 },
  pairCard: { flex: 1, padding: 14 },
  pairLabel: { color: G.muted, fontSize: 12, fontFamily: fonts.regular },
  pairValue: {
    color: G.ink,
    fontSize: 19,
    fontFamily: fonts.medium,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },

  label: {
    color: G.slate,
    fontSize: 13,
    fontFamily: fonts.medium,
    marginTop: 20,
    marginBottom: 8,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 48,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountBox: {
    flex: 1,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: G.blue,
    justifyContent: 'center',
  },
  amountBad: { borderColor: G.red },
  amountText: {
    textAlign: 'center',
    fontSize: 22,
    fontFamily: fonts.medium,
    color: G.ink,
    fontVariant: ['tabular-nums'],
  },
  helpCenter: {
    color: G.muted,
    fontSize: 12,
    fontFamily: fonts.regular,
    textAlign: 'center',
    marginTop: 8,
  },
  help: {
    color: G.muted,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: fonts.regular,
    marginTop: 8,
  },
  helpBad: { color: G.red },
  quick: { flexDirection: 'row', gap: 8, marginTop: 12 },
  quickBtn: {
    flex: 1,
    height: 40,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  quickOn: { borderColor: G.blue, backgroundColor: G.blueTint },
  quickText: { color: G.ink, fontSize: 13, fontFamily: fonts.medium },
  quickTextOn: { color: G.blue },

  summary: { padding: 14, marginTop: 18, gap: 10 },
  sumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 4,
  },
  sumKey: { color: G.muted, fontSize: 14, fontFamily: fonts.regular },
  sumVal: { color: G.ink, fontSize: 14, fontFamily: fonts.medium },
  sumStrong: { fontSize: 15 },
  divider: { height: 1, backgroundColor: 'rgba(28,31,42,0.06)' },

  agree: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    marginTop: 16,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#C9CEDA',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxOn: { backgroundColor: G.blue, borderColor: G.blue },
  agreeText: {
    flex: 1,
    color: G.slate,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fonts.regular,
  },

  hero: { alignItems: 'center', marginTop: 8, marginBottom: 18 },
  heroIcon: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: '#E9F7EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIconWarm: { backgroundColor: '#FFF1E2' },
  heroImg: { width: 56, height: 56, resizeMode: 'contain' },
  heroTitle: {
    color: G.ink,
    fontSize: 22,
    fontFamily: fonts.medium,
    marginTop: 16,
    textAlign: 'center',
  },
  heroSub: {
    color: G.muted,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.regular,
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  promo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginTop: 14,
  },
  promoIcon: { width: 34, height: 34, resizeMode: 'contain' },

  outbidCard: { overflow: 'hidden' },
  outbidRow: { flexDirection: 'row', padding: 16, gap: 12 },
  struck: { textDecorationLine: 'line-through', color: G.muted },
  endsStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFF1E2',
  },
  endsStripText: {
    color: G.orangeInk,
    fontSize: 13,
    fontFamily: fonts.medium,
    fontVariant: ['tabular-nums'],
  },

  maxBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(28,31,42,0.08)',
    paddingHorizontal: 16,
  },
  maxCurrency: {
    color: G.ink,
    fontSize: 22,
    fontFamily: fonts.medium,
    marginRight: 6,
  },
  maxInput: {
    flex: 1,
    fontSize: 22,
    fontFamily: fonts.medium,
    color: G.ink,
    fontVariant: ['tabular-nums'],
  },
});
