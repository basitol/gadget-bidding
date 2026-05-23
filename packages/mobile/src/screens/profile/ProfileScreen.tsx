import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, borderRadius, shadows } from '../../constants';
import { Button } from '../../components';
import { useAuthStore, useWalletStore } from '../../store';
import { formatCurrency, formatDate } from '../../utils';

type ProfileStackParamList = {
  Profile: undefined;
  Orders: undefined;
  MyBids: undefined;
  MyAuctions: undefined;
  Settings: undefined;
};

type ProfileScreenProps = {
  navigation: NativeStackNavigationProp<ProfileStackParamList, 'Profile'>;
};

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ navigation }) => {
  const { user, logout } = useAuthStore();
  const { wallet } = useWalletStore();

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

  const menuItems = [
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
      icon: 'pricetag-outline',
      title: 'My Auctions',
      subtitle: 'Manage your listings',
      onPress: () => navigation.navigate('MyAuctions'),
    },
    {
      icon: 'wallet-outline',
      title: 'Wallet',
      subtitle: formatCurrency(wallet?.balance || 0),
      onPress: () => {},
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
      onPress: () => {},
    },
    {
      icon: 'document-text-outline',
      title: 'Terms & Privacy',
      subtitle: 'Legal information',
      onPress: () => {},
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
          <TouchableOpacity style={styles.iconButton} activeOpacity={0.8}>
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.text} />
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
            {user?.email && <Text style={styles.userEmail}>{user.email}</Text>}
          </View>
          <TouchableOpacity style={styles.editButton} activeOpacity={0.8}>
            <Ionicons name="pencil-outline" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Won</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Active Bids</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Listings</Text>
          </View>
        </View>

        <View style={styles.verificationCard}>
          <View style={styles.verificationIcon}>
            <Ionicons
              name={user?.is_verified ? 'checkmark-circle-outline' : 'alert-circle-outline'}
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
                ? 'Your account is fully verified'
                : 'Complete verification to unlock all features'}
            </Text>
          </View>
          {!user?.is_verified && (
            <TouchableOpacity style={styles.verifyButton} activeOpacity={0.85}>
              <Text style={styles.verifyButtonText}>Verify</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.menuContainer}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.menuItem}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <View style={styles.menuIcon}>
                <Ionicons name={item.icon as any} size={20} color={colors.text} />
              </View>
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>{item.title}</Text>
                <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
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
  userEmail: {
    color: colors.textMuted,
    marginTop: 2,
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
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
    fontSize: fonts.sizes.xl,
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
  verifyButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  verifyButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
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

