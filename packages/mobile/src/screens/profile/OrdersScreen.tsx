import React, { useEffect, useState } from 'react';
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
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, borderRadius } from '../../constants';
import { EmptyState, LoadingScreen } from '../../components';
import { useIsTabRoot } from '../../hooks';
import { orderService } from '../../services';
import { formatCurrency, formatDate, getOrderStatusLabel } from '../../utils';
import { Order } from '../../types';

type OrdersScreenProps = {
  navigation: NativeStackNavigationProp<any>;
  route?: { params?: { initialTab?: 'purchases' | 'sales' } };
};

export const OrdersScreen: React.FC<OrdersScreenProps> = ({
  navigation,
  route,
}) => {
  const isTabRoot = useIsTabRoot();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'purchases' | 'sales'>(
    route?.params?.initialTab ?? 'purchases'
  );

  useEffect(() => {
    setPage(1);
    loadOrders(1, false);
  }, [activeTab]);

  const loadOrders = async (nextPage = 1, append = false) => {
    if (append) setIsLoadingMore(true);
    else setIsLoading(true);
    setLoadError(null);
    try {
      const response =
        activeTab === 'purchases'
          ? await orderService.getMyOrders(nextPage, 20)
          : await orderService.getMySales(nextPage, 20);
      const batch = response.data || [];
      setOrders(prev => (append ? [...prev, ...batch] : batch));
      const totalPages =
        (response.pagination as any)?.totalPages ||
        response.pagination?.total_pages ||
        1;
      setPage(nextPage);
      setHasMore(nextPage < totalPages);
    } catch (error) {
      console.error('Failed to load orders:', error);
      const message =
        error instanceof Error ? error.message : 'Failed to load orders';
      setLoadError(
        message.includes('timeout')
          ? 'Could not reach the server. Check that the backend is running and you are on the same Wi‑Fi.'
          : message
      );
      if (!append) setOrders([]);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadOrders(1, false);
    setIsRefreshing(false);
  };

  const handleLoadMore = () => {
    if (isLoading || isLoadingMore || !hasMore) return;
    loadOrders(page + 1, true);
  };

  const getStatusColor = (status: string): string => {
    const statusColors: Record<string, string> = {
      pending: colors.warning,
      pending_payment: colors.warning,
      processing: colors.info,
      sent_to_backoffice: colors.primary,
      received_by_backoffice: colors.primary,
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
      sent_to_backoffice: 'send-outline',
      received_by_backoffice: 'business-outline',
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

  const getOrderNextStep = (order: Order): string => {
    const fulfillmentStatus = order.fulfillment_status || 'pending';
    const paymentStatus = order.payment_status || 'pending';

    if (activeTab === 'purchases') {
      if (paymentStatus === 'pending') return 'Pay now to secure your win';
      if (fulfillmentStatus === 'processing')
        return 'Seller is preparing the item';
      if (fulfillmentStatus === 'sent_to_backoffice')
        return 'Seller has sent item to backoffice';
      if (fulfillmentStatus === 'received_by_backoffice')
        return 'Backoffice received item';
      if (fulfillmentStatus === 'shipped')
        return 'Confirm delivery after receiving it';
      if (fulfillmentStatus === 'delivered') return 'Delivered';
      if (fulfillmentStatus === 'cancelled') return 'Cancelled';
      return 'Track your order progress';
    }

    if (paymentStatus === 'pending') return 'Waiting for buyer payment';
    if (fulfillmentStatus === 'processing') return 'Send item to backoffice';
    if (fulfillmentStatus === 'sent_to_backoffice')
      return 'Waiting for backoffice confirmation';
    if (fulfillmentStatus === 'received_by_backoffice')
      return 'Backoffice received item';
    if (fulfillmentStatus === 'shipped')
      return 'Backoffice delivery in progress';
    if (fulfillmentStatus === 'delivered') {
      if (order.payout_status === 'paid') return 'Payout paid';
      if (order.payout_status === 'held') return 'Payout held for review';
      return 'Payout ready for admin release';
    }
    return 'Manage this sale';
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
            <Ionicons
              name={getStatusIcon(displayStatus)}
              size={14}
              color={getStatusColor(displayStatus)}
            />
            <Text
              style={[
                styles.statusText,
                { color: getStatusColor(displayStatus) },
              ]}
            >
              {getOrderStatusLabel(displayStatus)}
            </Text>
          </View>
        </View>

        <View style={styles.orderContent}>
          <View style={styles.gadgetInfo}>
            <View style={styles.gadgetImage}>
              <Ionicons
                name="phone-portrait-outline"
                size={22}
                color={colors.text}
              />
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
          <View style={styles.nextStep}>
            <Ionicons
              name={
                activeTab === 'purchases'
                  ? 'navigate-circle-outline'
                  : 'bag-check-outline'
              }
              size={16}
              color={colors.primary}
            />
            <Text style={styles.nextStepText} numberOfLines={1}>
              {getOrderNextStep(item)}
            </Text>
          </View>
          <Text style={styles.viewDetails}>
            {item.payment_status === 'pending' && activeTab === 'purchases'
              ? 'Pay →'
              : 'Open →'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        {isTabRoot ? (
          <View style={styles.placeholder} />
        ) : (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
        )}
        <Text style={styles.title}>
          {route?.params?.initialTab === 'sales' ? 'Sales' : 'Orders'}
        </Text>
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
          icon={
            loadError
              ? 'cloud-offline-outline'
              : activeTab === 'purchases'
                ? 'cart-outline'
                : 'pricetag-outline'
          }
          title={
            loadError
              ? 'Couldn’t load orders'
              : activeTab === 'purchases'
                ? 'No Purchases Yet'
                : 'No Sales Yet'
          }
          message={
            loadError ||
            (activeTab === 'purchases'
              ? 'Your purchased items will appear here'
              : 'Items you sell will appear here')
          }
          actionLabel={loadError ? 'Try again' : 'Browse Auctions'}
          onAction={() =>
            loadError
              ? loadOrders(1, false)
              : navigation.navigate('MainTabs', {
                  screen:
                    route?.params?.initialTab === 'sales' ? 'Listings' : 'Home',
                })
          }
        />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => item.id}
          renderItem={renderOrder}
          contentContainerStyle={styles.listContent}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            isLoadingMore ? (
              <ActivityIndicator
                style={{ marginVertical: spacing.lg }}
                color={colors.primary}
              />
            ) : null
          }
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
  nextStep: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginRight: spacing.md,
  },
  nextStepText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    fontWeight: '500',
  },
  viewDetails: {
    color: colors.primary,
    fontSize: fonts.sizes.sm,
    fontWeight: '500',
  },
});
