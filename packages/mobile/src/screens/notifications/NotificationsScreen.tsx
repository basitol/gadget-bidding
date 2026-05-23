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
import { colors, fonts, spacing, borderRadius } from '../../constants';
import { EmptyState, LoadingScreen } from '../../components';
import { notificationService } from '../../services';
import { formatRelativeTime } from '../../utils';
import { Notification } from '../../types';

type NotificationsScreenProps = {
  navigation: NativeStackNavigationProp<any>;
};

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({
  navigation,
}) => {
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
      setUnreadCount(countResponse.data?.count || 0);
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

  const handleDelete = async (id: string) => {
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
              await notificationService.deleteNotification(id);
              setNotifications(prev => prev.filter(n => n.id !== id));
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

    // Navigate based on notification type
    if (notification.data) {
      const data =
        typeof notification.data === 'string'
          ? JSON.parse(notification.data)
          : notification.data;

      if (data.auction_id) {
        navigation.navigate('Home', {
          screen: 'AuctionDetail',
          params: { auctionId: data.auction_id },
        });
      } else if (data.order_id) {
        navigation.navigate('Profile', {
          screen: 'OrderDetail',
          params: { orderId: data.order_id },
        });
      }
    }
  };

  const getNotificationIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
      bid_placed: 'trophy-outline',
      outbid: 'flash-outline',
      auction_won: 'trophy-outline',
      auction_lost: 'sad-outline',
      auction_ending: 'time-outline',
      order_created: 'cube-outline',
      order_shipped: 'car-outline',
      order_delivered: 'checkmark-circle-outline',
      payment_received: 'wallet-outline',
      payment_failed: 'close-circle-outline',
      wallet_funded: 'card-outline',
      withdrawal_completed: 'cash-outline',
      system: 'megaphone-outline',
    };
    return icons[type] || 'notifications-outline';
  };

  const renderNotification = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[styles.notificationItem, !item.is_read && styles.unreadItem]}
      activeOpacity={0.7}
      onPress={() => handleNotificationPress(item)}
      onLongPress={() => handleDelete(item.id)}
    >
      <View style={styles.notificationIcon}>
        <Ionicons
          name={getNotificationIcon(item.type)}
          size={20}
          color={colors.primary}
        />
      </View>
      <View style={styles.notificationContent}>
        <Text
          style={[styles.notificationTitle, !item.is_read && styles.unreadText]}
        >
          {item.title}
        </Text>
        <Text style={styles.notificationMessage} numberOfLines={2}>
          {item.message}
        </Text>
        <Text style={styles.notificationTime}>
          {formatRelativeTime(item.created_at)}
        </Text>
      </View>
      {!item.is_read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );

  if (isLoading) {
    return <LoadingScreen message="Loading notifications..." />;
  }

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
        <Text style={styles.title}>Notifications</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity
            onPress={handleMarkAllAsRead}
            style={styles.markAllButton}
          >
            <Text style={styles.markAllText}>Read All</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>

      {/* Unread Count Badge */}
      {unreadCount > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>
            {unreadCount} unread notification{unreadCount > 1 ? 's' : ''}
          </Text>
        </View>
      )}

      {/* Notifications List */}
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
  },
  title: {
    fontSize: fonts.sizes.xl,
    fontWeight: '700',
    color: colors.text,
  },
  markAllButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  markAllText: {
    color: colors.primary,
    fontSize: fonts.sizes.sm,
    fontWeight: '600',
  },
  placeholder: {
    width: 60,
  },
  unreadBadge: {
    backgroundColor: colors.primary + '20',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  unreadBadgeText: {
    color: colors.primary,
    fontSize: fonts.sizes.sm,
    fontWeight: '500',
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  unreadItem: {
    backgroundColor: colors.primary + '10',
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  notificationIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  iconEmoji: {
    fontSize: fonts.sizes.xl,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  unreadText: {
    fontWeight: '700',
  },
  notificationMessage: {
    color: colors.textSecondary,
    fontSize: fonts.sizes.sm,
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  notificationTime: {
    color: colors.textMuted,
    fontSize: fonts.sizes.xs,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginLeft: spacing.sm,
    marginTop: spacing.xs,
  },
  separator: {
    height: spacing.sm,
  },
});

export default NotificationsScreen;
