import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fonts, spacing, borderRadius } from '../../constants';
import { EmptyState, LoadingScreen } from '../../components';
import { auctionService } from '../../services';
import { formatCurrency, formatRelativeTime } from '../../utils';
import { Bid } from '../../types';

type MyBidsScreenProps = {
  navigation: NativeStackNavigationProp<any>;
};

export const MyBidsScreen: React.FC<MyBidsScreenProps> = ({ navigation }) => {
  const [bids, setBids] = useState<Bid[]>([]);
  const [activeBids, setActiveBids] = useState<Bid[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'active'>('all');

  const loadBids = useCallback(async () => {
    try {
      const [allBidsResponse, activeBidsResponse] = await Promise.all([
        auctionService.getMyBids(),
        auctionService.getMyActiveBids(),
      ]);
      setBids(allBidsResponse.data || []);
      setActiveBids(activeBidsResponse.data || []);
    } catch (error) {
      console.error('Failed to load bids:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadBids();
  }, [loadBids]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadBids();
  };

  const handleBidPress = (bid: Bid) => {
    navigation.navigate('Home', {
      screen: 'AuctionDetail',
      params: { auctionId: bid.auction_id },
    });
  };

  const getBidStatusColor = (bid: Bid): string => {
    if (bid.is_winning) return colors.success;
    if (bid.status === 'outbid') return colors.warning;
    if (bid.status === 'won') return colors.success;
    if (bid.status === 'lost') return colors.error;
    return colors.textSecondary;
  };

  const getBidStatusText = (bid: Bid): string => {
    if (bid.is_winning) return 'Winning';
    if (bid.status === 'outbid') return 'Outbid';
    if (bid.status === 'won') return 'Won';
    if (bid.status === 'lost') return 'Lost';
    return 'Active';
  };

  const getBidStatusIcon = (bid: Bid): string => {
    if (bid.is_winning) return '🏆';
    if (bid.status === 'outbid') return '⚡';
    if (bid.status === 'won') return '🎉';
    if (bid.status === 'lost') return '😢';
    return '🎯';
  };

  const displayBids = activeTab === 'all' ? bids : activeBids;

  const renderBid = ({ item }: { item: Bid }) => (
    <TouchableOpacity
      style={styles.bidCard}
      activeOpacity={0.8}
      onPress={() => handleBidPress(item)}
    >
      <View style={styles.bidHeader}>
        <View style={styles.auctionInfo}>
          <View style={styles.auctionImage}>
            {(item as any).auction?.gadget?.images?.[0] ? (
              <Image
                source={{ uri: (item as any).auction.gadget.images[0] }}
                style={styles.auctionImageContent}
              />
            ) : (
              <Text style={styles.auctionEmoji}>📱</Text>
            )}
          </View>
          <View style={styles.auctionDetails}>
            <Text style={styles.auctionTitle} numberOfLines={2}>
              {(item as any).auction?.gadget?.title || 'Auction Item'}
            </Text>
            <Text style={styles.bidTime}>
              {formatRelativeTime(item.bid_time)}
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getBidStatusColor(item) + '20' },
          ]}
        >
          <Text style={styles.statusIcon}>{getBidStatusIcon(item)}</Text>
          <Text style={[styles.statusText, { color: getBidStatusColor(item) }]}>
            {getBidStatusText(item)}
          </Text>
        </View>
      </View>

      <View style={styles.bidDetails}>
        <View style={styles.bidInfo}>
          <Text style={styles.bidLabel}>Your Bid</Text>
          <Text style={styles.bidAmount}>{formatCurrency(item.amount)}</Text>
        </View>
        {(item as any).auction?.current_price && (
          <View style={styles.bidInfo}>
            <Text style={styles.bidLabel}>Current Price</Text>
            <Text style={styles.currentPrice}>
              {formatCurrency((item as any).auction.current_price)}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.bidFooter}>
        <Text style={styles.viewAuction}>View Auction →</Text>
      </View>
    </TouchableOpacity>
  );

  if (isLoading) {
    return <LoadingScreen message="Loading your bids..." />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Bids</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{bids.length}</Text>
          <Text style={styles.statLabel}>Total Bids</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.success }]}>
            {activeBids.length}
          </Text>
          <Text style={styles.statLabel}>Winning</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {bids.filter(b => b.status === 'won').length}
          </Text>
          <Text style={styles.statLabel}>Won</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'all' ? styles.activeTab : undefined,
          ]}
          onPress={() => setActiveTab('all')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'all' ? styles.activeTabText : undefined,
            ]}
          >
            All Bids
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'active' ? styles.activeTab : undefined,
          ]}
          onPress={() => setActiveTab('active')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'active' ? styles.activeTabText : undefined,
            ]}
          >
            Winning ({activeBids.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Bids List */}
      {displayBids.length === 0 ? (
        <EmptyState
          icon={activeTab === 'all' ? '🎯' : '🏆'}
          title={activeTab === 'all' ? 'No Bids Yet' : 'No Winning Bids'}
          message={
            activeTab === 'all'
              ? 'Start bidding on auctions to see your bids here'
              : "You don't have any winning bids at the moment"
          }
          actionLabel="Browse Auctions"
          onAction={() => navigation.navigate('Home')}
        />
      ) : (
        <FlatList
          data={displayBids}
          keyExtractor={item => item.id}
          renderItem={renderBid}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    fontSize: fonts.sizes.xl,
    color: colors.text,
  },
  title: {
    fontSize: fonts.sizes.xl,
    fontWeight: '700',
    color: colors.text,
  },
  placeholder: {
    width: 40,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: colors.text,
    fontSize: fonts.sizes.xxl,
    fontWeight: '700',
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.xs,
    marginTop: spacing.xs,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xs,
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.md,
  },
  activeTab: {
    backgroundColor: colors.primary,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.md,
    fontWeight: '500',
  },
  activeTabText: {
    color: colors.text,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  bidCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  bidHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  auctionInfo: {
    flexDirection: 'row',
    flex: 1,
    marginRight: spacing.md,
  },
  auctionImage: {
    width: 50,
    height: 50,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  auctionImageContent: {
    width: '100%',
    height: '100%',
  },
  auctionEmoji: {
    fontSize: fonts.sizes.xl,
  },
  auctionDetails: {
    flex: 1,
    marginLeft: spacing.md,
  },
  auctionTitle: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '500',
  },
  bidTime: {
    color: colors.textMuted,
    fontSize: fonts.sizes.xs,
    marginTop: spacing.xs,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
  },
  statusIcon: {
    fontSize: fonts.sizes.sm,
  },
  statusText: {
    fontSize: fonts.sizes.xs,
    fontWeight: '600',
  },
  bidDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bidInfo: {
    alignItems: 'center',
  },
  bidLabel: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.xs,
    marginBottom: spacing.xs,
  },
  bidAmount: {
    color: colors.primary,
    fontSize: fonts.sizes.lg,
    fontWeight: '700',
  },
  currentPrice: {
    color: colors.text,
    fontSize: fonts.sizes.lg,
    fontWeight: '700',
  },
  bidFooter: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'flex-end',
  },
  viewAuction: {
    color: colors.primary,
    fontSize: fonts.sizes.sm,
    fontWeight: '500',
  },
});

export default MyBidsScreen;
