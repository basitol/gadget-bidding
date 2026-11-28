import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
  Alert,
  TextInput,
  FlatList,
  Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  ThemeColors,
  fonts,
  spacing,
  borderRadius,
  shadows,
  MIN_BID_INCREMENT,
} from '../../constants';
import {
  AnimatedNumber,
  BottomSheet,
  Button,
  Confetti,
  CountdownTimer,
  DrawCheck,
  Flash,
  LoadingScreen,
  PopIn,
  useShake,
} from '../../components';
import { useTheme } from '../../hooks';
import { useAuctionStore, useWalletStore, useAuthStore } from '../../store';
import { socketService } from '../../services';
import {
  BID_COMMITMENT_AMOUNT,
  BID_DEFAULT_PENALTY_AMOUNT,
  BID_PAYMENT_DEADLINE_HOURS,
  getOrderedSpecEntries,
} from '@gadget-bidding/shared';
import {
  formatCurrency,
  formatDateTime,
  formatRelativeTime,
  getConditionLabel,
  getConditionColor,
  getAuctionStatusLabel,
} from '../../utils';
import { mediaUrls } from '../../utils/images';
import { Bid } from '../../types';
import { useToastStore } from '../../store/toastStore';
import { useWatchStore } from '../../store/watchStore';
import { meService } from '../../services/me.service';

const { width } = Dimensions.get('window');

type RootStackParamList = {
  AuctionDetail: { auctionId: string };
  Wallet: undefined;
  ShippingAddress: {
    orderId: string;
    orderNumber: string;
    amount: number;
    gadgetTitle?: string;
    returnToPayment?: boolean;
  };
  OrderDetail: { orderId: string };
};

type AuctionDetailScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AuctionDetail'>;
  route: RouteProp<RootStackParamList, 'AuctionDetail'>;
};

