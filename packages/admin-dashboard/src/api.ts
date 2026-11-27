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
    business_name?: string | null;
    cac_number?: string | null;
    seller_kyb_status?: 'not_started' | 'pending' | 'approved' | 'rejected';
    seller_kyb_submitted_at?: string | null;
    seller_kyb_reviewed_at?: string | null;
    seller_kyb_rejection_reason?: string | null;
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
    path.startsWith('/auth/login') ||
    path.startsWith('/auth/refresh-token') ||
    path.startsWith('/auth/password/')
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

type SignInResult =
  | { done: true; user: AdminUser }
  | { done: false; verification_id: string; email_hint: string };

function finishSignIn(data: {
  user: AdminUser;
  access_token: string;
  refresh_token?: string;
}): SignInResult {
  if (data.user.role !== 'admin') {
    throw new Error("This account isn't on the Gadgets Bidding team. Use your work email.");
  }
  setSession(data.access_token, data.user, data.refresh_token);
  return { done: true, user: data.user };
}

/** Password sign-in. With 2-step sign-in on, it asks for the emailed code next. */
export async function login(identifier: string, password: string): Promise<SignInResult> {
  const json = await request<{ success: boolean; data: any }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  });
  if (json.data?.two_factor_required) {
    return { done: false, verification_id: json.data.verification_id, email_hint: json.data.email_hint };
  }
  return finishSignIn(json.data);
}

export async function loginWithCode(verification_id: string, otp: string): Promise<SignInResult> {
  const json = await request<{ success: boolean; data: any }>('/auth/login/2fa', {
    method: 'POST',
    body: JSON.stringify({ verification_id, otp }),
  });
  return finishSignIn(json.data);
}

/** Password reset by emailed code (same endpoints as the apps). */
export const passwordReset = {
  start: (email: string) =>
    request<{ data: { verification_id: string; expires_in: number } }>('/auth/password/forgot', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  verify: (verification_id: string, otp: string) =>
    request<{ data: { verification_id: string } }>('/auth/password/verify', {
      method: 'POST',
      body: JSON.stringify({ verification_id, otp }),
    }),
  resend: (verification_id: string) =>
    request<any>('/auth/password/resend', {
      method: 'POST',
      body: JSON.stringify({ verification_id }),
    }),
  finish: (verification_id: string, password: string) =>
    request<{ data: { email: string } }>('/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify({ verification_id, password }),
    }),
};

export type QueueCounts = {
  kyb: number;
  listing_review: number;
  inspection_hub: number;
  disputes: number;
  live_auctions: number;
  payouts_ready: number;
  unread_notifications: number;
  /** Listings buyers reported that nobody has looked at yet. */
  listing_reports: number;
};

export type ListingReport = {
  id: string;
  reason: 'stolen' | 'fake' | 'wrong_details' | 'other';
  reason_label: string;
  details: string | null;
  status: 'open' | 'actioned' | 'dismissed';
  resolution_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  reports_on_listing: number;
  reporter: { id: string; name: string | null; email: string | null };
  auction: {
    id: string;
    status: string;
    title: string;
    image: string | null;
    current_price: number;
    end_time: string;
    seller: { id: string | null; name: string | null; code: string | null };
  } | null;
};

