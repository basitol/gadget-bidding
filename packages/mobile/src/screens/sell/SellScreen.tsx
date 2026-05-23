import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, spacing, borderRadius } from '../../constants';
import { Button } from '../../components';
import { useAuthStore } from '../../store';

type SellScreenProps = {
  navigation: any;
};

export const SellScreen: React.FC<SellScreenProps> = ({ navigation }) => {
  const { user } = useAuthStore();
  const isSeller = user?.role === 'seller' || user?.role === 'admin';

  if (!isSeller) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.restrictedContainer}>
          <Text style={styles.restrictedIcon}>🔒</Text>
          <Text style={styles.restrictedTitle}>Seller Access Only</Text>
          <Text style={styles.restrictedMessage}>
            You need a seller account to list gadgets for auction. Contact
            support to upgrade your account.
          </Text>
          <Button
            title="Contact Support"
            onPress={() => {}}
            variant="outline"
            size="lg"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Sell</Text>
          <Text style={styles.subtitle}>List your gadgets for auction</Text>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.actionCard}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('CreateGadget')}
          >
            <View style={styles.actionIcon}>
              <Text style={styles.actionEmoji}>📱</Text>
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>List New Gadget</Text>
              <Text style={styles.actionDescription}>
                Create a new listing and start an auction
              </Text>
            </View>
            <Text style={styles.actionArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            activeOpacity={0.8}
            onPress={() =>
              navigation.navigate('Profile', { screen: 'MyAuctions' })
            }
          >
            <View style={styles.actionIcon}>
              <Text style={styles.actionEmoji}>🏷️</Text>
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>My Auctions</Text>
              <Text style={styles.actionDescription}>
                View and manage your active auctions
              </Text>
            </View>
            <Text style={styles.actionArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Profile', { screen: 'Orders' })}
          >
            <View style={styles.actionIcon}>
              <Text style={styles.actionEmoji}>📦</Text>
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Sales Orders</Text>
              <Text style={styles.actionDescription}>
                Track your sold items and shipments
              </Text>
            </View>
            <Text style={styles.actionArrow}>→</Text>
          </TouchableOpacity>
        </View>

        {/* Tips Section */}
        <View style={styles.tipsSection}>
          <Text style={styles.tipsTitle}>Selling Tips</Text>

          <View style={styles.tipCard}>
            <Text style={styles.tipIcon}>📸</Text>
            <View style={styles.tipContent}>
              <Text style={styles.tipTitle}>Use Quality Photos</Text>
              <Text style={styles.tipDescription}>
                Clear, well-lit photos from multiple angles attract more bidders
              </Text>
            </View>
          </View>

          <View style={styles.tipCard}>
            <Text style={styles.tipIcon}>💰</Text>
            <View style={styles.tipContent}>
              <Text style={styles.tipTitle}>Set Competitive Prices</Text>
              <Text style={styles.tipDescription}>
                Research similar items to set attractive starting prices
              </Text>
            </View>
          </View>

          <View style={styles.tipCard}>
            <Text style={styles.tipIcon}>📝</Text>
            <View style={styles.tipContent}>
              <Text style={styles.tipTitle}>Write Detailed Descriptions</Text>
              <Text style={styles.tipDescription}>
                Include all specs, condition details, and any defects
              </Text>
            </View>
          </View>

          <View style={styles.tipCard}>
            <Text style={styles.tipIcon}>⏰</Text>
            <View style={styles.tipContent}>
              <Text style={styles.tipTitle}>Choose Right Duration</Text>
              <Text style={styles.tipDescription}>
                3-5 day auctions typically get the most engagement
              </Text>
            </View>
          </View>
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
  restrictedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  restrictedIcon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  restrictedTitle: {
    color: colors.text,
    fontSize: fonts.sizes.xxl,
    fontWeight: '700',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  restrictedMessage: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.md,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 24,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  title: {
    fontSize: fonts.sizes.xxxl,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.md,
    marginTop: spacing.xs,
  },
  actionsContainer: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.md,
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionEmoji: {
    fontSize: fonts.sizes.xxl,
  },
  actionContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  actionTitle: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '600',
  },
  actionDescription: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    marginTop: 2,
  },
  actionArrow: {
    color: colors.primary,
    fontSize: fonts.sizes.xl,
    fontWeight: '600',
  },
  tipsSection: {
    paddingHorizontal: spacing.lg,
  },
  tipsTitle: {
    color: colors.text,
    fontSize: fonts.sizes.xl,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  tipCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  tipIcon: {
    fontSize: fonts.sizes.xl,
    marginRight: spacing.md,
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '500',
  },
  tipDescription: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    marginTop: 2,
    lineHeight: 20,
  },
  bottomPadding: {
    height: 100,
  },
});

export default SellScreen;
