import React, { useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import {
  fonts,
  spacing,
  borderRadius,
  GADGET_CATEGORIES,
  ThemeColors,
} from '../../constants';
import { AuctionCard, Card, EmptyState, LoadingScreen } from '../../components';
import { useTheme } from '../../hooks';
import { useAuctionStore, useAuthStore, useWalletStore } from '../../store';
import { formatCompactCurrency } from '../../utils';
import { Auction } from '../../types';

const { width } = Dimensions.get('window');

const HERO_ACCENT_DARK = ['#0B1220', '#060A14', '#030712'];
const HERO_ACCENT_LIGHT = ['#FFFFFF', '#F8FAFF', '#F8FAFC'];

type RootStackParamList = {
  Home: undefined;
  AuctionDetail: { auctionId: string };
  Search: undefined;
  Category: { category: string; label: string };
  Notifications: undefined;
};

type HomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { mode, colors } = useTheme();
  const { user } = useAuthStore();
  const { wallet, fetchWallet } = useWalletStore();
  const {
    auctions,
    hotAuctions,
    endingSoon,
    isLoading,
    isRefreshing,
    fetchAuctions,
    fetchHotAuctions,
    fetchEndingSoon,
    refresh,
  } = useAuctionStore();

  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await Promise.all([
      fetchAuctions({ status: 'active' }),
      fetchHotAuctions(),
      fetchEndingSoon(),
      fetchWallet(),
    ]);
  };

  const handleRefresh = useCallback(async () => {
    await refresh();
    await fetchWallet();
  }, [refresh, fetchWallet]);

  const handleAuctionPress = (auction: Auction) => {
    navigation.navigate('AuctionDetail', { auctionId: auction.id });
  };

  const handleCategoryPress = (category: { id: string; label: string }) => {
    navigation.navigate('Category', {
      category: category.id,
      label: category.label,
    });
  };

  if (isLoading && auctions.length === 0) {
    return <LoadingScreen message="Loading auctions..." />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.heroWrap}>
          <LinearGradient
            colors={
              mode === 'dark'
                ? HERO_ACCENT_DARK
                : HERO_ACCENT_LIGHT
            }
            style={styles.hero}
          >
            <View style={styles.heroGlowTop} />
            <View style={styles.heroGlowBottom} />

            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.logoSmall}>
                  <Text style={styles.logoSmallText}>GB</Text>
                </View>
                <View>
                  <Text style={styles.kicker}>Lagos, Nigeria</Text>
                  <Text style={styles.greeting}>
                    Good {new Date().getHours() < 12 ? 'morning' : 'evening'},
                    {' '}
                    {user?.full_name?.split(' ')[0] || 'there'}
                  </Text>
                </View>
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  onPress={() => navigation.navigate('Search')}
                  style={styles.headerIconButton}
                  activeOpacity={0.8}
                >
                  <Ionicons name="search-outline" size={20} color={colors.text} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => navigation.navigate('Notifications')}
                  style={styles.headerIconButton}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="notifications-outline"
                    size={20}
                    color={colors.text}
                  />
                  <View style={styles.notificationBadge} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.heroCopy}>
              <Text style={styles.heroHeadline}>
                Bid on premium gadgets with confidence.
              </Text>
              <Text style={styles.heroSubtitle}>
                Clean auctions, fast bidding, and wallet-backed security in one place.
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => navigation.navigate('Wallet')}
            >
              <LinearGradient
                colors={mode === 'dark' ? ['#2563EB', '#1D4ED8'] : ['#2563EB', '#0EA5E9']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.walletCard}
              >
                <View>
                  <Text style={styles.walletLabel}>Wallet balance</Text>
                  <Text style={styles.walletBalance}>
                    {formatCompactCurrency(wallet?.balance || 0)}
                  </Text>
                  <Text style={styles.walletHint}>Tap to fund or withdraw</Text>
                </View>
                <View style={styles.walletIcon}>
                  <Ionicons name="wallet-outline" size={24} color="#FFFFFF" />
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => navigation.navigate('Search')}
              activeOpacity={0.85}
              style={styles.searchOuter}
            >
              <Card style={styles.searchCard}>
                <View style={styles.searchInner}>
                  <Ionicons name="search-outline" size={18} color={colors.textMuted} />
                  <Text style={styles.searchPlaceholder}>
                    Search gadgets, brands, models...
                  </Text>
                </View>
              </Card>
            </TouchableOpacity>

            <View style={styles.metricsRow}>
              <Card style={styles.metricCard}>
                <Ionicons name="flame-outline" size={18} color={colors.primary} />
                <Text style={styles.metricValue}>{hotAuctions.length}</Text>
                <Text style={styles.metricLabel}>Hot live</Text>
              </Card>
              <Card style={styles.metricCard}>
                <Ionicons name="time-outline" size={18} color={colors.primary} />
                <Text style={styles.metricValue}>{endingSoon.length}</Text>
                <Text style={styles.metricLabel}>Ending soon</Text>
              </Card>
              <Card style={styles.metricCard}>
                <Ionicons name="grid-outline" size={18} color={colors.primary} />
                <Text style={styles.metricValue}>{auctions.length}</Text>
                <Text style={styles.metricLabel}>Live auctions</Text>
              </Card>
            </View>
          </LinearGradient>
        </View>

        {/* Categories */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>Browse</Text>
              <Text style={styles.sectionTitle}>Categories</Text>
            </View>
            <TouchableOpacity>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesContainer}
          >
            {GADGET_CATEGORIES.map(category => (
              <TouchableOpacity
                key={category.id}
                onPress={() => handleCategoryPress(category)}
                activeOpacity={0.7}
              >
                <Card style={styles.categoryItem}>
                  <View style={styles.categoryIcon}>
                    <Ionicons name={category.icon as any} size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.categoryLabel}>{category.label}</Text>
                </Card>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Hot Auctions */}
        {hotAuctions.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>Featured</Text>
                <Text style={styles.sectionTitle}>Hot Auctions</Text>
              </View>
              <TouchableOpacity>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={hotAuctions}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.featuredList}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <AuctionCard
                  auction={item}
                  onPress={() => handleAuctionPress(item)}
                  variant="featured"
                />
              )}
            />
          </View>
        )}

        {/* Ending Soon */}
        {endingSoon.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>Urgent</Text>
                <Text style={styles.sectionTitle}>Ending Soon</Text>
              </View>
              <TouchableOpacity>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={endingSoon}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <View style={styles.listItemWrapper}>
                  <AuctionCard
                    auction={item}
                    onPress={() => handleAuctionPress(item)}
                    variant="list"
                  />
                </View>
              )}
            />
          </View>
        )}

        {/* All Auctions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>Discover</Text>
              <Text style={styles.sectionTitle}>All Auctions</Text>
            </View>
            <TouchableOpacity>
              <Text style={styles.seeAll}>Filter</Text>
            </TouchableOpacity>
          </View>
          {auctions.length === 0 ? (
            <EmptyState
              icon="search-outline"
              title="No Auctions Found"
              message="There are no active auctions at the moment. Check back later!"
            />
          ) : (
            <View style={styles.gridContainer}>
              {auctions.map(auction => (
                <AuctionCard
                  key={auction.id}
                  auction={auction}
                  onPress={() => handleAuctionPress(auction)}
                  variant="grid"
                />
              ))}
            </View>
          )}
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors, mode: 'light' | 'dark') =>
  StyleSheet.create({
  container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    heroWrap: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    hero: {
      borderRadius: borderRadius.xxl,
      padding: spacing.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
  heroGlowTop: {
      position: 'absolute',
      top: -60,
      right: -40,
      width: 180,
      height: 180,
      borderRadius: 90,
      backgroundColor:
        mode === 'dark' ? 'rgba(37,99,235,0.10)' : 'rgba(37,99,235,0.06)',
    },
    heroGlowBottom: {
      position: 'absolute',
      bottom: -70,
      left: -50,
      width: 220,
      height: 220,
      borderRadius: 110,
      backgroundColor:
        mode === 'dark' ? 'rgba(14,165,233,0.06)' : 'rgba(14,165,233,0.04)',
    },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  logoSmall: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: mode === 'dark' ? colors.surface : colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoSmallText: {
    fontSize: 15,
    fontFamily: fonts.extraBold,
    color: colors.text,
    letterSpacing: -1,
  },
  kicker: {
    color: colors.textMuted,
    fontSize: fonts.sizes.xs,
    fontFamily: fonts.medium,
    marginBottom: 4,
  },
  greeting: {
    fontSize: 24,
    fontFamily: fonts.extraBold,
    color: colors.text,
    letterSpacing: -1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerIconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: mode === 'dark' ? colors.surface : colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.border,
  },
  notificationBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.error,
    borderWidth: 2,
    borderColor: mode === 'dark' ? colors.surface : colors.surface,
  },
  heroCopy: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  heroHeadline: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 34,
    fontFamily: fonts.extraBold,
    letterSpacing: -1.2,
  },
  heroSubtitle: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: fonts.sizes.md,
    lineHeight: 22,
    fontFamily: fonts.regular,
    maxWidth: 320,
  },
  walletCard: {
    borderRadius: borderRadius.xxl,
    padding: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  walletLabel: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: fonts.sizes.sm,
    fontFamily: fonts.medium,
    marginBottom: 6,
  },
  walletBalance: {
    color: '#FFFFFF',
    fontSize: 34,
    fontFamily: fonts.extraBold,
    letterSpacing: -1.3,
  },
  walletHint: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.82)',
    fontSize: fonts.sizes.xs,
    fontFamily: fonts.medium,
  },
  walletIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchOuter: {
    marginTop: spacing.lg,
  },
  searchCard: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
  },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  searchPlaceholder: {
    color: colors.textMuted,
    fontSize: fonts.sizes.md,
    fontFamily: fonts.medium,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionEyebrow: {
    color: colors.textMuted,
    fontSize: fonts.sizes.xs,
    fontFamily: fonts.medium,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.text,
    letterSpacing: -0.8,
  },
  seeAll: {
    color: colors.primary,
    fontSize: fonts.sizes.md,
    fontFamily: fonts.semiBold,
  },
  categoriesContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  categoryItem: {
    alignItems: 'center',
    width: 92,
    minHeight: 118,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    justifyContent: 'space-between',
  },
  categoryIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: mode === 'dark' ? colors.backgroundLight : colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryLabel: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.xs,
    lineHeight: 14,
    textAlign: 'center',
    fontFamily: fonts.semiBold,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  metricCard: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'flex-start',
    gap: 4,
    borderRadius: borderRadius.xl,
  },
  metricValue: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 18,
    letterSpacing: -0.6,
  },
  metricLabel: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: fonts.sizes.xs,
  },
  featuredList: {
    paddingHorizontal: spacing.lg,
  },
  horizontalList: {
    paddingHorizontal: spacing.lg,
  },
  listItemWrapper: {
    width: width - spacing.lg * 2 - spacing.md,
    marginRight: spacing.md,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    justifyContent: 'space-between',
  },
  bottomPadding: {
    height: 100,
  },
  });
