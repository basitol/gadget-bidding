import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { fonts, spacing, borderRadius, shadows } from '../../constants';
import { EmptyState, LoadingScreen } from '../../components';
import { notificationService } from '../../services';
import { formatRelativeTime } from '../../utils';
import { Notification } from '../../types';
import { useTheme } from '../../hooks';

type NotificationsScreenProps = {
  navigation: NativeStackNavigationProp<any>;
};

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({
  navigation,
}) => {
  const { colors } = useTheme();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async () => {
    try {
      const [notifResponse, countResponse] = await Promise.all([
        notificationService.getNotifications(),
        notificationService.getUnreadCount(),
      ]);
      setNotifications(notifResponse.data || []);
      setUnreadCount(countResponse.data?.unread_count || 0);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadNotifications();
  };

  const handleMarkAsRead = async (notification: Notification) => {
    if (notification.is_read) return;

    try {
      await notificationService.markAsRead(notification.id);
      setNotifications(prev =>
        prev.map(n => (n.id === notification.id ? { ...n, is_read: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      Alert.alert('Error', 'Failed to mark all as read');
    }
  };

  const handleDelete = async (notification: Notification) => {
    Alert.alert(
      'Delete Notification',
      'Are you sure you want to delete this notification?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await notificationService.deleteNotification(notification.id);
              setNotifications(prev =>
                prev.filter(n => n.id !== notification.id)
              );
              if (!notification.is_read) {
                setUnreadCount(prev => Math.max(0, prev - 1));
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete notification');
            }
          },
        },
      ]
    );
  };

  const handleNotificationPress = (notification: Notification) => {
    handleMarkAsRead(notification);

    if (notification.data) {
      let data: Record<string, any> = {};
      try {
        data =
          typeof notification.data === 'string'
            ? JSON.parse(notification.data)
            : notification.data;
      } catch {
        data = {};
      }

      const auctionId = data.auction_id || data.auctionId;
      const orderId = data.order_id || data.orderId;

      if (auctionId) {
        navigation.navigate('AuctionDetail', { auctionId });
      } else if (orderId) {
        navigation.navigate('OrderDetail', { orderId });
      }
    }
  };

  const getNotificationIcon = (
    type: string
  ): keyof typeof Ionicons.glyphMap => {
    const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
      bid_placed: 'trophy-outline',
      bid_defaulted: 'ban-outline',
      outbid: 'flash-outline',
      auction_won: 'trophy-outline',
      auction_lost: 'sad-outline',
      auction_ending: 'time-outline',
      auction_ending_soon: 'time-outline',
      order_created: 'cube-outline',
      order_shipped: 'car-outline',
      order_delivered: 'checkmark-circle-outline',
      payment_initiated: 'card-outline',
      payment_received: 'wallet-outline',
      payment_failed: 'close-circle-outline',
      wallet_funded: 'card-outline',
      withdrawal_completed: 'cash-outline',
      system: 'megaphone-outline',
    };
    return icons[type] || 'notifications-outline';
  };

  const getNotificationColor = (type: string) => {
    if (['payment_received', 'order_delivered', 'auction_won'].includes(type)) {
      return colors.success;
    }
    if (['outbid', 'auction_ending', 'auction_ending_soon'].includes(type)) {
      return colors.warning;
    }
    if (['payment_failed', 'auction_lost', 'bid_defaulted'].includes(type)) {
      return colors.error;
    }
    if (
      ['order_shipped', 'order_created', 'payment_initiated'].includes(type)
    ) {
      return colors.primary;
    }
    return colors.secondary;
  };

  const renderNotification = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[
        styles.notificationItem,
        {
          backgroundColor: colors.surface,
          borderColor: item.is_read ? colors.border : colors.primary + '45',
        },
        !item.is_read && {
          backgroundColor: colors.primary + '10',
          ...shadows.sm,
        },
      ]}
      activeOpacity={0.7}
      onPress={() => handleNotificationPress(item)}
      onLongPress={() => handleDelete(item)}
    >
      <View
        style={[
          styles.notificationIcon,
          { backgroundColor: getNotificationColor(item.type) + '16' },
        ]}
      >
        <Ionicons
          name={getNotificationIcon(item.type)}
          size={20}
          color={getNotificationColor(item.type)}
        />
      </View>
      <View style={styles.notificationContent}>
        <Text
          style={[
            styles.notificationTitle,
            { color: colors.text },
            !item.is_read && styles.unreadText,
          ]}
        >
          {item.title}
        </Text>
        <Text
          style={[styles.notificationMessage, { color: colors.textSecondary }]}
          numberOfLines={2}
        >
          {item.message}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.notificationTime, { color: colors.textMuted }]}>
            {formatRelativeTime(item.created_at)}
          </Text>
          <Text
            style={[
              styles.typePill,
              { color: getNotificationColor(item.type) },
            ]}
          >
            {item.type.replace(/_/g, ' ')}
          </Text>
        </View>
      </View>
      {!item.is_read && (
        <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
      )}
    </TouchableOpacity>
  );

  if (isLoading) {
    return <LoadingScreen message="Loading notifications..." />;
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[
            styles.backButton,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: colors.text }]}>
            Notifications
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Auction, order, payout, and support updates
          </Text>
        </View>
        {unreadCount > 0 ? (
          <TouchableOpacity
            onPress={handleMarkAllAsRead}
            style={[
              styles.markAllButton,
              { backgroundColor: colors.primary + '14' },
            ]}
          >
            <Text style={[styles.markAllText, { color: colors.primary }]}>
              Read all
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>

      {unreadCount > 0 && (
        <View
          style={[
            styles.unreadBadge,
            { backgroundColor: colors.primary, shadowColor: colors.primary },
          ]}
        >
          <Ionicons name="radio-button-on" size={14} color="#FFFFFF" />
          <Text style={styles.unreadBadgeText}>{unreadCount} unread</Text>
        </View>
      )}

      {notifications.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="No Notifications"
          message="You're all caught up! New notifications will appear here."
        />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          renderItem={renderNotification}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    fontSize: fonts.sizes.xxl,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  subtitle: {
    marginTop: 2,
    fontSize: fonts.sizes.sm,
    lineHeight: 18,
  },
  markAllButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
  },
  markAllText: {
    fontSize: fonts.sizes.sm,
    fontWeight: '700',
  },
  placeholder: {
    width: 68,
  },
  unreadBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: fonts.sizes.sm,
    fontWeight: '800',
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
    gap: spacing.md,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },
  notificationIcon: {
    width: 46,
    height: 46,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: fonts.sizes.md,
    fontWeight: '800',
    marginBottom: spacing.xs,
    letterSpacing: -0.2,
  },
  unreadText: {
    fontWeight: '900',
  },
  notificationMessage: {
    fontSize: fonts.sizes.sm,
    lineHeight: 20,
  },
  metaRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  notificationTime: {
    fontSize: fonts.sizes.xs,
    fontWeight: '600',
  },
  typePill: {
    fontSize: fonts.sizes.xs,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: spacing.sm,
    marginTop: spacing.xs,
  },
  separator: {
    height: 0,
  },
});

export default NotificationsScreen;
