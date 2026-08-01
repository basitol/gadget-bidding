import api, { getErrorMessage } from './api';
import { Notification, ApiResponse, PaginatedResponse } from '../types';

type RawNotification = Notification & {
  notification_type?: Notification['type'];
};

const normalizeNotification = (
  notification: RawNotification
): Notification => ({
  ...notification,
  type: notification.type || notification.notification_type || 'system',
});

class NotificationService {
  // Get notifications
  async getNotifications(
    page = 1,
    limit = 20
  ): Promise<PaginatedResponse<Notification>> {
    try {
      const response = await api.get('/notifications', {
        params: { page, limit },
      });
      return {
        ...response.data,
        data: (response.data.data || []).map(normalizeNotification),
      };
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Get unread count
  async getUnreadCount(): Promise<ApiResponse<{ unread_count: number }>> {
    try {
      const response = await api.get('/notifications/unread-count');
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Mark as read
  async markAsRead(id: string): Promise<ApiResponse<Notification>> {
    try {
      const response = await api.put(`/notifications/${id}/read`);
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Mark all as read
  async markAllAsRead(): Promise<ApiResponse<{ marked_count: number }>> {
    try {
      const response = await api.put('/notifications/read-all');
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Delete notification
  async deleteNotification(id: string): Promise<ApiResponse<void>> {
    try {
      const response = await api.delete(`/notifications/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }
}

export const notificationService = new NotificationService();
