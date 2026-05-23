import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, borderRadius } from '../../constants';
import { EmptyState, LoadingScreen } from '../../components';
import { orderService } from '../../services';
import { formatCurrency, formatDate } from '../../utils';
import { Order } from '../../types';

type OrdersScreenProps = {
  navigation: NativeStackNavigationProp<any>;
};

export const OrdersScreen: React.FC<OrdersScreenProps> = ({ navigation }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'purchases' | 'sales'>(
    'purchases'
  );

  useEffect(() => {
    loadOrders();
  }, [activeTab]);

  const loadOrders = async () => {
    setIsLoading(true);
    try {
      const response =
        activeTab === 'purchases'
          ? await orderService.getMyOrders()
          : await orderService.getMySales();
      setOrders(response.data);
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadOrders();
    setIsRefreshing(false);
  };

  const getStatusColor = (status: string): string => {
    const statusColors: Record<string, string> = {
      pending: colors.warning,
      pending_payment: colors.warning,
      processing: colors.info,
      paid: colors.info,
      shipped: colors.primary,
      delivered: colors.success,
      completed: colors.success,
      disputed: colors.error,
      cancelled: colors.textMuted,
      refunded: colors.textMuted,
    };
    return statusColors[status] || colors.textSecondary;
  };

  const getStatusIcon = (status: string): keyof typeof Ionicons.glyphMap => {
    const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
      pending: 'time-outline',
      pending_payment: 'time-outline',
      processing: 'settings-outline',
      paid: 'checkmark-circle-outline',
      shipped: 'car-outline',
      delivered: 'cube-outline',
      completed: 'trophy-outline',
      disputed: 'alert-circle-outline',
      cancelled: 'close-circle-outline',
      refunded: 'cash-outline',
    };
    return icons[status] || 'document-text-outline';
  };

  const renderOrder = ({ item }: { item: Order }) => {
    // Use fulfillment_status as the primary status display
    const displayStatus = item.fulfillment_status || item.status || 'pending';

    return (
      <TouchableOpacity
        style={styles.orderCard}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
      >
        <View style={styles.orderHeader}>
          <View>
            <Text style={styles.orderNumber}>#{item.order_number}</Text>
            <Text style={styles.orderDate}>{formatDate(item.created_at)}</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(displayStatus) + '20' },
            ]}
          >
            <Text style={styles.statusIcon}>
              {getStatusIcon(displayStatus)}
            </Text>
            <Text
              style={[
                styles.statusText,
                { color: getStatusColor(displayStatus) },
              ]}
            >
              {displayStatus?.replace(/_/g, ' ') || 'pending'}
            </Text>
          </View>
        </View>

        <View style={styles.orderContent}>
          <View style={styles.gadgetInfo}>
            <View style={styles.gadgetImage}>
              <Ionicons name="phone-portrait-outline" size={22} color={colors.text} />
            </View>
            <View style={styles.gadgetDetails}>
              <Text style={styles.gadgetTitle} numberOfLines={2}>
                {item.gadget?.title || 'Gadget'}
              </Text>
              <Text style={styles.gadgetPrice}>
                {formatCurrency(item.total_amount || item.amount)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.orderFooter}>
          {displayStatus === 'shipped' && item.tracking_number && (
            <View style={styles.trackingInfo}>
              <Text style={styles.trackingLabel}>Tracking:</Text>
              <Text style={styles.trackingNumber}>{item.tracking_number}</Text>
            </View>
          )}
          <Text style={styles.viewDetails}>View Details →</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Orders</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'purchases' ? styles.activeTab : undefined,
          ]}
          onPress={() => setActiveTab('purchases')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'purchases' ? styles.activeTabText : undefined,
            ]}
          >
            Purchases
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'sales' ? styles.activeTab : undefined,
          ]}
          onPress={() => setActiveTab('sales')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'sales' ? styles.activeTabText : undefined,
            ]}
          >
            Sales
          </Text>
        </TouchableOpacity>
      </View>

      {/* Orders List */}
      {isLoading ? (
        <LoadingScreen message="Loading orders..." />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={activeTab === 'purchases' ? 'cart-outline' : 'pricetag-outline'}
          title={
            activeTab === 'purchases' ? 'No Purchases Yet' : 'No Sales Yet'
          }
          message={
            activeTab === 'purchases'
              ? 'Your purchased items will appear here'
              : 'Items you sell will appear here'
          }
          actionLabel="Browse Auctions"
          onAction={() => navigation.navigate('Home')}
        />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => item.id}
          renderItem={renderOrder}
          contentContainerStyle={styles.listContent}
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
  backIcon: {
    fontSize: fonts.sizes.xl,
    color: colors.text,
  },
  title: {
    fontSize: fonts.sizes.xl,
    fontWeight: '700',
    color: colors.text,
  },
  placeholder: {
    width: 40,
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
  orderCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  orderNumber: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '700',
  },
  orderDate: {
    color: colors.textMuted,
    fontSize: fonts.sizes.sm,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
  },
  statusIcon: {
    fontSize: fonts.sizes.sm,
  },
  statusText: {
    fontSize: fonts.sizes.xs,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  orderContent: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  gadgetInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gadgetImage: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gadgetEmoji: {
    fontSize: fonts.sizes.xxl,
  },
  gadgetDetails: {
    flex: 1,
    marginLeft: spacing.md,
  },
  gadgetTitle: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '500',
  },
  gadgetPrice: {
    color: colors.secondary,
    fontSize: fonts.sizes.lg,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  trackingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  trackingLabel: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
  },
  trackingNumber: {
    color: colors.primary,
    fontSize: fonts.sizes.sm,
    fontWeight: '500',
  },
  viewDetails: {
    color: colors.primary,
    fontSize: fonts.sizes.sm,
    fontWeight: '500',
  },
});
