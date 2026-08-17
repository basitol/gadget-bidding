import { disconnectAdminSocket } from '@/lib/socket';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

export type AdminUser = {
  id: string;
  full_name: string;
  phone_number: string;
  role: string;
};

export type PageResult<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages?: number;
    total_pages?: number;
  };
};

export type AdminNotification = {
  id: string;
  notification_type?: string;
  type?: string;
  title: string;
  message: string;
  data?: Record<string, any> | string | null;
  is_read?: boolean;
  created_at?: string;
};

export type RiskFlag = {
  type: string;
  label: string;
  severity: 'medium' | 'high' | 'critical';
  reason: string;
  signal_count: number;
  last_signal_at?: string | null;
  created_at?: string | null;
};

export type AdminSellerProfile = {
  user: {
    id: string;
    full_name: string;
    phone_number: string;
    email?: string | null;
    avatar_url?: string | null;
    role: string;
    is_verified?: boolean | null;
    is_active?: boolean | null;
    created_at?: string | null;
    wallet: {
      balance: number;
      currency: string;
      is_locked: boolean;
    };
    risk_flags?: RiskFlag[];
  };
  stats: Record<string, number>;
  latest_gadgets: Array<{
    id: string;
    title: string;
    brand?: string | null;
    model?: string | null;
    condition: string;
    status?: string | null;
    image?: string | null;
    created_at?: string | null;
    category?: { name: string; slug: string } | null;
  }>;
  latest_auctions: Array<{
    id: string;
    title: string;
    image?: string | null;
    status?: string | null;
    current_price: number;
    total_bids: number;
    end_time?: string | null;
  }>;
  latest_sales: Array<{
    id: string;
    order_number: string;
    title: string;
    image?: string | null;
    total_amount: number;
    seller_payout: number;
    payment_status?: string | null;
    fulfillment_status?: string | null;
    created_at?: string | null;
    buyer?: {
      id: string;
      full_name: string;
      phone_number: string;
    } | null;
  }>;
  latest_disputes: Array<{
    id: string;
    dispute_type: string;
    description: string;
    status?: string | null;
    resolution?: string | null;
    created_at?: string | null;
    order?: {
      id: string;
      order_number: string;
      total_amount: number;
      payment_status?: string | null;
      fulfillment_status?: string | null;
    } | null;
    raised_by?: {
      id: string;
      full_name: string;
      phone_number: string;
    } | null;
  }>;
};

function getToken() {
  return localStorage.getItem('gb_admin_token');
}

function getRefreshToken() {
  return localStorage.getItem('gb_admin_refresh_token');
}

function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(window.atob(normalized));
  } catch {
    return null;
  }
}

function tokenExpiresSoon(token: string, bufferSeconds = 90) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;
  return payload.exp * 1000 - Date.now() <= bufferSeconds * 1000;
}

function isAuthPath(path: string) {
  return (
    path.startsWith('/auth/login') || path.startsWith('/auth/refresh-token')
  );
}

function redirectToLogin() {
  if (window.location.pathname === '/login') return;
  window.location.replace('/login');
}

export function setSession(
  token: string,
  user: AdminUser,
  refreshToken?: string
) {
  localStorage.setItem('gb_admin_token', token);
  localStorage.setItem('gb_admin_user', JSON.stringify(user));
  if (refreshToken) {
    localStorage.setItem('gb_admin_refresh_token', refreshToken);
  } else {
    localStorage.removeItem('gb_admin_refresh_token');
  }
}

export function clearSession() {
  localStorage.removeItem('gb_admin_token');
  localStorage.removeItem('gb_admin_refresh_token');
  localStorage.removeItem('gb_admin_user');
  disconnectAdminSocket();
}

export async function getApiHealth() {
  try {
    const res = await fetch(`${API_BASE.replace(/\/api\/v1$/, '')}/healthz`);
    if (res.ok) {
      const text = await res.text();
      return { endpoint: '/healthz', ok: text === 'ok', raw: text };
    }
  } catch {
    // fall through to richer health check
  }

  const res = await fetch(`${API_BASE}/health`);
  const json = await res.json().catch(() => ({}));
  return {
    endpoint: '/api/v1/health',
    ok: res.ok && json.status === 'ok',
    raw: json,
  };
}

