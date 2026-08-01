import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, borderRadius, shadows } from '../../constants';
import { Button } from '../../components';
import {
  useAuthStore,
  useSellerDashboardStore,
  useWalletStore,
} from '../../store';
import { auctionService, orderService } from '../../services';
import { formatCurrency, formatDate } from '../../utils';

type ProfileScreenProps = {
  navigation: any;
};

type MenuItem = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
};

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ navigation }) => {
  const { user, interfaceType, logout } = useAuthStore();
  const { wallet, fetchWallet } = useWalletStore();
  const { dashboard, fetchDashboard } = useSellerDashboardStore();
  const isSeller = interfaceType === 'seller';
  const [activeCount, setActiveCount] = useState(0);
  const [soldCount, setSoldCount] = useState(0);
  const [buyerWonCount, setBuyerWonCount] = useState(0);
  const [buyerActiveBids, setBuyerActiveBids] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      await fetchWallet();

      if (isSeller) {
        await fetchDashboard(false);
      } else {
        const [statsRes, bidsRes] = await Promise.all([
          orderService.getOrderStats(),
          auctionService.getMyBids(1, 50),
        ]);
        setBuyerWonCount(statsRes.data?.completedOrders ?? 0);
        const bids = bidsRes.data || [];
        setBuyerActiveBids(
          bids.filter((b: { status?: string }) => b.status === 'active').length
        );
      }
    } catch (error) {
      console.error('Failed to load profile stats:', error);
    }
  }, [fetchDashboard, fetchWallet, isSeller]);

  React.useEffect(() => {
    if (!isSeller || !dashboard) return;
    setActiveCount(dashboard.stats.active_auctions);
    setSoldCount(dashboard.stats.sold_orders);
  }, [dashboard, isSeller]);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    if (isSeller) {
      await Promise.all([fetchWallet(), fetchDashboard(true)]);
    } else {
      await loadStats();
    }
    setRefreshing(false);
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  const menuItems: MenuItem[] = useMemo(() => {
    if (isSeller) {
      return [
        {
          icon: 'pricetag-outline',
          title: 'My Auctions',
          subtitle: 'Live, scheduled, and ended listings',
          onPress: () => navigation.navigate('Auctions'),
        },
        {
          icon: 'bag-handle-outline',
          title: 'Sales Orders',
          subtitle: 'Track sold items and shipments',
          onPress: () => navigation.navigate('Sales'),
        },
        {
          icon: 'wallet-outline',
          title: 'Wallet & Payouts',
          subtitle: formatCurrency(wallet?.balance || 0),
          onPress: () => navigation.navigate('Wallet'),
        },
        {
          icon: 'add-circle-outline',
          title: 'List a Gadget',
          subtitle: 'Create a new listing',
          onPress: () => navigation.navigate('CreateGadget'),
        },
        {
          icon: 'settings-outline',
          title: 'Settings',
          subtitle: 'Account, alerts, and preferences',
          onPress: () => navigation.navigate('Settings'),
        },
        {
          icon: 'chatbubbles-outline',
          title: 'Help & Support',
          subtitle: 'Chat with GadgetBid support',
          onPress: () => navigation.navigate('SupportChat'),
        },
      ];
    }

    return [
      {
        icon: 'bag-outline',
        title: 'My Orders',
        subtitle: 'View your purchase history',
        onPress: () => navigation.navigate('Orders'),
      },
      {
        icon: 'medal-outline',
        title: 'My Bids',
        subtitle: 'Track your active bids',
        onPress: () => navigation.navigate('MyBids'),
      },
      {
        icon: 'wallet-outline',
        title: 'Wallet',
        subtitle: formatCurrency(wallet?.balance || 0),
        onPress: () => navigation.navigate('Wallet'),
      },
      {
        icon: 'settings-outline',
        title: 'Settings',
        subtitle: 'App preferences',
        onPress: () => navigation.navigate('Settings'),
      },
      {
        icon: 'help-circle-outline',
        title: 'Help & Support',
        subtitle: 'Get assistance',
        onPress: () =>
          Alert.alert('Help', 'Email support@gadgetbid.ng for help.'),
      },
    ];
  }, [isSeller, navigation, wallet?.balance]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
          <TouchableOpacity
            style={styles.iconButton}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Settings')}
          >
            <Ionicons name="settings-outline" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.full_name?.[0]?.toUpperCase() || '?'}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.full_name || 'User'}</Text>
            <Text style={styles.userPhone}>{user?.phone_number}</Text>
            <View style={styles.roleBadge}>
              <Ionicons
                name={isSeller ? 'storefront-outline' : 'cart-outline'}
                size={12}
                color={colors.primary}
              />
              <Text style={styles.roleBadgeText}>
                {isSeller ? 'Seller account' : 'Buyer account'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.statsContainer}>
          {isSeller ? (
            <>
              <TouchableOpacity
                style={styles.statItem}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('Auctions')}
              >
                <Text style={styles.statValue}>{activeCount}</Text>
                <Text style={styles.statLabel}>Active</Text>
              </TouchableOpacity>
              <View style={styles.statDivider} />
              <TouchableOpacity
                style={styles.statItem}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('Sales')}
              >
                <Text style={styles.statValue}>{soldCount}</Text>
                <Text style={styles.statLabel}>Sold</Text>
              </TouchableOpacity>
              <View style={styles.statDivider} />
              <TouchableOpacity
                style={styles.statItem}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('Wallet')}
              >
                <Text style={styles.statValue}>
                  {formatCurrency(wallet?.balance || 0)}
                </Text>
                <Text style={styles.statLabel}>Wallet</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{buyerWonCount}</Text>
                <Text style={styles.statLabel}>Won</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{buyerActiveBids}</Text>
                <Text style={styles.statLabel}>Active Bids</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {formatCurrency(wallet?.balance || 0)}
                </Text>
                <Text style={styles.statLabel}>Wallet</Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.verificationCard}>
          <View style={styles.verificationIcon}>
            <Ionicons
              name={
                user?.is_verified
                  ? 'checkmark-circle-outline'
                  : 'alert-circle-outline'
              }
              size={22}
              color={user?.is_verified ? colors.success : colors.warning}
            />
          </View>
          <View style={styles.verificationInfo}>
            <Text style={styles.verificationTitle}>
              {user?.is_verified ? 'Verified Account' : 'Verify Your Account'}
            </Text>
            <Text style={styles.verificationSubtitle}>
              {user?.is_verified
                ? isSeller
                  ? 'Ready to list and sell gadgets'
                  : 'Your account is fully verified'
                : 'Complete verification to unlock all features'}
            </Text>
          </View>
        </View>

        <View style={styles.menuContainer}>
          {menuItems.map(item => (
            <TouchableOpacity
              key={item.title}
              style={styles.menuItem}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <View style={styles.menuIcon}>
                <Ionicons name={item.icon} size={20} color={colors.text} />
              </View>
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>{item.title}</Text>
                <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textMuted}
              />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.logoutContainer}>
          <Button
            title="Logout"
            onPress={handleLogout}
            variant="outline"
            fullWidth
          />
        </View>

        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>GadgetBid v1.0.0</Text>
          <Text style={styles.copyrightText}>
            Member since {user?.created_at ? formatDate(user.created_at) : 'N/A'}
          </Text>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  title: {
    fontSize: fonts.sizes.xxxl,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.xxl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: colors.text,
    fontSize: fonts.sizes.xxxl,
    fontWeight: '800',
  },
  userInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  userName: {
    fontSize: fonts.sizes.xl,
    fontWeight: '800',
    color: colors.text,
  },
  userPhone: {
    color: colors.textSecondary,
    marginTop: 4,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary + '14',
    borderWidth: 1,
    borderColor: colors.primary + '33',
  },
  roleBadgeText: {
    color: colors.primary,
    fontSize: fonts.sizes.xs,
    fontWeight: '700',
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.xxl,
    paddingVertical: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.textMuted,
    marginTop: 4,
    fontSize: fonts.sizes.sm,
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.border,
  },
  verificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.xxl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  verificationIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.backgroundLight,
  },
  verificationInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  verificationTitle: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '700',
  },
  verificationSubtitle: {
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 20,
  },
  menuContainer: {
    marginHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  menuTitle: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '700',
  },
  menuSubtitle: {
    color: colors.textSecondary,
    marginTop: 2,
    fontSize: fonts.sizes.sm,
  },
  logoutContainer: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  versionContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  versionText: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
  },
  copyrightText: {
    color: colors.textMuted,
    fontSize: fonts.sizes.xs,
    marginTop: 4,
  },
  bottomPadding: {
    height: 120,
  },
});