export const AuctionDetailScreen: React.FC<AuctionDetailScreenProps> = ({
  navigation,
  route,
}) => {
  const { auctionId } = route.params;
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [showBidModal, setShowBidModal] = useState(false);
  const [bidAmount, setBidAmount] = useState('');
  const [isBidding, setIsBidding] = useState(false);
  /** Bid sheet step: enter an amount, then the success screen. */
  const [bidStep, setBidStep] = useState<'amount' | 'drawing' | 'done'>('amount');
  const [placedAmount, setPlacedAmount] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  const { shakeStyle, shake } = useShake();
  const [outbidFlash, setOutbidFlash] = useState(0);

  const { user } = useAuthStore();
  const watching = useWatchStore(s => s.ids.has(auctionId));
  const toggleWatch = useWatchStore(s => s.toggle);
  // Auto-bid: bid for me, one step at a time, up to the amount I enter.
  const [autoMode, setAutoMode] = useState(false);
  const [autoBid, setAutoBid] = useState<{ max_amount: number; is_active: boolean } | null>(null);
  const [placedAuto, setPlacedAuto] = useState(false);
  useEffect(() => {
    meService.getAutoBid(auctionId).then(setAutoBid).catch(() => {});
    useWatchStore.getState().load();
  }, [auctionId]);

  // Opened from a notification button: go straight to the bid sheet.
  const openBid = (route.params as any)?.openBid as 'bid' | 'auto' | undefined;
  const presetAmount = (route.params as any)?.amount as number | undefined;
  const openedFromAlert = useRef(false);
  const { wallet, fetchWallet } = useWalletStore();
  const {
    currentAuction,
    currentBids,
    isLoading,
    error,
    fetchAuction,
    fetchAuctionBids,
    placeBid,
    buyNow,
    subscribeToAuction,
    unsubscribeFromAuction,
  } = useAuctionStore();

  useEffect(() => {
    loadAuctionData();

    // Connect socket and subscribe to auction
    const setupSocket = async () => {
      await socketService.connect();
      // Small delay to ensure socket is fully connected
      setTimeout(() => {
        console.log('AuctionDetail: Subscribing to auction', auctionId);
        subscribeToAuction(auctionId);
      }, 500);
    };

    setupSocket();

    return () => {
      console.log('AuctionDetail: Unsubscribing from auction', auctionId);
      unsubscribeFromAuction(auctionId);
    };
  }, [auctionId]);

  const loadAuctionData = async () => {
    await Promise.all([
      fetchAuction(auctionId),
      fetchAuctionBids(auctionId),
      fetchWallet(),
    ]);
  };

  const getMinBidAmount = () => {
    if (!currentAuction) return 0;
    const currentPrice = Math.floor(Number(currentAuction.current_price) || 0);
    // Use bid_increment from auction, fallback to MIN_BID_INCREMENT constant
    const increment = Math.floor(
      Number((currentAuction as any).bid_increment) || MIN_BID_INCREMENT
    );
    return currentPrice + increment;
  };

  const handleOpenBidModal = () => {
    setBidAmount(Math.floor(getMinBidAmount()).toString());
    setBidStep('amount');
    setShowBidModal(true);
  };

  // Once the auction has loaded, honour a "Bid ₦X" / "Change max" tap from Notifications.
  useEffect(() => {
    if (!openBid || openedFromAlert.current || currentAuction?.id !== auctionId) return;
    if (currentAuction.status !== 'active') return;
    openedFromAlert.current = true;
    const min = Math.floor(getMinBidAmount());
    setAutoMode(openBid === 'auto');
    setBidAmount(String(Math.max(min, Math.floor(presetAmount ?? 0))));
    setBidStep('amount');
    setShowBidModal(true);
  }, [openBid, currentAuction?.id, currentAuction?.status]);

  const handlePlaceBid = async () => {
    const amount = parseInt(bidAmount, 10);

    if (isNaN(amount) || amount < getMinBidAmount()) {
      useToastStore.getState().show(`Minimum bid is ${formatCurrency(getMinBidAmount())}`, 'error');
      return;
    }

    const availableBalance =
      (wallet?.balance || 0) - (wallet?.held_balance || 0);
    if (availableBalance < BID_COMMITMENT_AMOUNT) {
      Alert.alert(
        'Wallet balance required',
        `You need at least ${formatCurrency(BID_COMMITMENT_AMOUNT)} available in your wallet to place a bid. You currently have ${formatCurrency(availableBalance)} available.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Fund Wallet',
            onPress: () => navigation.navigate('Wallet'),
          },
        ]
      );
      return;
    }

    setIsBidding(true);
    try {
      if (autoMode) {
        const res = await meService.setAutoBid(auctionId, amount);
        setAutoBid(res);
        setPlacedAuto(true);
        // The server may already have bid for us; refresh price and bids.
        useAuctionStore.getState().fetchAuction(auctionId);
        useAuctionStore.getState().fetchAuctionBids(auctionId);
      } else {
        await placeBid(auctionId, amount);
        setPlacedAuto(false);
      }
      setPlacedAmount(amount);
      setBidStep('drawing');
    } catch (err) {
      useToastStore
        .getState()
        .show((autoMode && err instanceof Error ? err.message : error) || 'Failed to place bid. Please try again.', 'error');
    } finally {
      setIsBidding(false);
    }
  };

  const handleBuyNow = () => {
    if (!currentAuction?.buy_now_price) return;

    Alert.alert(
      'Buy now',
      `Are you sure you want to buy this item for ${formatCurrency(currentAuction.buy_now_price)}? You will be redirected to complete payment.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Buy now',
          onPress: async () => {
            try {
              const orderInfo = await buyNow(auctionId);

              if (orderInfo) {
                // Navigate to payment screen
                useToastStore.getState().show(
                  `Order #${orderInfo.orderNumber} created. Complete payment to finish your purchase.`,
                  'success',
                  { duration: 6000 }
                );
                navigation.navigate('ShippingAddress', {
                  orderId: orderInfo.orderId,
                  orderNumber: orderInfo.orderNumber,
                  amount: orderInfo.amount,
                  gadgetTitle: currentAuction.gadget?.title,
                  returnToPayment: true,
                });
              } else {
                useToastStore.getState().show(
                  'Payment received and your order has been created.',
                  'success'
                );
              }
            } catch (err) {
              useToastStore.getState().show(error || 'Failed to complete purchase.', 'error');
            }
          },
        },
      ]
    );
  };

  // Are you leading? Highest bid by amount decides it.
  const myStatus = useMemo<'winning' | 'outbid' | null>(() => {
    if (!user || currentBids.length === 0) return null;
    const mine = currentBids.some(b => b.bidder_id === user.id);
    if (!mine) return null;
    const top = currentBids.reduce((a, b) => (Number(b.amount) > Number(a.amount) ? b : a));
    return top.bidder_id === user.id ? 'winning' : 'outbid';
  }, [currentBids, user]);

  // Winning → outbid: short shake + orange flash
  const prevStatus = useRef(myStatus);
  useEffect(() => {
    if (prevStatus.current === 'winning' && myStatus === 'outbid') {
      shake();
      setOutbidFlash(n => n + 1);
    }
    prevStatus.current = myStatus;
  }, [myStatus, shake]);

  // "You won!" — celebrate once per auction
  const didWin =
    !!currentAuction &&
    !!user &&
    currentAuction.winner_id === user.id &&
    currentAuction.status !== 'active';
  useEffect(() => {
    if (!didWin) return;
    const key = `celebrated-win:${auctionId}`;
    AsyncStorage.getItem(key).then(seen => {
      if (!seen) {
        setCelebrate(true);
        AsyncStorage.setItem(key, '1');
      }
    });
  }, [didWin, auctionId]);

  const closeBidSheet = () => setShowBidModal(false);

  const renderBidItem = ({ item }: { item: Bid }) => {
    const isCurrentUser = item.bidder_id === user?.id;
    const bidderLabel = isCurrentUser ? 'You' : 'Bidder';

    return (
      <View style={styles.bidItem}>
        <View style={styles.bidderInfo}>
          <View style={styles.bidderAvatar}>
            <Text style={styles.bidderInitial}>
              {isCurrentUser ? 'Y' : 'B'}
            </Text>
          </View>
          <View>
            <Text style={styles.bidderName}>
              {bidderLabel}
              {isCurrentUser ? ' (You)' : ''}
            </Text>
            <Text style={styles.bidTime}>
              {formatRelativeTime(item.bid_time || item.created_at)}
            </Text>
          </View>
        </View>
        <Text
          style={[
            styles.bidAmount,
            item.status === 'active' ? styles.activeBid : undefined,
          ]}
        >
          {formatCurrency(item.amount)}
        </Text>
      </View>
    );
  };

  if (isLoading && !currentAuction) {
    return <LoadingScreen message="Loading auction..." />;
  }

  if (!currentAuction) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Auction not found</Text>
          <Button title="Go Back" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  const gadget = currentAuction.gadget;
  const images = mediaUrls(gadget?.images);
  const isActive = currentAuction.status === 'active';
  const isOwner = currentAuction.seller_id === user?.id;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Image Gallery */}
        <View style={styles.imageContainer}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={e => {
              const index = Math.round(e.nativeEvent.contentOffset.x / width);
              setActiveImageIndex(index);
            }}
          >
            {images.length > 0 ? (
              images.map((image, index) => (
                <Image
                  key={index}
                  source={{ uri: image }}
                  style={styles.image}
                  resizeMode="cover"
                />
              ))
            ) : (
              <View style={[styles.image, styles.placeholderImage]}>
                <Ionicons
                  name="image-outline"
                  size={58}
                  color={colors.textMuted}
                />
              </View>
            )}
          </ScrollView>

          {/* Back Button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Watch (heart) */}
          <TouchableOpacity
            style={[styles.backButton, styles.watchButton]}
            onPress={() => toggleWatch(auctionId)}
            accessibilityRole="button"
            accessibilityLabel={watching ? 'Remove from watchlist' : 'Add to watchlist'}
            accessibilityState={{ selected: watching }}
          >
            <Ionicons name={watching ? 'heart' : 'heart-outline'} size={22} color={watching ? '#F0456B' : '#FFFFFF'} />
          </TouchableOpacity>

          {/* Image Indicators */}
          {images.length > 1 && (
            <View style={styles.imageIndicators}>
              {images.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.indicator,
                    index === activeImageIndex
                      ? styles.activeIndicator
                      : undefined,
                  ]}
                />
              ))}
            </View>
          )}

          {/* Status Badge */}
          <View
            style={[
              styles.statusBadge,
              !isActive ? styles.endedBadge : undefined,
            ]}
          >
            <Text style={styles.statusText}>
              {getAuctionStatusLabel(currentAuction.status)}
            </Text>
          </View>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Title & Condition */}
          <View style={styles.titleSection}>
            <Text style={styles.title}>{gadget?.title}</Text>
            {(gadget?.brand || gadget?.model) && (
              <Text style={styles.productLine}>
                {[
                  gadget?.brand,
                  gadget?.model,
                  gadget?.specifications?.color,
                  gadget?.specifications?.storage,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            )}
            {gadget?.condition && (
              <View
                style={[
                  styles.conditionBadge,
                  {
                    backgroundColor: getConditionColor(gadget.condition) + '20',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.conditionText,
                    { color: getConditionColor(gadget.condition) },
                  ]}
                >
                  {getConditionLabel(gadget.condition)}
                </Text>
              </View>
            )}
          </View>

          {/* You won! */}
          {didWin && (
            <View style={styles.wonWrap}>
              {celebrate ? (
                <PopIn style={styles.wonCard}>
                  <Text style={styles.wonTitle}>You won!</Text>
                  <Text style={styles.wonSub}>
                    Pay within {BID_PAYMENT_DEADLINE_HOURS} hours to secure it.
                  </Text>
                </PopIn>
              ) : (
                <View style={styles.wonCard}>
                  <Text style={styles.wonTitle}>You won!</Text>
                  <Text style={styles.wonSub}>
                    Pay within {BID_PAYMENT_DEADLINE_HOURS} hours to secure it.
                  </Text>
                </View>
              )}
              {celebrate && (
                <Confetti
                  colors={[colors.primary, colors.success, colors.warning, colors.accentLight]}
                  onDone={() => setCelebrate(false)}
                />
              )}
            </View>
          )}

          {/* Winning / Outbid */}
          {isActive && myStatus && (
            <Animated.View
              accessibilityLiveRegion="polite"
              style={[
                styles.statusBanner,
                myStatus === 'winning' ? styles.statusWinning : styles.statusOutbid,
                shakeStyle,
              ]}
            >
              <Flash
                trigger={outbidFlash}
                color={colors.warning}
                intensity={0.35}
                borderRadius={borderRadius.lg}
              />
              <Ionicons
                name={myStatus === 'winning' ? 'trophy' : 'alert-circle'}
                size={18}
                color={myStatus === 'winning' ? colors.success : colors.warning}
              />
              <Text
                style={[
                  styles.statusBannerText,
                  { color: myStatus === 'winning' ? colors.success : colors.warning },
                ]}
              >
                {myStatus === 'winning'
                  ? "You're winning"
                  : 'Outbid. Bid again to take the lead.'}
              </Text>
            </Animated.View>
          )}

          {/* Price Section */}
          <View style={styles.priceSection}>
            <Flash
              trigger={currentAuction.current_price}
              color={colors.success}
              borderRadius={borderRadius.lg}
            />
            <View style={styles.priceRow}>
              <View>
                <Text style={styles.priceLabel}>Current Bid</Text>
                <AnimatedNumber
                  style={styles.currentPrice}
                  value={Math.floor(Number(currentAuction.current_price) || 0)}
                  format={formatCurrency}
                />
              </View>
              <View style={styles.bidCountBox}>
                <Text style={styles.bidCountNumber}>
                  {currentAuction.bid_count}
                </Text>
                <Text style={styles.bidCountLabel}>bids</Text>
              </View>
            </View>

            {!!currentAuction.buy_now_price && isActive && (
              <View style={styles.buyNowRow}>
                <Text style={styles.buyNowLabel}>Buy Now Price:</Text>
                <Text style={styles.buyNowPrice}>
                  {formatCurrency(currentAuction.buy_now_price)}
                </Text>
              </View>
            )}
          </View>

          {/* Countdown */}
          {isActive && (
            <View style={styles.countdownSection}>
              <Text style={styles.countdownLabel}>Time Remaining</Text>
              <CountdownTimer
                endTime={currentAuction.end_time}
                size="lg"
                onEnd={() => fetchAuction(auctionId)}
              />
            </View>
          )}

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.description}>{gadget?.description}</Text>
          </View>

          {/* Specifications */}
          {(() => {
            const specEntries = getOrderedSpecEntries(
              gadget?.specifications as Record<string, unknown> | undefined
            );
            if (specEntries.length === 0) return null;
            return (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Specifications</Text>
                <View style={styles.specsContainer}>
                  {specEntries.map(entry => (
                    <View key={entry.key} style={styles.specRow}>
                      <Text style={styles.specKey}>{entry.label}</Text>
                      <Text style={styles.specValue}>{entry.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })()}

          {/* Bid History */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bid History</Text>
            {currentBids.length === 0 ? (
              <View style={styles.noBids}>
                <Text style={styles.noBidsText}>
                  No bids yet. Be the first!
                </Text>
              </View>
            ) : (
              <FlatList
                data={currentBids.slice(0, 5)}
                keyExtractor={item => item.id}
                renderItem={renderBidItem}
                scrollEnabled={false}
              />
            )}
          </View>

          {/* Auction Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Auction Details</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Started</Text>
              <Text style={styles.infoValue}>
                {formatDateTime(currentAuction.start_time)}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Ends</Text>
              <Text style={styles.infoValue}>
                {formatDateTime(currentAuction.end_time)}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Starting Price</Text>
              <Text style={styles.infoValue}>
                {formatCurrency(currentAuction.starting_price)}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Min Increment</Text>
              <Text style={styles.infoValue}>
                {formatCurrency(currentAuction.min_bid_increment)}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Action Bar — in layout flow, not overlaying content */}
      {isActive && !isOwner && (
        <View style={styles.actionBar}>
          <View style={styles.actionButtons}>
            {currentAuction.buy_now_price ? (
              <TouchableOpacity
                style={styles.buyNowButtonCustom}
                onPress={handleBuyNow}
                activeOpacity={0.8}
              >
                <Text style={styles.buyNowButtonLabel}>Buy Now</Text>
                <Text style={styles.buyNowButtonPrice}>
                  {formatCurrency(currentAuction.buy_now_price)}
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.bidButtonCustom}
              onPress={handleOpenBidModal}
              activeOpacity={0.8}
            >
              <Text style={styles.bidButtonLabel}>Place Bid</Text>
              <Text style={styles.bidButtonPrice}>
                Min: {formatCurrency(getMinBidAmount())}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Bid sheet */}
      <BottomSheet visible={showBidModal} onClose={closeBidSheet} style={styles.modalContent}>
        <View style={styles.grabHandle} />
        {bidStep === 'amount' ? (
          <>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Place Your Bid</Text>
            <TouchableOpacity onPress={closeBidSheet} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.modalLabel}>Current Price</Text>
            <Text style={styles.modalCurrentPrice}>
              {formatCurrency(currentAuction.current_price)}
            </Text>

            {autoBid?.is_active ? (
              <View style={styles.autoActive}>
                <Ionicons name="flash" size={16} color={colors.primary} />
                <Text style={styles.autoActiveText}>
                  Auto-bid is on, up to {formatCurrency(autoBid.max_amount)}
                </Text>
                <TouchableOpacity
                  onPress={async () => {
                    await meService.cancelAutoBid(auctionId).catch(() => {});
                    setAutoBid({ ...autoBid, is_active: false });
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.autoActiveOff}>Turn off</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.autoRow}>
              <View style={styles.autoRowText}>
                <Text style={styles.autoTitle}>Auto-bid</Text>
                <Text style={styles.autoSub}>
                  We bid for you, one step at a time, only when someone outbids you, up to your maximum.
                </Text>
              </View>
              <Switch
                value={autoMode}
                onValueChange={setAutoMode}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
                accessibilityLabel="Auto-bid"
              />
            </View>

            <Text style={styles.modalLabel}>{autoMode ? 'Your maximum (₦)' : 'Your Bid (₦)'}</Text>
            <TextInput
              style={styles.bidInput}
              value={bidAmount}
              onChangeText={setBidAmount}
              keyboardType="number-pad"
              placeholder={Math.floor(getMinBidAmount()).toString()}
              placeholderTextColor={colors.textMuted}
            />

            <View style={styles.quickBids}>
              {[0, 1000, 2000, 5000].map(increment => (
                <TouchableOpacity
                  key={increment}
                  style={styles.quickBidButton}
                  onPress={() =>
                    setBidAmount(
                      Math.floor(getMinBidAmount() + increment).toString()
                    )
                  }
                >
                  <Text style={styles.quickBidText}>
                    {increment === 0
                      ? 'Min'
                      : `+₦${increment.toLocaleString()}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.balanceInfo}>
              <Text style={styles.balanceLabel}>
                Required Wallet Balance:
              </Text>
              <Text style={styles.balanceAmount}>
                {formatCurrency(BID_COMMITMENT_AMOUNT)}
              </Text>
            </View>

            <View style={styles.bidPolicyBox}>
              <Ionicons
                name="shield-checkmark-outline"
                size={18}
                color={colors.primary}
              />
              <Text style={styles.bidPolicyText}>
                If you win, pay within {BID_PAYMENT_DEADLINE_HOURS} hours.
                Missing payment forfeits the{' '}
                {formatCurrency(BID_COMMITMENT_AMOUNT)} hold, suspends your
                account, and requires a{' '}
                {formatCurrency(BID_DEFAULT_PENALTY_AMOUNT)} reactivation
                penalty.
              </Text>
            </View>

            <Button
              title={autoMode ? 'Turn on auto-bid' : 'Confirm Bid'}
              onPress={handlePlaceBid}
              loading={isBidding}
              fullWidth
              size="lg"
            />
          </View>
          </>
        ) : (
          <View style={styles.successBody}>
            <DrawCheck
              size={76}
              color="#FFFFFF"
              background={colors.success}
              onDone={() => setBidStep('done')}
            />
            {bidStep === 'done' && (
              <PopIn from="right" style={styles.successText}>
                <Text style={styles.successTitle}>{placedAuto ? 'Auto-bid is on' : 'Bid placed'}</Text>
                <Text style={styles.successAmount}>
                  {placedAuto ? `Up to ${formatCurrency(placedAmount)}` : formatCurrency(placedAmount)}
                </Text>
                <Text style={styles.successNote}>
                  {placedAuto
                    ? `We'll bid for you only when someone outbids you, one step at a time, and never past your maximum. ${formatCurrency(BID_COMMITMENT_AMOUNT)} is held while you're bidding.`
                    : `You're the highest bidder. ${formatCurrency(BID_COMMITMENT_AMOUNT)} is held only while you stay on top, and we'll alert you if someone outbids you.`}
                </Text>
                <Button title="Keep watching" onPress={closeBidSheet} fullWidth size="lg" />
              </PopIn>
            )}
          </View>
        )}
      </BottomSheet>
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: spacing.lg,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xl,
    },
    errorText: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.lg,
      marginBottom: spacing.lg,
    },
    imageContainer: {
      position: 'relative',
    },
    image: {
      width,
      height: width * 0.8,
    },
    placeholderImage: {
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    backButton: {
      position: 'absolute',
      top: spacing.md,
      left: spacing.md,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    watchButton: {
      left: undefined,
      right: spacing.md,
      top: spacing.md + 52, // below the status badge
    },
    autoActive: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.primary + '14',
      borderRadius: borderRadius.lg,
      padding: spacing.sm,
      marginBottom: spacing.md,
    },
    autoActiveText: {
      flex: 1,
      color: colors.text,
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.medium,
    },
    autoActiveOff: {
      color: colors.primary,
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.medium,
    },
    autoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    autoRowText: {
      flex: 1,
    },
    autoTitle: {
      color: colors.text,
      fontSize: fonts.sizes.md,
      fontFamily: fonts.medium,
    },
    autoSub: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.xs,
      fontFamily: fonts.regular,
      marginTop: 2,
      lineHeight: 16,
    },
    imageIndicators: {
      position: 'absolute',
      bottom: spacing.md,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    indicator: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: 'rgba(255,255,255,0.5)',
    },
    activeIndicator: {
      backgroundColor: colors.text,
      width: 24,
    },
    statusBadge: {
      position: 'absolute',
      top: spacing.md,
      right: spacing.md,
      backgroundColor: colors.success,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.sm,
    },
    endedBadge: {
      backgroundColor: colors.error,
    },
    statusText: {
      color: '#FFFFFF',
      fontSize: fonts.sizes.xs,
      fontFamily: fonts.bold,
    },
    content: {
      padding: spacing.lg,
    },
    titleSection: {
      marginBottom: spacing.lg,
    },
    title: {
      fontSize: fonts.sizes.xxl,
      fontFamily: fonts.bold,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    productLine: {
      fontSize: fonts.sizes.sm,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    conditionBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.sm,
    },
    conditionText: {
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.semiBold,
    },
    wonWrap: {
      marginBottom: spacing.lg,
    },
    wonCard: {
      alignItems: 'center',
      backgroundColor: colors.success + '18',
      borderWidth: 1,
      borderColor: colors.success + '55',
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
    },
    wonTitle: {
      color: colors.success,
      fontSize: fonts.sizes.xxl,
      fontFamily: fonts.bold,
    },
    wonSub: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.sm,
      marginTop: spacing.xs,
    },
    statusBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      overflow: 'hidden',
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      marginBottom: spacing.md,
    },
    statusWinning: {
      backgroundColor: colors.success + '14',
      borderColor: colors.success + '44',
    },
    statusOutbid: {
      backgroundColor: colors.warning + '14',
      borderColor: colors.warning + '55',
    },
    statusBannerText: {
      flex: 1,
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.semiBold,
    },
    successBody: {
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
      minHeight: 340,
    },
    successText: {
      alignSelf: 'stretch',
      alignItems: 'center',
      marginTop: spacing.lg,
    },
    successTitle: {
      color: colors.text,
      fontSize: fonts.sizes.xl,
      fontFamily: fonts.bold,
    },
    successAmount: {
      color: colors.success,
      fontSize: fonts.sizes.xxl,
      fontFamily: fonts.bold,
      marginTop: spacing.xs,
    },
    successNote: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.sm,
      lineHeight: 20,
      textAlign: 'center',
      marginVertical: spacing.lg,
    },
    priceSection: {
      overflow: 'hidden',
      backgroundColor: colors.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    priceRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    priceLabel: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.sm,
    },
    currentPrice: {
      color: colors.secondary,
      fontSize: fonts.sizes.xxxl,
      fontFamily: fonts.bold,
    },
    bidCountBox: {
      backgroundColor: colors.primary + '20',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      alignItems: 'center',
    },
    bidCountNumber: {
      color: colors.primary,
      fontSize: fonts.sizes.xxl,
      fontFamily: fonts.bold,
    },
    bidCountLabel: {
      color: colors.primary,
      fontSize: fonts.sizes.xs,
    },
    buyNowRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    buyNowLabel: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.sm,
    },
    buyNowPrice: {
      color: colors.accent,
      fontSize: fonts.sizes.xl,
      fontFamily: fonts.bold,
    },
    countdownSection: {
      backgroundColor: colors.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      alignItems: 'center',
    },
    countdownLabel: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.sm,
      marginBottom: spacing.md,
    },
    section: {
      marginBottom: spacing.xl,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: fonts.sizes.lg,
      fontFamily: fonts.bold,
      marginBottom: spacing.md,
    },
    description: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.md,
      lineHeight: 24,
    },
    specsContainer: {
      backgroundColor: colors.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
    },
    specRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    specKey: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.sm,
    },
    specValue: {
      color: colors.text,
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.medium,
    },
    noBids: {
      backgroundColor: colors.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.xl,
      alignItems: 'center',
    },
    noBidsText: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.md,
    },
    bidItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.surface,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      marginBottom: spacing.sm,
    },
    bidderInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    bidderAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary + '30',
      justifyContent: 'center',
      alignItems: 'center',
    },
    bidderInitial: {
      color: colors.primary,
      fontSize: fonts.sizes.lg,
      fontFamily: fonts.bold,
    },
    bidderName: {
      color: colors.text,
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.medium,
    },
    bidTime: {
      color: colors.textMuted,
      fontSize: fonts.sizes.xs,
    },
    bidAmount: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.md,
      fontFamily: fonts.semiBold,
    },
    activeBid: {
      color: colors.success,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    infoLabel: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.sm,
    },
    infoValue: {
      color: colors.text,
      fontSize: fonts.sizes.sm,
    },
    actionBar: {
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
    },
    actionButtons: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: spacing.sm,
    },
    buyNowButtonCustom: {
      flex: 1,
      backgroundColor: colors.warning + '1A',
      borderWidth: 1.5,
      borderColor: colors.warning,
      borderRadius: borderRadius.full,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
    },
    buyNowButtonLabel: {
      color: colors.warning,
      fontSize: fonts.sizes.xs,
      fontFamily: fonts.semiBold,
    },
    buyNowButtonPrice: {
      color: colors.warning,
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.bold,
    },
    bidButtonCustom: {
      flex: 1,
      backgroundColor: colors.primary,
      borderRadius: borderRadius.full,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
    },
    bidButtonLabel: {
      color: '#FFFFFF',
      fontSize: fonts.sizes.xs,
      fontFamily: fonts.semiBold,
    },
    bidButtonPrice: {
      color: '#FFFFFF',
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.medium,
      opacity: 0.9,
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: borderRadius.xxl,
      borderTopRightRadius: borderRadius.xxl,
      paddingBottom: spacing.xxl,
    },
    grabHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: borderRadius.full,
      backgroundColor: colors.textMuted,
      opacity: 0.4,
      marginTop: spacing.sm,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      color: colors.text,
      fontSize: fonts.sizes.xl,
      fontFamily: fonts.bold,
    },
    modalBody: {
      padding: spacing.lg,
    },
    modalLabel: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.sm,
      marginBottom: spacing.xs,
    },
    modalCurrentPrice: {
      color: colors.text,
      fontSize: fonts.sizes.xxl,
      fontFamily: fonts.bold,
      marginBottom: spacing.lg,
    },
    bidInput: {
      backgroundColor: colors.surfaceLight,
      borderRadius: borderRadius.xl,
      borderWidth: 1.5,
      borderColor: colors.border,
      padding: spacing.lg,
      fontSize: fonts.sizes.xxl,
      fontFamily: fonts.bold,
      color: colors.text,
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    quickBids: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: spacing.lg,
    },
    quickBidButton: {
      backgroundColor: colors.primary + '14',
      borderWidth: 1,
      borderColor: colors.primary + '2A',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.full,
    },
    quickBidText: {
      color: colors.primary,
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.semiBold,
    },
    balanceInfo: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.surfaceLight,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      marginBottom: spacing.md,
    },
    balanceLabel: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.sm,
    },
    balanceAmount: {
      color: colors.text,
      fontSize: fonts.sizes.md,
      fontFamily: fonts.semiBold,
    },
    bidPolicyBox: {
      flexDirection: 'row',
      gap: spacing.sm,
      backgroundColor: colors.primary + '10',
      borderWidth: 1,
      borderColor: colors.primary + '24',
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    bidPolicyText: {
      flex: 1,
      color: colors.textSecondary,
      fontSize: fonts.sizes.sm,
      lineHeight: 20,
      fontFamily: fonts.medium,
    },
  });
