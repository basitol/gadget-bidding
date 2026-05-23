import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, borderRadius } from '../../constants';
import { AuctionCard, EmptyState } from '../../components';
import { auctionService } from '../../services';
import { Auction } from '../../types';
import { debounce } from '../../utils';

type SearchScreenProps = {
  navigation: NativeStackNavigationProp<any>;
};

const CATEGORIES = [
  { id: 'smartphones', label: 'Smartphones', icon: 'phone-portrait-outline' },
  { id: 'laptops', label: 'Laptops', icon: 'laptop-outline' },
  { id: 'tablets', label: 'Tablets', icon: 'tablet-portrait-outline' },
  { id: 'gaming', label: 'Gaming', icon: 'game-controller-outline' },
  { id: 'audio', label: 'Audio', icon: 'headset-outline' },
  { id: 'wearables', label: 'Wearables', icon: 'watch-outline' },
  { id: 'cameras', label: 'Cameras', icon: 'camera-outline' },
  { id: 'accessories', label: 'Accessories', icon: 'hardware-chip-outline' },
];

const RECENT_SEARCHES_KEY = 'recent_searches';

export const SearchScreen: React.FC<SearchScreenProps> = ({ navigation }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<Auction[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Debounced search function
  const performSearch = useCallback(
    debounce(async (query: string) => {
      if (!query.trim()) {
        setResults([]);
        setHasSearched(false);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const response = await auctionService.searchAuctions(query.trim());
        setResults(response.data || []);
        setHasSearched(true);

        // Add to recent searches
        setRecentSearches(prev => {
          const filtered = prev.filter(
            s => s.toLowerCase() !== query.toLowerCase()
          );
          return [query, ...filtered].slice(0, 5);
        });
      } catch (error) {
        console.error('Search failed:', error);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 500),
    []
  );

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    performSearch(text);
  };

  const handleCategoryPress = (category: string, label: string) => {
    navigation.navigate('Category', { category, label });
  };

  const handleRecentSearchPress = (query: string) => {
    setSearchQuery(query);
    performSearch(query);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setResults([]);
    setHasSearched(false);
  };

  const handleAuctionPress = (auction: Auction) => {
    navigation.navigate('AuctionDetail', { auctionId: auction.id });
  };

  const renderCategory = ({ item }: { item: (typeof CATEGORIES)[0] }) => (
    <TouchableOpacity
      style={styles.categoryItem}
      activeOpacity={0.7}
      onPress={() => handleCategoryPress(item.id, item.label)}
    >
      <View style={styles.categoryIcon}>
        <Ionicons name={item.icon as any} size={18} color={colors.text} />
      </View>
      <Text style={styles.categoryLabel}>{item.label}</Text>
    </TouchableOpacity>
  );

  const renderAuction = ({ item }: { item: Auction }) => (
    <AuctionCard
      auction={item}
      variant="list"
      onPress={() => handleAuctionPress(item)}
    />
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Search Header */}
      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={handleSearchChange}
            placeholder="Search gadgets, brands, models..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={handleClearSearch}
              style={styles.clearButton}
            >
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Loading Indicator */}
      {isSearching && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      )}

      {/* Search Results */}
      {hasSearched && !isSearching ? (
        results.length > 0 ? (
          <FlatList
            data={results}
            keyExtractor={item => item.id}
            renderItem={renderAuction}
            contentContainerStyle={styles.resultsContent}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <Text style={styles.resultsCount}>
                {results.length} result{results.length !== 1 ? 's' : ''} found
              </Text>
            }
          />
        ) : (
          <EmptyState
            icon="search-outline"
            title="No Results Found"
            message={`We couldn't find any auctions matching "${searchQuery}". Try a different search term.`}
          />
        )
      ) : (
        <FlatList
          data={[]}
          keyExtractor={() => 'content'}
          renderItem={null}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* Recent Searches */}
              {recentSearches.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Recent Searches</Text>
                  <View style={styles.recentSearches}>
                    {recentSearches.map((search, index) => (
                      <TouchableOpacity
                        key={index}
                        style={styles.recentSearchItem}
                        onPress={() => handleRecentSearchPress(search)}
                      >
                        <Ionicons
                          name="time-outline"
                          size={16}
                          color={colors.textSecondary}
                        />
                        <Text style={styles.recentSearchText}>{search}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Categories */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Browse Categories</Text>
                <View style={styles.categoriesGrid}>
                  {CATEGORIES.map(category => (
                    <TouchableOpacity
                      key={category.id}
                      style={styles.categoryItem}
                      activeOpacity={0.7}
                      onPress={() =>
                        handleCategoryPress(category.id, category.label)
                      }
                    >
                      <View style={styles.categoryIcon}>
                        <Ionicons name={category.icon as any} size={18} color={colors.text} />
                      </View>
                      <Text style={styles.categoryLabel}>{category.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Popular Searches */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Popular Searches</Text>
                <View style={styles.popularSearches}>
                  {[
                    'iPhone 15',
                    'MacBook Pro',
                    'Samsung Galaxy',
                    'AirPods',
                    'PlayStation 5',
                  ].map((term, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.popularSearchItem}
                      onPress={() => handleRecentSearchPress(term)}
                    >
                      <Text style={styles.popularSearchText}>{term}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          }
          contentContainerStyle={styles.browseContent}
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    height: 50,
  },
  searchIcon: {
    fontSize: fonts.sizes.lg,
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: fonts.sizes.md,
    paddingVertical: spacing.sm,
  },
  clearButton: {
    padding: spacing.xs,
  },
  clearIcon: {
    color: colors.textMuted,
    fontSize: fonts.sizes.md,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
  },
  resultsContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  resultsCount: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    marginBottom: spacing.md,
  },
  browseContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
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
  recentSearches: {
    gap: spacing.sm,
  },
  recentSearchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  recentSearchIcon: {
    fontSize: fonts.sizes.md,
  },
  recentSearchText: {
    color: colors.text,
    fontSize: fonts.sizes.md,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  categoryItem: {
    width: '22%',
    alignItems: 'center',
  },
  categoryIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  categoryEmoji: {
    fontSize: fonts.sizes.xxl,
  },
  categoryLabel: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.xs,
    textAlign: 'center',
  },
  popularSearches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  popularSearchItem: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  popularSearchText: {
    color: colors.text,
    fontSize: fonts.sizes.sm,
  },
});

export default SearchScreen;
