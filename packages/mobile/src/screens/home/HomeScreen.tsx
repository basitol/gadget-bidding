import React, { useEffect, useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
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
import {
  EmptyState,
  LoadingScreen,
  BrandLogo,
  LiveAuctionCard,
  QuickActionGrid,
  QuickAction,
} from '../../components';
import { useTheme } from '../../hooks';
import { useAuctionStore, useAuthStore, useWalletStore } from '../../store';
import { formatCurrency, formatCompactCurrency } from '../../utils';
import { Auction } from '../../types';

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

const LIGHT_CATEGORIES = [
  { id: 'all', label: 'All', icon: 'apps-outline' as const },
  ...GADGET_CATEGORIES.slice(0, 4).map(c => ({
    id: c.id,
    label: c.label.replace('Smartphones', 'Phones').replace('Smartwatches', 'Watches'),
    icon: c.icon as keyof typeof Ionicons.glyphMap,
  })),
];

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { mode, colors } = useTheme();
  const { user } = useAuthStore();
  const { wallet, fetchWallet } = useWalletStore();
  const {
    auctions,
    hotAuctions,
    isLoading,
    isRefreshing,
    fetchAuctions,
    fetchHotAuctions,
    fetchEndingSoon,
    refresh,
  } = useAuctionStore();

  const [selectedCategory, setSelectedCategory] = useState('all');
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);

  const liveAuctions = hotAuctions.length > 0 ? hotAuctions : auctions;
  const firstName = user?.full_name?.split(' ')[0] || 'there';
  const initials = user?.full_name
    ? user.full_name
        .split(' ')
        .map(n => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'GB';

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

  const navigateTab = (tab: string, screen?: string) => {
    navigation.getParent()?.navigate(tab as never, screen ? { screen } : undefined);
  };

  const quickActions: QuickAction[] = [
    {
      id: 'browse',
      title: 'Browse Auctions',
      subtitle: `${auctions.length} live now`,
      icon: 'hammer-outline',
      color: colors.primary,
      live: auctions.length > 0,
      onPress: () => navigation.navigate('Search'),
    },
    {
      id: 'bids',
      title: 'My Bids',
      subtitle: 'Track active bids',
      icon: 'hand-left-outline',
      color: colors.warning,
      onPress: () => navigateTab('Profile', 'MyBids'),
    },
    {
      id: 'orders',
      title: 'My Orders',
      subtitle: 'Awaiting delivery',
      icon: 'cube-outline',
      color: colors.success,
      onPress: () => navigateTab('Profile', 'Orders'),
    },
    {
      id: 'notifications',
      title: 'Notifications',
      subtitle: 'Stay in the loop',
      icon: 'notifications-outline',
      color: colors.accent,
      onPress: () => navigation.navigate('Notifications'),
    },
  ];

  if (isLoading && auctions.length === 0) {
    return <LoadingScreen message="Loading auctions..." />;
  }

  if (mode === 'dark') {
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
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.darkHeader}>
            <BrandLogo showTagline size="sm" />
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => navigation.navigate('Notifications')}
              >
                <Ionicons name="notifications-outline" size={20} color={colors.text} />
                <View style={styles.notifDot} />
              </TouchableOpacity>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            </View>
          </View>

          <View style={styles.greetingRow}>
            <Text style={styles.greeting}>
              Good {new Date().getHours() < 12 ? 'morning' : 'evening'} 👋{' '}
              {user?.full_name || firstName}
            </Text>
            {user?.is_verified && (
              <View style={styles.verifiedPill}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            )}
          </View>

          <View style={styles.darkWalletCard}>
            <View style={styles.gridPattern} />
            <Text style={styles.walletLabel}>WALLET BALANCE</Text>
            <Text style={styles.walletAmount}>
              {formatCurrency(wallet?.balance || 0)}
            </Text>
            <View style={styles.ngnBadge}>
              <Text style={styles.ngnBadgeText}>NGN Account</Text>
            </View>
            {(wallet?.held_balance || 0) > 0 && (
              <View style={styles.escrowRow}>
                <Ionicons name="lock-closed-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.escrowText}>
                  Escrow Hold: {formatCurrency(wallet?.held_balance || 0)}
                </Text>
              </View>
            )}
            <View style={styles.walletActions}>
              <TouchableOpacity
                style={styles.fundBtn}
                onPress={() => navigateTab('Wallet')}
              >
                <Ionicons name="add" size={18} color="#FFFFFF" />
                <Text style={styles.fundBtnText}>Fund Wallet</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.withdrawBtn}
                onPress={() => navigateTab('Wallet')}
              >
                <Ionicons name="arrow-up-outline" size={18} color={colors.text} />
                <Text style={styles.withdrawBtnText}>Withdraw</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.socialProof}>
            <Text style={styles.socialTitle}>
              50,000+ Nigerians bidding right now
            </Text>
            <Text style={styles.socialSubtitle}>
              Over {formatCompactCurrency(6200000000)} in gadgets sold since 2022
            </Text>
            <View style={styles.ticker}>
              <Text style={styles.tickerText} numberOfLines={1}>
                iPhone 15 Pro sold for ₦680K · MacBook Air M2 sold for ₦920K
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitleDark}>Quick Actions</Text>
          <QuickActionGrid actions={quickActions} />

          {liveAuctions.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitleDark}>Live Now</Text>
              {liveAuctions.slice(0, 2).map(auction => (
                <LiveAuctionCard
                  key={auction.id}
                  auction={auction}
                  onPress={() => handleAuctionPress(auction)}
                />
              ))}
            </View>
          )}

          <View style={styles.bottomPadding} />
        </ScrollView>
      </SafeAreaView>
    );
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
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.lightHeader}>
          <BrandLogo size="sm" />
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => navigation.navigate('Search')}
            >
              <Ionicons name="search-outline" size={20} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => navigation.navigate('Notifications')}
            >
              <Ionicons name="notifications-outline" size={20} color={colors.text} />
              <View style={styles.notifDotBlue} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.livePillRow}>
          <View style={styles.orangePill}>
            <View style={styles.orangeDot} />
            <Text style={styles.orangePillText}>
              {auctions.length} auctions live now
            </Text>
          </View>
        </View>

        <Text style={styles.lightHeadline}>
          Nigeria's #1 Gadget{'\n'}Auction Marketplace
        </Text>

        <View style={styles.statsRow}>
          {[
            { value: '50K+', label: 'Bidders' },
            { value: '₦6.2B', label: 'Sold' },
            { value: '4.9★', label: 'Rating' },
          ].map(stat => (
            <View key={stat.label} style={styles.statPill}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        >
          {LIGHT_CATEGORIES.map(cat => {
            const active = selectedCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => {
                  setSelectedCategory(cat.id);
                  if (cat.id !== 'all') {
                    navigation.navigate('Category', {
                      category: cat.id,
                      label: cat.label,
                    });
                  }
                }}
              >
                <Ionicons
                  name={cat.icon}
                  size={16}
                  color={active ? '#FFFFFF' : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.categoryChipText,
                    active && styles.categoryChipTextActive,
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitleLight}>Live Auctions</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Search')}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>

        {liveAuctions.length === 0 ? (
          <EmptyState
            icon="hammer-outline"
            title="No Live Auctions"
            message="Check back soon for new gadget auctions."
          />
        ) : (
          liveAuctions.slice(0, 3).map(auction => (
            <LiveAuctionCard
              key={auction.id}
              auction={auction}
              onPress={() => handleAuctionPress(auction)}
            />
          ))
        )}

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => navigation.navigate('Search')}
        >
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.browseCta}
          >
            <Ionicons name="hammer-outline" size={20} color="#FFFFFF" />
            <Text style={styles.browseCtaText}>Browse Live Auctions</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>

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
    scrollContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    lightHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    darkHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    iconBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: mode === 'dark' ? colors.surface : colors.backgroundLight,
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    notifDot: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.error,
    },
    notifDotBlue: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary + '22',
      borderWidth: 1,
      borderColor: colors.primary + '44',
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: {
      color: colors.primary,
      fontFamily: fonts.bold,
      fontSize: fonts.sizes.sm,
    },
    greetingRow: {
      marginBottom: spacing.lg,
    },
    greeting: {
      color: colors.text,
      fontSize: 24,
      fontFamily: fonts.extraBold,
      letterSpacing: -0.8,
      marginBottom: spacing.sm,
    },
    verifiedPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
      backgroundColor: colors.success + '18',
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: borderRadius.full,
    },
    verifiedText: {
      color: colors.success,
      fontSize: fonts.sizes.xs,
      fontFamily: fonts.semiBold,
    },
    darkWalletCard: {
      backgroundColor: colors.surface,
      borderRadius: borderRadius.xxl,
      padding: spacing.xl,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    gridPattern: {
      ...StyleSheet.absoluteFillObject,
      opacity: 0.06,
      backgroundColor: colors.primary,
    },
    walletLabel: {
      color: colors.textMuted,
      fontSize: fonts.sizes.xs,
      fontFamily: fonts.semiBold,
      letterSpacing: 1,
      marginBottom: spacing.xs,
    },
    walletAmount: {
      color: colors.text,
      fontSize: 36,
      fontFamily: fonts.extraBold,
      letterSpacing: -1.2,
      marginBottom: spacing.sm,
    },
    ngnBadge: {
      alignSelf: 'flex-start',
      backgroundColor: colors.primary + '18',
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: borderRadius.full,
      marginBottom: spacing.md,
    },
    ngnBadgeText: {
      color: colors.primaryLight,
      fontSize: fonts.sizes.xs,
      fontFamily: fonts.semiBold,
    },
    escrowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginBottom: spacing.lg,
    },
    escrowText: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.medium,
    },
    walletActions: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    fundBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      backgroundColor: colors.primary,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
    },
    fundBtnText: {
      color: '#FFFFFF',
      fontFamily: fonts.semiBold,
      fontSize: fonts.sizes.sm,
    },
    withdrawBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      backgroundColor: colors.surfaceLight,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    withdrawBtnText: {
      color: colors.text,
      fontFamily: fonts.semiBold,
      fontSize: fonts.sizes.sm,
    },
    socialProof: {
      backgroundColor: colors.surface,
      borderRadius: borderRadius.xl,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.xl,
    },
    socialTitle: {
      color: colors.text,
      fontFamily: fonts.bold,
      fontSize: fonts.sizes.md,
      marginBottom: 4,
    },
    socialSubtitle: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.medium,
      marginBottom: spacing.md,
    },
    ticker: {
      backgroundColor: colors.backgroundLight,
      borderRadius: borderRadius.lg,
      padding: spacing.sm,
    },
    tickerText: {
      color: colors.textMuted,
      fontSize: fonts.sizes.xs,
      fontFamily: fonts.medium,
    },
    sectionTitleDark: {
      color: colors.text,
      fontSize: fonts.sizes.xl,
      fontFamily: fonts.bold,
      marginBottom: spacing.md,
      letterSpacing: -0.5,
    },
    section: {
      marginTop: spacing.xl,
    },
    livePillRow: {
      marginBottom: spacing.md,
    },
    orangePill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: spacing.xs,
      backgroundColor: colors.live + '18',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: colors.live + '33',
    },
    orangeDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.live,
    },
    orangePillText: {
      color: colors.live,
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.semiBold,
    },
    lightHeadline: {
      color: colors.text,
      fontSize: 34,
      lineHeight: 38,
      fontFamily: fonts.extraBold,
      letterSpacing: -1.2,
      marginBottom: spacing.lg,
    },
    statsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.xl,
    },
    statPill: {
      flex: 1,
      backgroundColor: colors.backgroundLight,
      borderRadius: borderRadius.xl,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    statValue: {
      color: colors.text,
      fontFamily: fonts.bold,
      fontSize: fonts.sizes.md,
    },
    statLabel: {
      color: colors.textMuted,
      fontSize: fonts.sizes.xs,
      fontFamily: fonts.medium,
      marginTop: 2,
    },
    categoryRow: {
      gap: spacing.sm,
      paddingBottom: spacing.xs,
      marginBottom: spacing.xl,
    },
    categoryChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.full,
      backgroundColor: colors.backgroundLight,
      borderWidth: 1,
      borderColor: colors.border,
    },
    categoryChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    categoryChipText: {
      color: colors.textSecondary,
      fontSize: fonts.sizes.sm,
      fontFamily: fonts.semiBold,
    },
    categoryChipTextActive: {
      color: '#FFFFFF',
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    sectionTitleLight: {
      color: colors.text,
      fontSize: 22,
      fontFamily: fonts.bold,
      letterSpacing: -0.5,
    },
    seeAll: {
      color: colors.primary,
      fontSize: fonts.sizes.md,
      fontFamily: fonts.semiBold,
    },
    browseCta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.lg,
      borderRadius: borderRadius.xl,
      marginTop: spacing.md,
    },
    browseCtaText: {
      color: '#FFFFFF',
      fontSize: fonts.sizes.lg,
      fontFamily: fonts.bold,
      flex: 1,
      textAlign: 'center',
    },
    bottomPadding: {
      height: 110,
    },
  });
