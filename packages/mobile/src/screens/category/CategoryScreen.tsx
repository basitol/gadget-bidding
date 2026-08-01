import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, borderRadius } from '../../constants';
import { AuctionCard, EmptyState, LoadingScreen } from '../../components';
import { auctionService } from '../../services';
import { Auction } from '../../types';

type IoniconName = Extract<keyof typeof Ionicons.glyphMap, string>;

type HomeStackParamList = {
  HomeMain: undefined;
  AuctionDetail: { auctionId: string };
  SearchScreen: undefined;
  Notifications: undefined;
  Category: { category: string; label: string };
};

type CategoryScreenProps = NativeStackScreenProps<
  HomeStackParamList,
  'Category'
>;

export const CategoryScreen: React.FC<CategoryScreenProps> = ({
  navigation,
  route,
}) => {
  const { category, label } = route.params;
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const loadAuctions = useCallback(
    async (pageNum: number, refresh = false) => {
      if (refresh) {
        setIsRefreshing(true);
      } else if (pageNum === 1) {
        setIsLoading(true);
      }

      try {
        const response = await auctionService.getAuctions(
          {
            status: 'active',
            category,
          },
          pageNum,
          20
        );

        if (pageNum === 1) {
          setAuctions(response.data);
        } else {
          setAuctions(prev => [...prev, ...response.data]);
        }

        setHasMore(pageNum < response.pagination.total_pages);
        setPage(pageNum);
      } catch (error) {
        console.error('Failed to load category auctions:', error);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [category]
  );

  useEffect(() => {
    loadAuctions(1);
  }, [loadAuctions]);

  const handleRefresh = () => {
    loadAuctions(1, true);
  };

  const handleLoadMore = () => {
    if (hasMore && !isLoading && !isRefreshing) {
      loadAuctions(page + 1);
    }
  };

  const getCategoryIcon = (cat: string): IoniconName => {
    const icons: Record<string, IoniconName> = {
      smartphones: 'phone-portrait-outline',
      laptops: 'laptop-outline',
      tablets: 'tablet-portrait-outline',
      smartwatches: 'watch-outline',
      gaming_consoles: 'game-controller-outline',
      cameras: 'camera-outline',
      accessories: 'headset-outline',
      audio: 'volume-high-outline',
      tvs: 'tv-outline',
      default: 'cube-outline',
    };
    return icons[cat.toLowerCase()] || icons.default;
  };

  const renderAuction = ({ item }: { item: Auction }) => (
    <AuctionCard
      auction={item}
      variant="list"
      onPress={() =>
        navigation.navigate('AuctionDetail', { auctionId: item.id })
      }
    />
  );

  if (isLoading && auctions.length === 0) {
    return <LoadingScreen message={`Loading ${label} auctions...`} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.titleContainer}>
          <View style={styles.categoryIconWrap}>
            <Ionicons
              name={getCategoryIcon(category)}
              size={22}
              color={colors.primary}
            />
          </View>
          <Text style={styles.title}>{label}</Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          {auctions.length} {auctions.length === 1 ? 'auction' : 'auctions'}{' '}
          found
        </Text>
      </View>

      {auctions.length === 0 ? (
        <EmptyState
          icon={getCategoryIcon(category)}
          title={`No ${label} Auctions`}
          message={`There are no active auctions in ${label} category right now. Check back later!`}
          actionLabel="Browse All"
          onAction={() => navigation.goBack()}
        />
      ) : (
        <FlatList
          data={auctions}
          keyExtractor={item => item.id}
          renderItem={renderAuction}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          ListFooterComponent={
            hasMore && auctions.length > 0 ? (
              <ActivityIndicator
                size="small"
                color={colors.primary}
                style={styles.loadingMore}
              />
            ) : null
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  categoryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: fonts.sizes.xl,
    fontWeight: '700',
    color: colors.text,
  },
  placeholder: {
    width: 40,
  },
  statsBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  statsText: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 100,
  },
  loadingMore: {
    marginVertical: spacing.lg,
  },
});
