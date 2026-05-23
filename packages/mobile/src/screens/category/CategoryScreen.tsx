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
import { colors, fonts, spacing, borderRadius } from '../../constants';
import { AuctionCard, EmptyState, LoadingScreen } from '../../components';
import { auctionService } from '../../services';
import { Auction } from '../../types';

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
        const response = await auctionService.getAuctions({
          status: 'active',
          category,
          page: pageNum,
          limit: 20,
        });

        if (pageNum === 1) {
          setAuctions(response.data);
        } else {
          setAuctions(prev => [...prev, ...response.data]);
        }

        setHasMore(response.pagination.has_next_page);
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

  const getCategoryEmoji = (cat: string): string => {
    const emojis: Record<string, string> = {
      smartphones: '📱',
      laptops: '💻',
      tablets: '📲',
      smartwatches: '⌚',
      gaming_consoles: '🎮',
      cameras: '📷',
      accessories: '🎧',
      audio: '🔊',
      tvs: '📺',
      default: '📦',
    };
    return emojis[cat.toLowerCase()] || emojis.default;
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
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.titleContainer}>
          <Text style={styles.categoryEmoji}>{getCategoryEmoji(category)}</Text>
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
          icon={getCategoryEmoji(category)}
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
  backIcon: {
    fontSize: fonts.sizes.xl,
    color: colors.text,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  categoryEmoji: {
    fontSize: fonts.sizes.xxl,
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