/** Listings buyers reported (stolen, fake, wrong details). */
export const reportsApi = {
  list: (status: 'open' | 'actioned' | 'dismissed' | 'all' = 'open') =>
    request<PageResult<ListingReport>>(`/admin/listing-reports?status=${status}`),
  resolve: (id: string, status: 'actioned' | 'dismissed', note: string) =>
    request<{ data: unknown }>(`/admin/listing-reports/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ status, note }),
    }),
};

export type AttentionItem = {
  id: string;
  kind: 'kyb' | 'listing' | 'dispute' | 'hub' | 'payouts';
  queue: string;
  title: string;
  sub: string;
  due_at: string | null;
  route: string;
};

export type Overview = {
  generated_at: string;
  stats: {
    gross_sales_30d: number;
    paid_orders_30d: number;
    live_auctions: number;
    ending_next_hour: number;
    bids_today: number;
    held_in_escrow: number;
    escrow_orders: number;
    kyb_queue: number;
    at_hub: number;
  };
  queues: QueueCounts;
  series: { date: string; gmv: number; bids: number; users: number }[];
  attention: { total: number; items: AttentionItem[] };
};

export type RuleRow = { key: string; label: string; value: string; note?: string };
export type ChecklistItem = { key: string; label: string; done: boolean; hint: string };

export type ReleaseSettings = {
  min_version: string;
  latest_version: string;
  store_urls: { ios: string | null; android: string | null };
  whats_new: string[];
  updated_at: string | null;
};

export type ReleaseInput = {
  min_version: string;
  latest_version: string;
  ios_store_url: string | null;
  android_store_url: string | null;
  whats_new: string[];
};

export type MaintenanceWindow = {
  id: string;
  started_at: string;
  back_by: string | null;
  ended_at: string | null;
  message: string | null;
  reason: string | null;
  paused_seconds: number | null;
  auctions_extended: number | null;
};

export type MaintenanceEnded = {
  id: string;
  started_at: string;
  ended_at: string;
  paused_seconds: number;
  auctions_extended: number;
};

export type AppConfigAdmin = {
  release: ReleaseSettings;
  maintenance: {
    active: boolean;
    id: string | null;
    started_at: string | null;
    back_by: string | null;
    message: string | null;
    /** Auctions that would get time added back if it ended now. */
    affected_auctions: number;
  };
  history: MaintenanceWindow[];
};

export const adminApi = {
  overview: () => request<{ data: Overview }>('/admin/overview'),
  queues: () => request<{ data: QueueCounts }>('/admin/queues'),
  tasks: () => request<{ data: { total: number; items: AttentionItem[] } }>('/admin/tasks'),
  rules: () =>
    request<{ data: { fees: RuleRow[]; rules: RuleRow[]; review_targets: RuleRow[] } }>('/admin/rules'),
  launchChecklist: () =>
    request<{ data: { done: number; total: number; items: ChecklistItem[] } }>('/admin/launch-checklist'),
  me: () => request<{ data: AdminUser & { two_factor_enabled?: boolean; email?: string } }>('/auth/me'),
  setTwoFactor: (enabled: boolean, password: string) =>
    request<{ data: { two_factor_enabled: boolean } }>('/auth/2fa', {
      method: 'PUT',
      body: JSON.stringify({ enabled, password }),
    }),
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

  pendingSellerKyb: (params: Record<string, any> = {}) =>
    request<PageResult<any>>(`/admin/sellers/kyb-pending${qs(params)}`),

  approveSellerKyb: (id: string) =>
    request(`/admin/sellers/${id}/kyb/approve`, { method: 'POST' }),

  rejectSellerKyb: (id: string, reason: string) =>
    request(`/admin/sellers/${id}/kyb/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

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

  disputeCase: (id: string) => request<any>(`/admin/disputes/${id}`),

  disputeMessage: (id: string, body: string) =>
    request<any>(`/admin/disputes/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),

  /** The "what happens next" line the buyer sees under Team review. Empty clears it. */
  disputeNextStep: (id: string, text: string) =>
    request<any>(`/admin/disputes/${id}/next-step`, {
      method: 'PUT',
      body: JSON.stringify({ text }),
    }),

  decideDispute: (id: string, outcome: 'refund' | 'not_upheld', findings: string) =>
    request<any>(`/admin/disputes/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify({ outcome, findings }),
    }),

  disputeReturnReceived: (id: string) =>
    request<any>(`/admin/disputes/${id}/return-received`, { method: 'POST' }),

  payments: (params: Record<string, any> = {}) =>
    request<PageResult<any>>(`/admin/payments${qs(params)}`),

  auditLogs: (params: Record<string, any> = {}) =>
    request<PageResult<any>>(`/admin/audit-logs${qs(params)}`),

  /** App versions (forced update) and maintenance mode. */
  appConfig: () => request<{ data: AppConfigAdmin }>('/admin/app-config'),
  saveRelease: (body: ReleaseInput) =>
    request<{ data: AppConfigAdmin }>('/admin/app-config/release', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  startMaintenance: (body: { back_by: string; reason: string; message?: string }) =>
    request<{ data: AppConfigAdmin }>('/admin/app-config/maintenance/start', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateMaintenance: (body: { back_by?: string; message?: string | null }) =>
    request<{ data: AppConfigAdmin }>('/admin/app-config/maintenance', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  endMaintenance: () =>
    request<{ data: AppConfigAdmin & { ended: MaintenanceEnded } }>('/admin/app-config/maintenance/end', {
      method: 'POST',
    }),

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
