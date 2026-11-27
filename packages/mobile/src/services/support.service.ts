import api from './api';

/** The order a buyer's chat is about. Never carries seller details. */
export type SupportOrder = {
  id: string;
  order_number: string;
  title?: string | null;
};

export type SupportThread = {
  id: string;
  owner_role: 'buyer' | 'seller';
  status: string;
  subject?: string | null;
  last_message_at?: string;
  last_message_preview?: string | null;
  unread_count?: number;
  order?: SupportOrder | null;
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

/** Help › Contact support topics (backend support.service CONTACT_TOPICS). */
export type ContactTopic = 'order' | 'paying' | 'account' | 'other';

export const supportService = {
  /** Topic, optional order and a message (10+ characters) to our team. */
  async contact(data: { topic: ContactTopic; order_id?: string | null; body: string }) {
    const res = await api.post<{
      success: boolean;
      message?: string;
      data: { thread_id: string; reply_within: string };
    }>('/support/contact', data);
    return res.data;
  },

  /** Your open support chat (made on first use). Pass an order to get its summary back too. */
  async getMyThread(orderId?: string) {
    const res = await api.get<{ success: boolean; data: SupportThread }>(
      '/support/thread',
      {
        params: orderId ? { order_id: orderId } : undefined,
      }
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

  /** With `orderId`, support sees which order the message is about. */
  async sendMessage(threadId: string, body: string, orderId?: string) {
    const res = await api.post<{ success: boolean; data: SupportMessage }>(
      `/support/threads/${threadId}/messages`,
      orderId ? { body, order_id: orderId } : { body }
    );
    return res.data;
  },
};
