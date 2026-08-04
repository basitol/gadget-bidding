import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, borderRadius } from '../../constants';
import { EmptyState, LoadingScreen, Button } from '../../components';
import { useIsTabRoot } from '../../hooks';
import { auctionService } from '../../services';
import {
  formatCurrency,
  formatRelativeTime,
  formatDateTime,
  getAuctionStatusLabel,
  mediaUrl,
} from '../../utils';
import { Auction } from '../../types';

type MyAuctionsScreenProps = {
  navigation: NativeStackNavigationProp<any>;
};

export const MyAuctionsScreen: React.FC<MyAuctionsScreenProps> = ({
  navigation,
}) => {
  const isTabRoot = useIsTabRoot();
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'ended'>('all');

  const loadAuctions = useCallback(async (nextPage = 1, append = false) => {
    if (append) setIsLoadingMore(true);
    try {
      const response = await auctionService.getMyAuctions(nextPage, 20);
      const batch = response.data || [];
      setAuctions(prev => (append ? [...prev, ...batch] : batch));
      const totalPages =
        (response.pagination as any)?.totalPages ||
        response.pagination?.total_pages ||
        1;
      setPage(nextPage);
      setHasMore(nextPage < totalPages);
    } catch (error) {
      console.error('Failed to load auctions:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadAuctions(1, false);
  }, [loadAuctions]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadAuctions(1, false);
  };

  const handleLoadMore = () => {
    if (isLoading || isLoadingMore || !hasMore) return;
    loadAuctions(page + 1, true);
  };

  const handleAuctionPress = (auction: Auction) => {
    navigation.navigate('AuctionDetail', { auctionId: auction.id });
  };

  const handleCancelAuction = async (auction: Auction) => {
    Alert.alert(
      'Cancel Auction',
      'Are you sure you want to cancel this auction? This action cannot be undone.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await auctionService.cancelAuction(auction.id);
              loadAuctions();
              Alert.alert('Success', 'Auction has been cancelled');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to cancel auction');
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string): string => {
    const statusColors: Record<string, string> = {
      draft: colors.textMuted,
      scheduled: colors.info,
      active: colors.success,
      ended: colors.warning,
      sold: colors.primary,
      cancelled: colors.error,
    };
    return statusColors[status] || colors.textSecondary;
  };

  const getStatusIcon = (status: string): keyof typeof Ionicons.glyphMap => {
    const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
      draft: 'document-text-outline',
      scheduled: 'calendar-outline',
      active: 'flash-outline',
      ended: 'time-outline',
      sold: 'checkmark-circle-outline',
      cancelled: 'close-circle-outline',
    };
    return icons[status] || 'pricetag-outline';
  };

  const filteredAuctions = auctions.filter(auction => {
    if (activeTab === 'all') return true;
    if (activeTab === 'active')
      return ['active', 'scheduled'].includes(auction.status);
    if (activeTab === 'ended')
      return ['ended', 'sold', 'cancelled'].includes(auction.status);
    return true;
  });

  const renderAuction = ({ item }: { item: Auction }) => (
    <TouchableOpacity
      style={styles.auctionCard}
      activeOpacity={0.8}
      onPress={() => handleAuctionPress(item)}
    >
      <View style={styles.auctionHeader}>
        <View style={styles.gadgetInfo}>
          <View style={styles.gadgetImage}>
            {(item as any).gadget?.images?.[0] ? (
              <Image
                source={{ uri: mediaUrl((item as any).gadget.images[0]) }}
                style={styles.gadgetImageContent}
              />
            ) : (
              <Ionicons
                name="phone-portrait-outline"
                size={26}
                color={colors.textMuted}
              />
            )}
          </View>
          <View style={styles.gadgetDetails}>
            <Text style={styles.gadgetTitle} numberOfLines={2}>
              {(item as any).gadget?.title || 'Auction Item'}
            </Text>
            <Text style={styles.auctionTime}>
              Created {formatRelativeTime(item.created_at)}
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(item.status) + '20' },
          ]}
        >
          <Ionicons
            name={getStatusIcon(item.status)}
            size={12}
            color={getStatusColor(item.status)}
          />
          <Text
            style={[styles.statusText, { color: getStatusColor(item.status) }]}
          >
            {getAuctionStatusLabel(item.status)}
          </Text>
        </View>
      </View>

      <View style={styles.auctionStats}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Starting Price</Text>
          <Text style={styles.statValue}>
            {formatCurrency(item.starting_price)}
          </Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Current Price</Text>
          <Text style={[styles.statValue, { color: colors.primary }]}>
            {formatCurrency(item.current_price)}
          </Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Bids</Text>
          <Text style={styles.statValue}>{(item as any).bid_count || 0}</Text>
        </View>
      </View>

      <View style={styles.auctionDates}>
        <View style={styles.dateItem}>
          <Text style={styles.dateLabel}>Starts</Text>
          <Text style={styles.dateValue}>
            {formatDateTime(item.start_time)}
          </Text>
        </View>
        <View style={styles.dateItem}>
          <Text style={styles.dateLabel}>Ends</Text>
          <Text style={styles.dateValue}>{formatDateTime(item.end_time)}</Text>
        </View>
      </View>

      <View style={styles.auctionFooter}>
        {item.status === 'active' && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => handleCancelAuction(item)}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.viewDetails}>View Details →</Text>
      </View>
    </TouchableOpacity>
  );

  if (isLoading) {
    return <LoadingScreen message="Loading your auctions..." />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        {isTabRoot ? (
          <View style={styles.headerSpacer} />
        ) : (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
        )}
        <Text style={styles.title}>My Auctions</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('CreateGadget')}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statsItem}>
          <Text style={styles.statsValue}>{auctions.length}</Text>
          <Text style={styles.statsLabel}>Total</Text>
        </View>
        <View style={styles.statsDivider} />
        <View style={styles.statsItem}>
          <Text style={[styles.statsValue, { color: colors.success }]}>
            {auctions.filter(a => a.status === 'active').length}
          </Text>
          <Text style={styles.statsLabel}>Active</Text>
        </View>
        <View style={styles.statsDivider} />
        <View style={styles.statsItem}>
          <Text style={[styles.statsValue, { color: colors.primary }]}>
            {auctions.filter(a => a.status === 'sold').length}
          </Text>
          <Text style={styles.statsLabel}>Sold</Text>
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
            All
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
            Active
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'ended' ? styles.activeTab : undefined,
          ]}
          onPress={() => setActiveTab('ended')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'ended' ? styles.activeTabText : undefined,
            ]}
          >
            Ended
          </Text>
        </TouchableOpacity>
      </View>

      {/* Auctions List */}
      {filteredAuctions.length === 0 ? (
        <EmptyState
          icon="pricetag-outline"
          title="No Auctions"
          message={
            activeTab === 'all'
              ? "You haven't created any auctions yet"
              : `No ${activeTab} auctions found`
          }
          actionLabel="Create Auction"
          onAction={() => navigation.navigate('CreateGadget')}
        />
      ) : (
        <FlatList
          data={filteredAuctions}
          keyExtractor={item => item.id}
          renderItem={renderAuction}
          contentContainerStyle={styles.listContent}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            isLoadingMore ? (
              <ActivityIndicator
                style={{ marginVertical: spacing.lg }}
                color={colors.primary}
              />
            ) : null
          }
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
  headerSpacer: {
    width: 40,
    height: 40,
  },
  title: {
    fontSize: fonts.sizes.xl,
    fontWeight: '700',
    color: colors.text,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  statsItem: {
    flex: 1,
    alignItems: 'center',
  },
  statsValue: {
    color: colors.text,
    fontSize: fonts.sizes.xxl,
    fontWeight: '700',
  },
  statsLabel: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.xs,
    marginTop: spacing.xs,
  },
  statsDivider: {
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
  auctionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  auctionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  gadgetInfo: {
    flexDirection: 'row',
    flex: 1,
    marginRight: spacing.md,
  },
  gadgetImage: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  gadgetImageContent: {
    width: '100%',
    height: '100%',
  },
  gadgetDetails: {
    flex: 1,
    marginLeft: spacing.md,
  },
  gadgetTitle: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '600',
  },
  auctionTime: {
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
  statusText: {
    fontSize: fonts.sizes.xs,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  auctionStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.xs,
    marginBottom: spacing.xs,
  },
  statValue: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '700',
  },
  auctionDates: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dateItem: {
    flex: 1,
  },
  dateLabel: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.xs,
    marginBottom: spacing.xs,
  },
  dateValue: {
    color: colors.text,
    fontSize: fonts.sizes.sm,
  },
  auctionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.error + '20',
  },
  cancelButtonText: {
    color: colors.error,
    fontSize: fonts.sizes.sm,
    fontWeight: '500',
  },
  viewDetails: {
    color: colors.primary,
    fontSize: fonts.sizes.sm,
    fontWeight: '500',
  },
});

export default MyAuctionsScreen;
