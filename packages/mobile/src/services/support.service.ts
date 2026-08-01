import api from './api';

export type SupportThread = {
  id: string;
  seller_id: string;
  status: string;
  subject?: string | null;
  last_message_at?: string;
  last_message_preview?: string | null;
  seller_unread_count?: number;
  admin_unread_count?: number;
};

export type SupportMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender?: {
    id: string;
    full_name: string;
    role: string;
  };
};

export const supportService = {
  async getMyThread() {
    const res = await api.get<{ success: boolean; data: SupportThread }>(
      '/support/thread'
    );
    return res.data;
  },

  async getMessages(threadId: string, page = 1, limit = 50) {
    const res = await api.get<{
      success: boolean;
      data: SupportMessage[];
      pagination?: { page: number; limit: number; total: number };
    }>(`/support/threads/${threadId}/messages`, {
      params: { page, limit },
    });
    return res.data;
  },

  async sendMessage(threadId: string, body: string) {
    const res = await api.post<{ success: boolean; data: SupportMessage }>(
      `/support/threads/${threadId}/messages`,
      { body }
    );
    return res.data;
  },
};