export function getStoredUser(): AdminUser | null {
  const raw = localStorage.getItem('gb_admin_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminUser;
  } catch {
    return null;
  }
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAdminToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;

    const res = await fetch(`${API_BASE}/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) return null;

    const nextToken = json.data?.access_token;
    const nextRefreshToken = json.data?.refresh_token;
    if (!nextToken || typeof nextToken !== 'string') return null;

    localStorage.setItem('gb_admin_token', nextToken);
    if (nextRefreshToken && typeof nextRefreshToken === 'string') {
      localStorage.setItem('gb_admin_refresh_token', nextRefreshToken);
    }
    return nextToken;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

async function getUsableToken(path: string) {
  if (isAuthPath(path)) return null;

  const token = getToken();
  if (!token) return null;

  if (tokenExpiresSoon(token)) {
    const refreshed = await refreshAdminToken();
    return refreshed || token;
  }

  return token;
}

async function fetchJson<T>(
  path: string,
  options: RequestInit,
  token?: string | null
): Promise<{ res: Response; json: T | any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let { res, json } = await fetchJson<T>(
    path,
    options,
    await getUsableToken(path)
  );

  if (res.status === 401 && !isAuthPath(path)) {
    const nextToken = await refreshAdminToken();
    if (nextToken) {
      ({ res, json } = await fetchJson<T>(path, options, nextToken));
    }
  }

  if (!res.ok) {
    if (res.status === 401) {
      clearSession();
      redirectToLogin();
    }
    throw new Error(
      json.error || json.message || `Request failed (${res.status})`
    );
  }
  return json as T;
}

function qs(params: Record<string, string | number | boolean | undefined>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && v !== 'all') sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export async function login(phone_number: string, password: string) {
  const json = await request<{
    success: boolean;
    data: { user: AdminUser; access_token: string; refresh_token?: string };
  }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: phone_number, password }),
  });

  if (json.data.user.role !== 'admin') {
    throw new Error('This account is not an admin');
  }

  setSession(json.data.access_token, json.data.user, json.data.refresh_token);
  return json.data.user;
}

export const adminApi = {
  stats: () =>
    request<{ success: boolean; data: Record<string, number> }>('/admin/stats'),

  activity: (params: Record<string, any> = {}) =>
    request<PageResult<any>>(`/admin/activity${qs(params)}`),

  gadgets: (params: Record<string, any> = {}) =>
    request<PageResult<any>>(`/admin/gadgets${qs(params)}`),

  approveGadget: (id: string) =>
    request(`/admin/gadgets/${id}/approve`, { method: 'POST' }),

  rejectGadget: (id: string, reason: string) =>
    request(`/admin/gadgets/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  auctions: (params: Record<string, any> = {}) =>
    request<PageResult<any>>(`/admin/auctions${qs(params)}`),

  cancelAuction: (id: string, force = false) =>
    request(`/admin/auctions/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ force }),
    }),

  orders: (params: Record<string, any> = {}) =>
    request<PageResult<any>>(`/admin/orders${qs(params)}`),

  updateOrder: (
    id: string,
    body: {
      payment_status?: string;
      fulfillment_status?: string;
      tracking_number?: string | null;
      payout_status?: string;
      payout_reference?: string | null;
    }
  ) =>
    request(`/admin/orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  createSecondPlaceOffer: (id: string) =>
    request(`/admin/orders/${id}/second-place-offer`, {
      method: 'POST',
    }),

  users: (params: Record<string, any> = {}) =>
    request<PageResult<any>>(`/admin/users${qs(params)}`),

  sellerProfile: (id: string) =>
    request<{ success: boolean; data: AdminSellerProfile }>(
      `/admin/users/${id}/seller-profile`
    ),

  updateUser: (
    id: string,
    body: {
      role?: string;
      is_active?: boolean;
      is_verified?: boolean;
      wallet_locked?: boolean;
    }
  ) =>
    request(`/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  reactivateUser: (
    id: string,
    body: { reference?: string; note?: string } = {}
  ) =>
    request(`/admin/users/${id}/reactivate`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  disputes: (params: Record<string, any> = {}) =>
    request<PageResult<any>>(`/admin/disputes${qs(params)}`),

  updateDispute: (id: string, body: { status: string; resolution?: string }) =>
    request(`/admin/disputes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  payments: (params: Record<string, any> = {}) =>
    request<PageResult<any>>(`/admin/payments${qs(params)}`),

  auditLogs: (params: Record<string, any> = {}) =>
    request<PageResult<any>>(`/admin/audit-logs${qs(params)}`),

  supportThreads: (params: Record<string, any> = {}) =>
    request<PageResult<any>>(`/admin/support/threads${qs(params)}`),

  supportMessages: (id: string, params: Record<string, any> = {}) =>
    request<PageResult<any>>(
      `/admin/support/threads/${id}/messages${qs(params)}`
    ),

  replySupport: (id: string, body: string) =>
    request(`/admin/support/threads/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),

  closeSupport: (id: string) =>
    request(`/admin/support/threads/${id}/close`, { method: 'POST' }),

  notifications: (params: Record<string, any> = {}) =>
    request<
      PageResult<AdminNotification> & {
        success: boolean;
        unread_count?: number;
      }
    >(`/notifications${qs(params)}`),

  notificationUnreadCount: () =>
    request<{ success: boolean; data: { unread_count: number } }>(
      '/notifications/unread-count'
    ),

  markNotificationRead: (id: string) =>
    request(`/notifications/${id}/read`, { method: 'PUT' }),

  markAllNotificationsRead: () =>
    request('/notifications/read-all', { method: 'PUT' }),
};
