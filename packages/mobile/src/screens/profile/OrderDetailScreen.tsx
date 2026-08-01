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
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, borderRadius } from '../../constants';
import { Button, LoadingScreen } from '../../components';
import { addressService, orderService } from '../../services';
import {
  formatCurrency,
  formatDateTime,
  getConditionLabel,
  getOrderStatusLabel,
} from '../../utils';
import { DisputeType, Order, ShippingAddress, UserAddress } from '../../types';
import { useAuthStore } from '../../store';

type OrderDetailScreenProps = {
  navigation: any;
  route: any;
};

const DISPUTE_OPTIONS: { label: string; value: DisputeType }[] = [
  { label: 'Not received', value: 'item_not_received' },
  { label: 'Damaged', value: 'item_damaged' },
  { label: 'Not as described', value: 'item_not_as_described' },
  { label: 'Fraud', value: 'fraud' },
  { label: 'Other', value: 'other' },
];

const toShippingAddress = (address: UserAddress): ShippingAddress => ({
  full_name: address.full_name,
  phone_number: address.phone_number,
  address_line1: address.address_line1,
  address_line2: address.address_line2,
  city: address.city,
  state: address.state,
  postal_code: address.postal_code,
  country: address.country || 'Nigeria',
});

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
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeType, setDisputeType] =
    useState<DisputeType>('item_not_received');
  const [disputeDescription, setDisputeDescription] = useState('');
  const [savedAddresses, setSavedAddresses] = useState<UserAddress[]>([]);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);
  const [applyingAddressId, setApplyingAddressId] = useState<string | null>(
    null
  );

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

  useEffect(() => {
    let mounted = true;

    const loadSavedAddresses = async () => {
      if (!user?.id) return;
      setIsLoadingAddresses(true);
      try {
        const response = await addressService.listAddresses();
        if (mounted) {
          setSavedAddresses(response.data || []);
        }
      } catch (error) {
        console.warn('Failed to load saved addresses', error);
      } finally {
        if (mounted) setIsLoadingAddresses(false);
      }
    };

    loadSavedAddresses();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadOrder();
  };

  const hasShippingAddress = Boolean(
    order?.shipping_address?.full_name &&
    order?.shipping_address?.address_line1 &&
    order?.shipping_address?.city &&
    order?.shipping_address?.state
  );

  const goToShippingAddress = (returnToPayment = false) => {
    if (!order) return;
    navigation.navigate('ShippingAddress', {
      orderId: order.id,
      orderNumber: order.order_number,
      returnToPayment,
      amount: order.total_amount || (order as any).amount || 0,
      gadgetTitle: (order as any).gadget?.title,
    });
  };

  const applySavedAddress = async (
    address: UserAddress,
    continueToPayment = false
  ) => {
    if (!order) return;

    setApplyingAddressId(address.id);
    try {
      const response = await orderService.updateShippingAddress(
        order.id,
        toShippingAddress(address)
      );
      setOrder(response.data);

      if (continueToPayment) {
        navigation.navigate('Payment', {
          orderId: order.id,
          orderNumber: order.order_number,
          amount: order.total_amount || (order as any).amount || 0,
          gadgetTitle: (order as any).gadget?.title,
        });
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to use saved address');
    } finally {
      setApplyingAddressId(null);
    }
  };

  const handlePayNow = () => {
    if (!order) return;

    if (!hasShippingAddress) {
      goToShippingAddress(true);
      return;
    }

    navigation.navigate('Payment', {
      orderId: order.id,
      orderNumber: order.order_number,
      amount: order.total_amount || (order as any).amount || 0,
      gadgetTitle: (order as any).gadget?.title,
    });
  };

  const handleConfirmPayment = async () => {
    if (!order) return;

    if (!hasShippingAddress) {
      Alert.alert(
        'Shipping address required',
        'Add where we should deliver this order before paying.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add address', onPress: () => goToShippingAddress(true) },
        ]
      );
      return;
    }

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

  const handleMarkSentToBackoffice = async () => {
    if (!order) return;

    Alert.alert(
      'Sent to backoffice',
      'Confirm you have sent or dropped off this item with backoffice.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setIsProcessing(true);
            try {
              await orderService.updateFulfillment(
                order.id,
                'sent_to_backoffice'
              );
              loadOrder();
              Alert.alert('Success', 'Backoffice has been notified');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to update order');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
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

  const handleOpenDispute = async () => {
    if (!order) return;

    if (disputeDescription.trim().length < 20) {
      Alert.alert(
        'More detail needed',
        'Please explain the issue in at least 20 characters.'
      );
      return;
    }

    setIsProcessing(true);
    try {
      await orderService.createDispute(
        order.id,
        disputeType,
        disputeDescription.trim()
      );
      setShowDisputeForm(false);
      setDisputeDescription('');
      loadOrder();
      Alert.alert(
        'Dispute opened',
        'Admin has been notified and the payout is held while this is reviewed.'
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to open dispute');
    } finally {
      setIsProcessing(false);
    }
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
      pending: 'hourglass-outline',
      pending_payment: 'hourglass-outline',
      processing: 'settings-outline',
      sent_to_backoffice: 'send-outline',
      received_by_backoffice: 'business-outline',
      paid: 'checkmark-circle-outline',
      shipped: 'car-outline',
      delivered: 'cube-outline',
      completed: 'sparkles-outline',
      disputed: 'alert-circle-outline',
      cancelled: 'close-circle-outline',
      refunded: 'cash-outline',
    };
    return icons[status] || 'receipt-outline';
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
            <Ionicons name="chevron-back" size={20} color={colors.text} />
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

  const displayStatus = getDisplayStatus(order);
  const canPay =
    isBuyer &&
    (displayStatus === 'pending' || order.payment_status === 'pending');
  const canMarkSentToBackoffice =
    isSeller &&
    order.payment_status === 'paid' &&
    displayStatus === 'processing';
  const canConfirmDelivery = isBuyer && displayStatus === 'shipped';
  const openDispute = order.disputes?.find(dispute =>
    ['open', 'investigating'].includes(dispute.status)
  );
  const canOpenDispute =
    (isBuyer || isSeller) &&
    order.payment_status === 'paid' &&
    !openDispute &&
    !['cancelled', 'refunded'].includes(displayStatus);

  const progressSteps = isSeller
    ? [
        {
          key: 'sold',
          title: 'Sold',
          detail: 'Order created',
          done: true,
        },
        {
          key: 'paid',
          title: 'Paid',
          detail:
            order.payment_status === 'paid'
              ? 'Buyer payment received'
              : 'Waiting for buyer',
          done: order.payment_status === 'paid',
        },
        {
          key: 'backoffice',
          title: 'Backoffice',
          detail:
            displayStatus === 'sent_to_backoffice'
              ? 'Awaiting confirmation'
              : displayStatus === 'received_by_backoffice'
                ? 'Received'
                : ['shipped', 'delivered'].includes(displayStatus)
                  ? 'Shipping handled'
                  : 'Send item',
          done: [
            'sent_to_backoffice',
            'received_by_backoffice',
            'shipped',
            'delivered',
          ].includes(displayStatus),
        },
        {
          key: 'payout',
          title: 'Payout',
          detail:
            order.payout_status === 'paid'
              ? 'Paid out'
              : order.payout_status === 'held'
                ? 'Held for review'
                : order.payout_status === 'ready'
                  ? 'Ready for release'
                  : 'After delivery',
          done: order.payout_status === 'paid',
        },
      ]
    : [
        {
          key: 'won',
          title: 'Won',
          detail: 'Auction ended',
          done: true,
        },
        {
          key: 'paid',
          title: 'Paid',
          detail:
            order.payment_status === 'paid'
              ? 'Payment confirmed'
              : 'Pay to secure item',
          done: order.payment_status === 'paid',
        },
        {
          key: 'shipped',
          title: 'Delivery',
          detail:
            displayStatus === 'sent_to_backoffice'
              ? 'Backoffice confirming receipt'
              : displayStatus === 'received_by_backoffice'
                ? 'Backoffice preparing shipment'
                : order.tracking_number || 'Backoffice will deliver',
          done: ['shipped', 'delivered'].includes(displayStatus),
        },
        {
          key: 'delivered',
          title: 'Delivered',
          detail:
            displayStatus === 'delivered'
              ? 'Completed'
              : 'Confirm when received',
          done: displayStatus === 'delivered',
        },
      ];

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
                backgroundColor: getStatusColor(displayStatus) + '20',
              },
            ]}
          >
            <Ionicons
              name={getStatusIcon(displayStatus)}
              size={18}
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
          <Text style={styles.statusDate}>
            {displayStatus === 'completed' || displayStatus === 'delivered'
              ? 'Completed'
              : 'Last updated'}{' '}
            {formatDateTime(order.updated_at)}
          </Text>
        </View>

        <View style={styles.progressCard}>
          {progressSteps.map((step, index) => (
            <View key={step.key} style={styles.progressStep}>
              <View
                style={[
                  styles.progressIcon,
                  step.done ? styles.progressIconDone : undefined,
                ]}
              >
                <Ionicons
                  name={step.done ? 'checkmark' : 'ellipse-outline'}
                  size={16}
                  color={step.done ? '#FFFFFF' : colors.textMuted}
                />
              </View>
              {index < progressSteps.length - 1 ? (
                <View
                  style={[
                    styles.progressLine,
                    step.done ? styles.progressLineDone : undefined,
                  ]}
                />
              ) : null}
              <Text
                style={[
                  styles.progressTitle,
                  step.done ? styles.progressTitleDone : undefined,
                ]}
                numberOfLines={1}
              >
                {step.title}
              </Text>
              <Text style={styles.progressDetail} numberOfLines={2}>
                {step.detail}
              </Text>
            </View>
          ))}
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
                <Ionicons
                  name="phone-portrait-outline"
                  size={32}
                  color={colors.textMuted}
                />
              )}
            </View>
            <View style={styles.itemDetails}>
              <Text style={styles.itemTitle}>
                {(order as any).gadget?.title || 'Gadget'}
              </Text>
              <Text style={styles.itemCondition}>
                Condition: {getConditionLabel((order as any).gadget?.condition)}
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
          {isSeller ? (
            <View style={styles.payoutBox}>
              <View>
                <Text style={styles.payoutLabel}>Seller payout</Text>
                <Text style={styles.payoutValue}>
                  {formatCurrency(
                    order.seller_payout || order.seller_amount || 0
                  )}
                </Text>
              </View>
              <View style={styles.payoutBadge}>
                <Text style={styles.payoutBadgeText}>
                  {order.payout_status || 'pending'}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        {isBuyer ? (
          <View style={styles.card}>
            <View style={styles.shippingHeader}>
              <Text style={[styles.cardTitle, styles.shippingTitle]}>
                Shipping Address
              </Text>
              {order.payment_status === 'pending' && hasShippingAddress ? (
                <TouchableOpacity onPress={() => goToShippingAddress(false)}>
                  <Text style={styles.editLink}>Edit</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {hasShippingAddress && order.shipping_address ? (
              <>
                <Text style={styles.addressText}>
                  {order.shipping_address.full_name}
                </Text>
                <Text style={styles.addressText}>
                  {order.shipping_address.address_line1}
                </Text>
                {order.shipping_address.address_line2 ? (
                  <Text style={styles.addressText}>
                    {order.shipping_address.address_line2}
                  </Text>
                ) : null}
                <Text style={styles.addressText}>
                  {order.shipping_address.city}, {order.shipping_address.state}
                </Text>
                <Text style={styles.addressText}>
                  {order.shipping_address.phone_number}
                </Text>
                {order.payment_status === 'pending' &&
                savedAddresses.length > 0 ? (
                  <View style={styles.savedAddressSection}>
                    <Text style={styles.savedAddressTitle}>
                      Change delivery address
                    </Text>
                    {savedAddresses.map(address => (
                      <TouchableOpacity
                        key={address.id}
                        style={styles.savedAddressCard}
                        onPress={() => applySavedAddress(address)}
                        activeOpacity={0.85}
                        disabled={Boolean(applyingAddressId)}
                      >
                        <View style={styles.savedAddressIcon}>
                          <Ionicons
                            name="location-outline"
                            size={17}
                            color={colors.primary}
                          />
                        </View>
                        <View style={styles.savedAddressInfo}>
                          <View style={styles.savedAddressHeader}>
                            <Text style={styles.savedAddressLabel}>
                              {address.label}
                            </Text>
                            {address.is_default ? (
                              <Text style={styles.defaultAddressPill}>
                                Default
                              </Text>
                            ) : null}
                          </View>
                          <Text
                            style={styles.savedAddressText}
                            numberOfLines={2}
                          >
                            {address.address_line1}
                            {address.address_line2
                              ? `, ${address.address_line2}`
                              : ''}
                          </Text>
                          <Text style={styles.savedAddressMeta}>
                            {address.city}, {address.state}
                          </Text>
                        </View>
                        {applyingAddressId === address.id ? (
                          <Ionicons
                            name="hourglass-outline"
                            size={18}
                            color={colors.textMuted}
                          />
                        ) : (
                          <Ionicons
                            name="chevron-forward"
                            size={18}
                            color={colors.textMuted}
                          />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <Text style={styles.addressMissing}>
                  Add a delivery address before you pay.
                </Text>
                {isLoadingAddresses ? (
                  <Text style={styles.addressLoadingText}>
                    Loading saved addresses…
                  </Text>
                ) : savedAddresses.length > 0 ? (
                  <View style={styles.savedAddressSection}>
                    <Text style={styles.savedAddressTitle}>
                      Use a saved address
                    </Text>
                    {savedAddresses.map(address => (
                      <TouchableOpacity
                        key={address.id}
                        style={styles.savedAddressCard}
                        onPress={() => applySavedAddress(address, true)}
                        activeOpacity={0.85}
                        disabled={Boolean(applyingAddressId)}
                      >
                        <View style={styles.savedAddressIcon}>
                          <Ionicons
                            name="location-outline"
                            size={17}
                            color={colors.primary}
                          />
                        </View>
                        <View style={styles.savedAddressInfo}>
                          <View style={styles.savedAddressHeader}>
                            <Text style={styles.savedAddressLabel}>
                              {address.label}
                            </Text>
                            {address.is_default ? (
                              <Text style={styles.defaultAddressPill}>
                                Default
                              </Text>
                            ) : null}
                          </View>
                          <Text
                            style={styles.savedAddressText}
                            numberOfLines={2}
                          >
                            {address.address_line1}
                            {address.address_line2
                              ? `, ${address.address_line2}`
                              : ''}
                          </Text>
                          <Text style={styles.savedAddressMeta}>
                            {address.city}, {address.state}
                          </Text>
                        </View>
                        {applyingAddressId === address.id ? (
                          <Ionicons
                            name="hourglass-outline"
                            size={18}
                            color={colors.textMuted}
                          />
                        ) : (
                          <Ionicons
                            name="arrow-forward"
                            size={18}
                            color={colors.primary}
                          />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                <TouchableOpacity
                  style={styles.addAddressButton}
                  onPress={() => goToShippingAddress(false)}
                >
                  <Text style={styles.addAddressText}>
                    Add shipping address
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Delivery privacy</Text>
            <Text style={styles.addressMissing}>
              Buyer address is kept private. Use tracking only after the item is
              handed over for delivery.
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

        {canMarkSentToBackoffice ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Send item to backoffice</Text>
            <Text style={styles.shipHelp}>
              Send or drop off the item with backoffice. Backoffice will confirm
              receipt, then handle buyer delivery.
            </Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Problem with this order?</Text>
          {openDispute ? (
            <View style={styles.disputeNotice}>
              <Ionicons
                name="alert-circle-outline"
                size={20}
                color={colors.warning}
              />
              <View style={styles.disputeNoticeText}>
                <Text style={styles.disputeTitle}>Dispute under review</Text>
                <Text style={styles.disputeDescription}>
                  {openDispute.description}
                </Text>
              </View>
            </View>
          ) : showDisputeForm ? (
            <>
              <Text style={styles.shipHelp}>
                Explain the issue clearly. Opening a dispute holds seller payout
                until admin reviews it.
              </Text>
              <View style={styles.disputeTypeGrid}>
                {DISPUTE_OPTIONS.map(option => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.disputeTypeButton,
                      disputeType === option.value
                        ? styles.disputeTypeButtonActive
                        : undefined,
                    ]}
                    onPress={() => setDisputeType(option.value)}
                  >
                    <Text
                      style={[
                        styles.disputeTypeText,
                        disputeType === option.value
                          ? styles.disputeTypeTextActive
                          : undefined,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                value={disputeDescription}
                onChangeText={setDisputeDescription}
                placeholder="What happened?"
                placeholderTextColor={colors.textMuted}
                multiline
                textAlignVertical="top"
                style={styles.disputeInput}
              />
              <View style={styles.disputeActions}>
                <TouchableOpacity onPress={() => setShowDisputeForm(false)}>
                  <Text style={styles.cancelDisputeText}>Cancel</Text>
                </TouchableOpacity>
                <Button
                  title="Submit dispute"
                  onPress={handleOpenDispute}
                  loading={isProcessing}
                  size="sm"
                />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.shipHelp}>
                Use this only for delivery, item condition, fraud, or payment
                issues that need admin review.
              </Text>
              <Button
                title="Open a dispute"
                onPress={() => setShowDisputeForm(true)}
                variant="outline"
                disabled={!canOpenDispute}
                fullWidth
              />
            </>
          )}
        </View>

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
          {canPay && (
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
          {canMarkSentToBackoffice && (
            <Button
              title="Mark Sent to Backoffice"
              onPress={handleMarkSentToBackoffice}
              loading={isProcessing}
              fullWidth
              size="lg"
            />
          )}
          {canConfirmDelivery && (
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
  statusText: {
    fontSize: fonts.sizes.md,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  statusDate: {
    color: colors.textMuted,
    fontSize: fonts.sizes.sm,
  },
  progressCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  progressStep: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
    paddingHorizontal: 2,
  },
  progressIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    zIndex: 2,
  },
  progressIconDone: {
    backgroundColor: colors.primary,
  },
  progressLine: {
    position: 'absolute',
    top: 13,
    left: '50%',
    right: '-50%',
    height: 2,
    backgroundColor: colors.border,
    zIndex: 1,
  },
  progressLineDone: {
    backgroundColor: colors.primary,
  },
  progressTitle: {
    color: colors.textMuted,
    fontSize: fonts.sizes.xs,
    fontWeight: '700',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  progressTitleDone: {
    color: colors.text,
  },
  progressDetail: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 15,
    maxWidth: 76,
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
  payoutBox: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  payoutLabel: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
  },
  payoutValue: {
    color: colors.text,
    fontSize: fonts.sizes.lg,
    fontWeight: '700',
    marginTop: 2,
  },
  payoutBadge: {
    backgroundColor: colors.primary + '18',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  payoutBadgeText: {
    color: colors.primary,
    fontSize: fonts.sizes.xs,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  shippingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  shippingTitle: {
    marginBottom: 0,
  },
  editLink: {
    color: colors.primary,
    fontSize: fonts.sizes.sm,
    fontWeight: '600',
  },
  addressMissing: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.md,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  addAddressButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary + '18',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  addAddressText: {
    color: colors.primary,
    fontSize: fonts.sizes.sm,
    fontWeight: '600',
  },
  addressText: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    lineHeight: 24,
  },
  addressLoadingText: {
    color: colors.textMuted,
    fontSize: fonts.sizes.sm,
    marginBottom: spacing.sm,
  },
  savedAddressSection: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  savedAddressTitle: {
    color: colors.text,
    fontSize: fonts.sizes.sm,
    fontWeight: '700',
  },
  savedAddressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.backgroundLight,
    padding: spacing.md,
  },
  savedAddressIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedAddressInfo: {
    flex: 1,
    gap: 3,
  },
  savedAddressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  savedAddressLabel: {
    color: colors.text,
    fontSize: fonts.sizes.sm,
    fontWeight: '700',
  },
  defaultAddressPill: {
    color: colors.primary,
    backgroundColor: colors.primary + '18',
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    fontSize: fonts.sizes.xs,
    fontWeight: '700',
  },
  savedAddressText: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    lineHeight: 19,
  },
  savedAddressMeta: {
    color: colors.textMuted,
    fontSize: fonts.sizes.xs,
    fontWeight: '600',
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
  shipHelp: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.md,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  trackingInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    height: 52,
    gap: spacing.sm,
  },
  trackingInput: {
    flex: 1,
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '600',
  },
  disputeNotice: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.warning + '12',
    borderWidth: 1,
    borderColor: colors.warning + '30',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  disputeNoticeText: {
    flex: 1,
  },
  disputeTitle: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  disputeDescription: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    lineHeight: 20,
  },
  disputeTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  disputeTypeButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.backgroundLight,
  },
  disputeTypeButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '18',
  },
  disputeTypeText: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    fontWeight: '600',
  },
  disputeTypeTextActive: {
    color: colors.primary,
  },
  disputeInput: {
    minHeight: 112,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.backgroundLight,
    color: colors.text,
    fontSize: fonts.sizes.md,
    lineHeight: 22,
    padding: spacing.md,
  },
  disputeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  cancelDisputeText: {
    color: colors.textSecondary,
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
