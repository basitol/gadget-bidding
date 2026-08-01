import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, borderRadius } from '../../constants';
import { Button } from '../../components';
import { useAuthStore, useSellerDashboardStore } from '../../store';
import { isSellerRole } from '../../utils';
import { mediaUrl } from '../../utils/images';

type SellScreenProps = {
  navigation: any;
};

export const SellScreen: React.FC<SellScreenProps> = ({ navigation }) => {
  const { user } = useAuthStore();
  const isSeller = isSellerRole(user?.role);
  const {
    dashboard,
    isRefreshing,
    fetchDashboard,
  } = useSellerDashboardStore();

  const readyGadgets = dashboard?.ready_gadgets || [];
  const pendingGadgets = dashboard?.pending_gadgets || [];
  const readyCount = dashboard?.stats.ready_gadgets || 0;
  const pendingCount = dashboard?.stats.pending_gadgets || 0;

  useFocusEffect(
    useCallback(() => {
      if (isSeller) {
        fetchDashboard(false);
      }
    }, [fetchDashboard, isSeller])
  );

  const onRefresh = async () => {
    await fetchDashboard(true);
  };

  if (!isSeller) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.restrictedContainer}>
          <View style={styles.restrictedIconWrap}>
            <Ionicons name="lock-closed-outline" size={40} color={colors.primary} />
          </View>
          <Text style={styles.restrictedTitle}>Seller Access Only</Text>
          <Text style={styles.restrictedMessage}>
            You need a seller account to list gadgets for auction.
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Sell</Text>
          <Text style={styles.subtitle}>List your gadgets for auction</Text>
        </View>

        {pendingGadgets.length > 0 && (
          <View style={styles.readySection}>
            <Text style={styles.sectionTitle}>
              Awaiting approval
              {pendingCount > pendingGadgets.length
                ? ` (${pendingGadgets.length} of ${pendingCount})`
                : ''}
            </Text>
            <Text style={styles.sectionSubtitle}>
              An admin will review these before you can auction
            </Text>
            {pendingGadgets.map(gadget => (
              <View key={gadget.id} style={styles.readyCard}>
                {gadget.images?.[0] ? (
                  <Image
                    source={{ uri: mediaUrl(gadget.images[0]) }}
                    style={styles.readyImage}
                  />
                ) : (
                  <View style={[styles.readyImage, styles.readyImagePlaceholder]}>
                    <Ionicons
                      name="image-outline"
                      size={22}
                      color={colors.textMuted}
                    />
                  </View>
                )}
                <View style={styles.readyContent}>
                  <Text style={styles.readyTitle} numberOfLines={1}>
                    {gadget.title}
                  </Text>
                  <Text style={styles.readyStatus}>
                    Pending approval · check back soon
                  </Text>
                </View>
                <Ionicons
                  name="time-outline"
                  size={22}
                  color={colors.warning}
                />
              </View>
            ))}
          </View>
        )}

        {readyGadgets.length > 0 && (
          <View style={styles.readySection}>
            <Text style={styles.sectionTitle}>
              Ready to publish
              {readyCount > readyGadgets.length
                ? ` (${readyGadgets.length} of ${readyCount})`
                : ''}
            </Text>
            <Text style={styles.sectionSubtitle}>
              Finish these listings by creating an auction
            </Text>
            {readyGadgets.map(gadget => (
              <TouchableOpacity
                key={gadget.id}
                style={styles.readyCard}
                activeOpacity={0.85}
                onPress={() => {
                  navigation.navigate('CreateAuction', {
                    gadgetId: gadget.id,
                  });
                }}
              >
                {gadget.images?.[0] ? (
                  <Image
                    source={{ uri: mediaUrl(gadget.images[0]) }}
                    style={styles.readyImage}
                  />
                ) : (
                  <View style={[styles.readyImage, styles.readyImagePlaceholder]}>
                    <Ionicons
                      name="image-outline"
                      size={22}
                      color={colors.textMuted}
                    />
                  </View>
                )}
                <View style={styles.readyContent}>
                  <Text style={styles.readyTitle} numberOfLines={1}>
                    {gadget.title}
                  </Text>
                  <Text style={styles.readyStatus}>
                    Approved · Tap to create auction
                  </Text>
                </View>
                <Ionicons
                  name="arrow-forward-circle"
                  size={24}
                  color={colors.primary}
                />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.actionCard}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('CreateGadget')}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="add-circle-outline" size={28} color={colors.primary} />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>List New Gadget</Text>
              <Text style={styles.actionDescription}>
                Create a new listing and start an auction
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Auctions')}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="pricetag-outline" size={26} color={colors.primary} />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>My Auctions</Text>
              <Text style={styles.actionDescription}>
                View and manage your live auctions
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Sales')}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="bag-handle-outline" size={26} color={colors.primary} />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Sales Orders</Text>
              <Text style={styles.actionDescription}>
                Track your sold items and shipments
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.tipsSection}>
          <Text style={styles.tipsTitle}>Selling Tips</Text>

          <View style={styles.tipCard}>
            <View style={styles.tipIcon}>
              <Ionicons name="camera-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.tipContent}>
              <Text style={styles.tipTitle}>Use Quality Photos</Text>
              <Text style={styles.tipDescription}>
                Clear, well-lit photos from multiple angles attract more bidders
              </Text>
            </View>
          </View>

          <View style={styles.tipCard}>
            <View style={styles.tipIcon}>
              <Ionicons name="pricetag-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.tipContent}>
              <Text style={styles.tipTitle}>Set Competitive Prices</Text>
              <Text style={styles.tipDescription}>
                Research similar items to set attractive starting prices
              </Text>
            </View>
          </View>

          <View style={styles.tipCard}>
            <View style={styles.tipIcon}>
              <Ionicons
                name="document-text-outline"
                size={20}
                color={colors.primary}
              />
            </View>
            <View style={styles.tipContent}>
              <Text style={styles.tipTitle}>Write Detailed Descriptions</Text>
              <Text style={styles.tipDescription}>
                Include all specs, condition details, and any defects
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
  restrictedIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingBottom: spacing.lg,
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
  readySection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fonts.sizes.xl,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  readyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary + '44',
    gap: spacing.md,
  },
  readyImage: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundLight,
  },
  readyImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyContent: {
    flex: 1,
  },
  readyTitle: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '700',
  },
  readyStatus: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.xs,
    marginTop: 2,
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
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
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
