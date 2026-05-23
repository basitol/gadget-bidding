import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
  Alert,
  Modal,
  TextInput,
  FlatList,
  KeyboardAvoidingView, // ← add this
  Platform, // ← add this
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import {
  colors,
  fonts,
  spacing,
  borderRadius,
  shadows,
  MIN_BID_INCREMENT,
} from '../../constants';
import { Button, CountdownTimer, LoadingScreen } from '../../components';
import { useAuctionStore, useWalletStore, useAuthStore } from '../../store';
import { socketService } from '../../services';
import {
  formatCurrency,
  formatDateTime,
  formatRelativeTime,
  getConditionLabel,
  getConditionColor,
} from '../../utils';
import { Bid } from '../../types';

const { width } = Dimensions.get('window');

type RootStackParamList = {
  AuctionDetail: { auctionId: string };
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
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [showBidModal, setShowBidModal] = useState(false);
  const [bidAmount, setBidAmount] = useState('');
  const [isBidding, setIsBidding] = useState(false);

  const { user } = useAuthStore();
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
    setShowBidModal(true);
  };

  const handlePlaceBid = async () => {
    const amount = parseInt(bidAmount, 10);

    if (isNaN(amount) || amount < getMinBidAmount()) {
      Alert.alert(
        'Invalid Bid',
        `Minimum bid is ${formatCurrency(getMinBidAmount())}`
      );
      return;
    }

    const availableBalance =
      (wallet?.balance || 0) - (wallet?.held_balance || 0);
    if (amount > availableBalance) {
      Alert.alert(
        'Insufficient Balance',
        `You need ${formatCurrency(amount)} but only have ${formatCurrency(availableBalance)} available. Please fund your wallet.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Fund Wallet',
            onPress: () => navigation.navigate('Wallet' as never),
          },
        ]
      );
      return;
    }

    setIsBidding(true);
    try {
      await placeBid(auctionId, amount);
      setShowBidModal(false);
      Alert.alert(
        'Bid Placed! 🎉',
        `Your bid of ${formatCurrency(amount)} has been placed successfully.`
      );
    } catch (err) {
      Alert.alert(
        'Bid Failed',
        error || 'Failed to place bid. Please try again.'
      );
    } finally {
      setIsBidding(false);
    }
  };

  const handleBuyNow = () => {
    if (!currentAuction?.buy_now_price) return;

    Alert.alert(
      'Buy Now',
      `Are you sure you want to buy this item for ${formatCurrency(currentAuction.buy_now_price)}? You will be redirected to complete payment.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Buy Now',
          onPress: async () => {
            try {
              const orderInfo = await buyNow(auctionId);

              if (orderInfo) {
                // Navigate to payment screen
                Alert.alert(
                  'Order Created! 🎉',
                  `Order #${orderInfo.orderNumber} has been created. Proceed to payment to complete your purchase.`,
                  [
                    {
                      text: 'Pay Now',
                      onPress: () => {
                        navigation.navigate('Profile', {
                          screen: 'Payment',
                          params: {
                            orderId: orderInfo.orderId,
                            orderNumber: orderInfo.orderNumber,
                            amount: orderInfo.amount,
                            gadgetTitle: currentAuction.gadget?.title,
                          },
                        });
                      },
                    },
                    {
                      text: 'Pay Later',
                      style: 'cancel',
                      onPress: () => {
                        navigation.navigate('Profile', {
                          screen: 'OrderDetail',
                          params: { orderId: orderInfo.orderId },
                        });
                      },
                    },
                  ]
                );
              } else {
                Alert.alert(
                  'Purchase Complete',
                  'Your purchase was successful!'
                );
              }
            } catch (err) {
              Alert.alert(
                'Purchase Failed',
                error || 'Failed to complete purchase.'
              );
            }
          },
        },
      ]
    );
  };

  const renderBidItem = ({ item }: { item: Bid }) => (
    <View style={styles.bidItem}>
      <View style={styles.bidderInfo}>
        <View style={styles.bidderAvatar}>
          <Text style={styles.bidderInitial}>
            {item.bidder?.full_name?.[0] || '?'}
          </Text>
        </View>
        <View>
          <Text style={styles.bidderName}>
            {item.bidder?.full_name || 'Anonymous'}
            {item.bidder_id === user?.id && ' (You)'}
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
  const images = gadget?.images || [];
  const isActive = currentAuction.status === 'active';
  const isOwner = currentAuction.seller_id === user?.id;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
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
                <Text style={styles.placeholderText}>📷</Text>
              </View>
            )}
          </ScrollView>

          {/* Back Button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backIcon}>←</Text>
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
              {currentAuction.status.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Title & Condition */}
          <View style={styles.titleSection}>
            <Text style={styles.title}>{gadget?.title}</Text>
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

          {/* Price Section */}
          <View style={styles.priceSection}>
            <View style={styles.priceRow}>
              <View>
                <Text style={styles.priceLabel}>Current Bid</Text>
                <Text style={styles.currentPrice}>
                  {formatCurrency(currentAuction.current_price)}
                </Text>
              </View>
              <View style={styles.bidCountBox}>
                <Text style={styles.bidCountNumber}>
                  {currentAuction.bid_count}
                </Text>
                <Text style={styles.bidCountLabel}>bids</Text>
              </View>
            </View>

            {currentAuction.buy_now_price && isActive && (
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
          {gadget?.specifications &&
            Object.keys(gadget.specifications).length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Specifications</Text>
                <View style={styles.specsContainer}>
                  {Object.entries(gadget.specifications).map(([key, value]) => (
                    <View key={key} style={styles.specRow}>
                      <Text style={styles.specKey}>{key}</Text>
                      <Text style={styles.specValue}>{value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

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

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Bottom Action Bar */}
      {isActive && !isOwner && (
        <View style={styles.actionBar}>
          <View style={styles.actionBarContent}>
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.buyNowButtonCustom}
                onPress={handleBuyNow}
                activeOpacity={0.8}
              >
                <Text style={styles.buyNowButtonLabel}>Buy Now</Text>
                <Text style={styles.buyNowButtonPrice}>
                  {formatCurrency(
                    currentAuction.buy_now_price ||
                      currentAuction.current_price * 1.5
                  )}
                </Text>
              </TouchableOpacity>
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
        </View>
      )}

      {/* Bid Modal */}
      <Modal
        visible={showBidModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowBidModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalDismissArea}
            activeOpacity={1}
            onPress={() => setShowBidModal(false)}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Place Your Bid</Text>
              <TouchableOpacity onPress={() => setShowBidModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.modalLabel}>Current Price</Text>
              <Text style={styles.modalCurrentPrice}>
                {formatCurrency(currentAuction.current_price)}
              </Text>

              <Text style={styles.modalLabel}>Your Bid (₦)</Text>
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
                <Text style={styles.balanceLabel}>Available Balance:</Text>
                <Text style={styles.balanceAmount}>
                  {formatCurrency(
                    (wallet?.balance || 0) - (wallet?.held_balance || 0)
                  )}
                </Text>
              </View>

              <Button
                title="Confirm Bid"
                onPress={handlePlaceBid}
                loading={isBidding}
                fullWidth
                size="lg"
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  placeholderText: {
    fontSize: 64,
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
  backIcon: {
    color: colors.text,
    fontSize: fonts.sizes.xl,
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
    color: colors.text,
    fontSize: fonts.sizes.xs,
    fontWeight: '700',
  },
  content: {
    padding: spacing.lg,
  },
  titleSection: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fonts.sizes.xxl,
    fontWeight: '700',
    color: colors.text,
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
    fontWeight: '600',
  },
  priceSection: {
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
    fontWeight: '700',
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
    fontWeight: '700',
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
    fontWeight: '700',
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
    fontWeight: '700',
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
    fontWeight: '500',
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
    fontWeight: '700',
  },
  bidderName: {
    color: colors.text,
    fontSize: fonts.sizes.sm,
    fontWeight: '500',
  },
  bidTime: {
    color: colors.textMuted,
    fontSize: fonts.sizes.xs,
  },
  bidAmount: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.md,
    fontWeight: '600',
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
  bottomPadding: {
    height: 180, // Increased to account for action bar + tab bar
  },
  actionBar: {
    position: 'absolute',
    bottom: 80, // Account for tab bar height
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: spacing.md,
    ...shadows.lg,
  },
  actionBarContent: {
    padding: spacing.md,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  buyNowButtonCustom: {
    flex: 1,
    backgroundColor: colors.warning,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  buyNowButtonLabel: {
    color: colors.background,
    fontSize: fonts.sizes.sm,
    fontWeight: '600',
  },
  buyNowButtonPrice: {
    color: colors.background,
    fontSize: fonts.sizes.md,
    fontWeight: '700',
  },
  bidButtonCustom: {
    flex: 1.2,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  bidButtonLabel: {
    color: colors.text,
    fontSize: fonts.sizes.sm,
    fontWeight: '600',
  },
  bidButtonPrice: {
    color: colors.text,
    fontSize: fonts.sizes.xs,
    fontWeight: '500',
    opacity: 0.9,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalDismissArea: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xxl,
    borderTopRightRadius: borderRadius.xxl,
    paddingBottom: spacing.xxl,
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
    fontWeight: '700',
  },
  modalClose: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.xl,
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
    fontWeight: '700',
    marginBottom: spacing.lg,
  },
  bidInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    fontSize: fonts.sizes.xxl,
    fontWeight: '700',
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
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  quickBidText: {
    color: colors.primary,
    fontSize: fonts.sizes.sm,
    fontWeight: '600',
  },
  balanceInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
  },
  balanceLabel: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
  },
  balanceAmount: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '600',
  },
});
