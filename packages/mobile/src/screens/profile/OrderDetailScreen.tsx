import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, spacing, borderRadius } from '../../constants';
import { Button, LoadingScreen } from '../../components';
import { orderService } from '../../services';
import { formatCurrency, formatDateTime } from '../../utils';
import { Order } from '../../types';
import { useAuthStore } from '../../store';

type OrderDetailScreenProps = {
  navigation: any;
  route: any;
};

export const OrderDetailScreen: React.FC<OrderDetailScreenProps> = ({
  navigation,
  route,
}) => {
  const { orderId } = route.params;
  const { user } = useAuthStore();
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const isBuyer = order?.buyer_id === user?.id;
  const isSeller = order?.seller_id === user?.id;

  const loadOrder = async () => {
    try {
      const response = await orderService.getOrder(orderId);
      setOrder(response.data);
    } catch (error) {
      console.error('Failed to load order:', error);
      Alert.alert('Error', 'Failed to load order details');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadOrder();
  }, [orderId]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadOrder();
  };

  const handlePayNow = () => {
    if (!order) return;

    navigation.navigate('Payment', {
      orderId: order.id,
      orderNumber: order.order_number,
      amount: order.total_amount || (order as any).amount || 0,
      gadgetTitle: (order as any).gadget?.title,
    });
  };

  const handleConfirmPayment = async () => {
    if (!order) return;

    // Show payment options
    Alert.alert('Payment Options', 'How would you like to pay?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Pay with Paystack',
        onPress: handlePayNow,
      },
      {
        text: 'Use Wallet Balance',
        onPress: async () => {
          setIsProcessing(true);
          try {
            await orderService.confirmPayment(order.id);
            loadOrder();
            Alert.alert('Success', 'Payment confirmed successfully');
          } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to confirm payment');
          } finally {
            setIsProcessing(false);
          }
        },
      },
    ]);
  };

  const handleMarkAsShipped = async () => {
    if (!order) return;

    Alert.prompt(
      'Mark as Shipped',
      'Enter tracking number (optional):',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async trackingNumber => {
            setIsProcessing(true);
            try {
              await orderService.updateFulfillment(
                order.id,
                'shipped',
                trackingNumber || undefined
              );
              loadOrder();
              Alert.alert('Success', 'Order marked as shipped');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to update order');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ],
      'plain-text'
    );
  };

  const handleConfirmDelivery = async () => {
    if (!order) return;

    Alert.alert(
      'Confirm Delivery',
      'Have you received this item? This action will complete the order.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setIsProcessing(true);
            try {
              await orderService.confirmDelivery(order.id);
              loadOrder();
              Alert.alert('Success', 'Delivery confirmed! Order completed.');
            } catch (error: any) {
              Alert.alert(
                'Error',
                error.message || 'Failed to confirm delivery'
              );
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
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

  const getStatusIcon = (status: string): string => {
    const icons: Record<string, string> = {
      pending: '⏳',
      pending_payment: '⏳',
      processing: '⚙️',
      paid: '✅',
      shipped: '🚚',
      delivered: '📦',
      completed: '🎉',
      disputed: '⚠️',
      cancelled: '❌',
      refunded: '💸',
    };
    return icons[status] || '📋';
  };

  // Get the display status from fulfillment_status or fallback
  const getDisplayStatus = (order: Order): string => {
    return order.fulfillment_status || (order as any).status || 'pending';
  };

  if (isLoading) {
    return <LoadingScreen message="Loading order..." />;
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Order Details</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Order not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Order #{order.order_number}</Text>
        <View style={styles.placeholder} />
      </View>

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
        {/* Status Card */}
        <View style={styles.statusCard}>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: getStatusColor(getDisplayStatus(order)) + '20',
              },
            ]}
          >
            <Text style={styles.statusIcon}>
              {getStatusIcon(getDisplayStatus(order))}
            </Text>
            <Text
              style={[
                styles.statusText,
                { color: getStatusColor(getDisplayStatus(order)) },
              ]}
            >
              {getDisplayStatus(order).replace(/_/g, ' ')}
            </Text>
          </View>
          <Text style={styles.statusDate}>
            {getDisplayStatus(order) === 'completed' ||
            getDisplayStatus(order) === 'delivered'
              ? 'Completed'
              : 'Last updated'}{' '}
            {formatDateTime(order.updated_at)}
          </Text>
        </View>

        {/* Item Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Item</Text>
          <View style={styles.itemContainer}>
            <View style={styles.itemImage}>
              {(order as any).gadget?.images?.[0] ? (
                <Image
                  source={{ uri: (order as any).gadget.images[0] }}
                  style={styles.itemImageContent}
                />
              ) : (
                <Text style={styles.itemEmoji}>📱</Text>
              )}
            </View>
            <View style={styles.itemDetails}>
              <Text style={styles.itemTitle}>
                {(order as any).gadget?.title || 'Gadget'}
              </Text>
              <Text style={styles.itemCondition}>
                Condition: {(order as any).gadget?.condition || 'N/A'}
              </Text>
            </View>
          </View>
        </View>

        {/* Payment Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payment</Text>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Item Price</Text>
            <Text style={styles.paymentValue}>
              {formatCurrency(order.total_amount || (order as any).amount || 0)}
            </Text>
          </View>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Platform Fee</Text>
            <Text style={styles.paymentValue}>
              {formatCurrency(order.platform_fee || 0)}
            </Text>
          </View>
          <View style={[styles.paymentRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>
              {formatCurrency(order.total_amount || (order as any).amount || 0)}
            </Text>
          </View>
        </View>

        {/* Shipping Card */}
        {order.shipping_address && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Shipping Address</Text>
            <Text style={styles.addressText}>
              {order.shipping_address.full_name}
            </Text>
            <Text style={styles.addressText}>
              {order.shipping_address.address_line1}
            </Text>
            {order.shipping_address.address_line2 && (
              <Text style={styles.addressText}>
                {order.shipping_address.address_line2}
              </Text>
            )}
            <Text style={styles.addressText}>
              {order.shipping_address.city}, {order.shipping_address.state}
            </Text>
            <Text style={styles.addressText}>
              {order.shipping_address.phone_number}
            </Text>
          </View>
        )}

        {/* Tracking Card */}
        {order.tracking_number && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tracking</Text>
            <View style={styles.trackingContainer}>
              <Text style={styles.trackingLabel}>Tracking Number</Text>
              <Text style={styles.trackingNumber}>{order.tracking_number}</Text>
            </View>
          </View>
        )}

        {/* Timeline Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Order Timeline</Text>
          <View style={styles.timeline}>
            <View style={styles.timelineItem}>
              <View style={[styles.timelineDot, styles.timelineDotActive]} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineTitle}>Order Created</Text>
                <Text style={styles.timelineDate}>
                  {formatDateTime(order.created_at)}
                </Text>
              </View>
            </View>
            {order.paid_at && (
              <View style={styles.timelineItem}>
                <View style={[styles.timelineDot, styles.timelineDotActive]} />
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineTitle}>Payment Confirmed</Text>
                  <Text style={styles.timelineDate}>
                    {formatDateTime(order.paid_at)}
                  </Text>
                </View>
              </View>
            )}
            {order.shipped_at && (
              <View style={styles.timelineItem}>
                <View style={[styles.timelineDot, styles.timelineDotActive]} />
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineTitle}>Shipped</Text>
                  <Text style={styles.timelineDate}>
                    {formatDateTime(order.shipped_at)}
                  </Text>
                </View>
              </View>
            )}
            {order.delivered_at && (
              <View style={styles.timelineItem}>
                <View style={[styles.timelineDot, styles.timelineDotActive]} />
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineTitle}>Delivered</Text>
                  <Text style={styles.timelineDate}>
                    {formatDateTime(order.delivered_at)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          {isBuyer &&
            (getDisplayStatus(order) === 'pending' ||
              order.payment_status === 'pending') && (
              <>
                <Button
                  title="Pay Now with Paystack"
                  onPress={handlePayNow}
                  loading={isProcessing}
                  fullWidth
                  size="lg"
                />
                <TouchableOpacity
                  style={styles.walletPayButton}
                  onPress={handleConfirmPayment}
                >
                  <Text style={styles.walletPayText}>
                    Or pay with wallet balance
                  </Text>
                </TouchableOpacity>
              </>
            )}
          {isSeller &&
            (getDisplayStatus(order) === 'processing' ||
              order.payment_status === 'completed') &&
            getDisplayStatus(order) !== 'shipped' && (
              <Button
                title="Mark as Shipped"
                onPress={handleMarkAsShipped}
                loading={isProcessing}
                fullWidth
                size="lg"
              />
            )}
          {isBuyer && getDisplayStatus(order) === 'shipped' && (
            <Button
              title="Confirm Delivery"
              onPress={handleConfirmDelivery}
              loading={isProcessing}
              fullWidth
              size="lg"
            />
          )}
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
    fontSize: fonts.sizes.lg,
    fontWeight: '700',
    color: colors.text,
  },
  placeholder: {
    width: 40,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.md,
  },
  statusCard: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  statusIcon: {
    fontSize: fonts.sizes.lg,
  },
  statusText: {
    fontSize: fonts.sizes.md,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  statusDate: {
    color: colors.textMuted,
    fontSize: fonts.sizes.sm,
  },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  cardTitle: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemImage: {
    width: 70,
    height: 70,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  itemImageContent: {
    width: '100%',
    height: '100%',
  },
  itemEmoji: {
    fontSize: fonts.sizes.xxxl,
  },
  itemDetails: {
    flex: 1,
    marginLeft: spacing.md,
  },
  itemTitle: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '600',
  },
  itemCondition: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    marginTop: spacing.xs,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  paymentLabel: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.md,
  },
  paymentValue: {
    color: colors.text,
    fontSize: fonts.sizes.md,
  },
  totalRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginBottom: 0,
  },
  totalLabel: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '700',
  },
  totalValue: {
    color: colors.primary,
    fontSize: fonts.sizes.lg,
    fontWeight: '700',
  },
  addressText: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    lineHeight: 24,
  },
  trackingContainer: {
    backgroundColor: colors.surfaceLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  trackingLabel: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    marginBottom: spacing.xs,
  },
  trackingNumber: {
    color: colors.primary,
    fontSize: fonts.sizes.md,
    fontWeight: '600',
  },
  timeline: {
    paddingLeft: spacing.sm,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.border,
    marginRight: spacing.md,
    marginTop: 4,
  },
  timelineDotActive: {
    backgroundColor: colors.primary,
  },
  timelineContent: {
    flex: 1,
  },
  timelineTitle: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '500',
  },
  timelineDate: {
    color: colors.textMuted,
    fontSize: fonts.sizes.sm,
    marginTop: 2,
  },
  actionsContainer: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  bottomPadding: {
    height: 100,
  },
  walletPayButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  walletPayText: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    textDecorationLine: 'underline',
  },
});

export default OrderDetailScreen;
