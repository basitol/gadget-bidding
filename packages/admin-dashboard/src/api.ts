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

/* ---------------- Errors, connection and paused accounts ---------------- */

/** A request that didn't work: the HTTP status (0 when the server couldn't be reached) and our error code. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public data?: any
  ) {
    super(message);
  }
}

/**
 * Whether the dashboard can reach the API. "offline": this computer has no connection;
 * "server": it has one but our API didn't answer. lastOkAt: the last answer we got, for
 * "Showing data from 10:42 am".
 */
export type NetState = { down: false } | { down: true; reason: 'offline' | 'server'; lastOkAt: number | null };
let netState: NetState = { down: false };
let lastOkAt: number | null = null;
const netListeners = new Set<(s: NetState) => void>();

export const getNetState = () => netState;
export function onNetChange(fn: (s: NetState) => void) {
  netListeners.add(fn);
  return () => {
    netListeners.delete(fn);
  };
}
function setNet(next: NetState) {
  if (next.down === netState.down && (!next.down || (netState.down && next.reason === netState.reason))) return;
  netState = next;
  netListeners.forEach(fn => fn(netState));
}
function markReachable() {
  lastOkAt = Date.now();
  setNet({ down: false });
}
function markUnreachable() {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  setNet({ down: true, reason: offline ? 'offline' : 'server', lastOkAt });
}
if (typeof window !== 'undefined') {
  window.addEventListener('offline', markUnreachable);
}

const UNREACHABLE = "We can't reach Gadgets Bidding right now. Check your connection, then try again.";

/** Asks the API if it's there (public, cheap). True clears the offline banner. */
export async function checkConnection(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/app-config`, { cache: 'no-store' });
    if (res.ok) {
      markReachable();
      return true;
    }
  } catch {
    // still down
  }
  markUnreachable();
  return false;
}

/** Set when a session was paused mid-use; the sign-in page shows why. */
export const PAUSED_KEY = 'gb_admin_paused';
export type PauseDetails = { email: string | null; paused_at: string | null; reason: string | null };

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

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    markUnreachable();
    throw new ApiError(UNREACHABLE, 0, 'NETWORK');
  }
  const json = await res.json().catch(() => null);
  // Our API always answers in JSON. No JSON with a gateway error means the API itself is down.
  if (!json && res.status >= 500) {
    markUnreachable();
    throw new ApiError(UNREACHABLE, res.status, 'NETWORK');
  }
  markReachable();
  return { res, json: json ?? {} };
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
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
    // Paused while signed in: sign out and show why on the sign-in page.
    if (res.status === 403 && json.code === 'ACCOUNT_PAUSED') {
      sessionStorage.setItem(PAUSED_KEY, JSON.stringify(json.data ?? {}));
      clearSession();
      window.location.replace('/login?paused=1');
    }
    throw new ApiError(json.error || json.message || `Request failed (${res.status})`, res.status, json.code, json.data);
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

/** A listing as our team reviews it (GET /admin/gadgets/:id). Only staff ever see device_identifier. */
export type ListingReview = {
  id: string;
  title: string;
  description: string;
  brand: string | null;
  model: string | null;
  condition: string;
  images: string[];
  status: string | null;
  rejection_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  category_name: string | null;
  category_slug: string | null;
  specifications: Record<string, any>;
  /** Made with the 8-step listing flow (specifications.profile is set). */
  is_listing_flow: boolean;
  profile: string | null;
  profile_label: string | null;
  identifier_kind: 'imei' | 'serial' | 'none' | null;
  device_identifier: string | null;
  /** Same IMEI / serial on another seller's waiting or live listing, or on a sale in the last 90 days. */
  duplicate: boolean;
  identifier_matches: Array<{
    gadget_id: string;
    title: string;
    status: string | null;
    created_at: string;
    seller_id: string | null;
    seller_name: string | null;
    same_seller: boolean;
    sold_at: string | null;
    counts_as_duplicate: boolean;
  }>;
  disclosures: Array<{ label: string; tone: 'amber' | 'blue' | 'red' | 'neutral' }>;
  seller_note: string | null;
  seller_attested_at: string | null;
  auction_settings: {
    starting_price: number | null;
    reserve_price: number | null;
    buy_now_price: number | null;
    bid_increment: number | null;
    duration_hours: number | null;
    start_now: boolean;
  };
  seller: { id: string; full_name: string; phone_number: string; email: string | null; seller_code: string } | null;
  auction: { id: string; status: string | null; current_price: number } | null;
};

export type DeviceModel = {
  id: string;
  name: string;
  brand: string;
  profile: string;
  profile_label: string | null;
  category: string;
  category_label: string | null;
  aliases: string[];
  is_active: boolean;
  created_at: string;
  added_by: { id: string; full_name: string | null } | null;
  /** Listings that used this model name. */
  listings: number;
};

export const deviceModelsApi = {
  list: (params: { search?: string; category?: string; status?: 'active' | 'inactive' | 'all'; page?: number; limit?: number }) =>
    request<PageResult<DeviceModel>>(`/admin/device-models${qs({ ...params, status: params.status === 'all' ? undefined : params.status })}`),
  add: (body: { name: string; brand: string; profile: string; aliases: string[] }) =>
    request<{ data: DeviceModel; message?: string }>('/admin/device-models', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<{ name: string; brand: string; profile: string; aliases: string[]; is_active: boolean }>) =>
    request<{ data: DeviceModel; message?: string }>(`/admin/device-models/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
};

export type SellerApplicationStatus = 'draft' | 'in_review' | 'needs_info' | 'approved' | 'rejected';
/** "all" means everything that was sent (drafts are left out). */
export type SellerApplicationFilter = SellerApplicationStatus | 'all';
export type NumberCheck = 'pending' | 'matched' | 'not_matched';
export type SellerDocumentKind = 'cac_certificate' | 'owner_id' | 'shop_address';
export type SellerDocumentStatus = 'submitted' | 'accepted' | 'needs_fix';

/** One row in the verification team's queue. */
export type SellerApplicationRow = {
  id: string;
  user_id: string;
  seller_code: string;
  status: SellerApplicationStatus;
  business_name: string | null;
  owner_name: string | null;
  email: string | null;
  /** "RC 1234567" */
  registration: string | null;
  number_check: NumberCheck;
  documents: { uploaded: number; accepted: number; needs_fix: number };
  submitted_at: string | null;
  resubmitted_at: string | null;
  second_review: boolean;
  decided_at: string | null;
  registration_type: 'rc' | 'bn' | null;
  plaza: string | null;
  /** When it last came into the queue (sent, fix sent, or second review asked for). */
  queued_at: string | null;
  /** Review it by this time: 2 working days after it came into the queue. Null once decided. */
  review_due_at: string | null;
  checks: SellerCheckCounts;
};

export type SellerCheckState = 'passed' | 'review' | 'failed';
/** Registration number, each document, and the same details on another seller. */
export type SellerCheck = { key: string; label: string; state: SellerCheckState; sub: string };
export type SellerCheckCounts = { total: number; passed: number; review: number; failed: number };
/** Another seller account with the same business phone or RC/BN number. */
export type SellerDuplicate = {
  seller_code: string;
  business_name: string | null;
  status: SellerApplicationStatus;
  same: ('registration' | 'phone')[];
};

export type SellerApplicationCounts = Record<SellerApplicationStatus, number>;

export type SellerApplicationDocument = {
  kind: SellerDocumentKind;
  label: string;
  uploaded: boolean;
  name: string | null;
  mime: string | null;
  size: number | null;
  /** PDFs: page count (counted on upload). */
  pages?: number | null;
  uploaded_at: string | null;
  status: SellerDocumentStatus | null;
  /** What we asked the seller to fix (kept next to the new file after they upload it). */
  note: string | null;
  reviewed_at: string | null;
  /** An approved seller sent a new copy; it waits for a check (they keep selling meanwhile). */
  new_copy?: boolean;
  is_pdf: boolean;
  /** Signed links that stop working 10 minutes after the application was loaded. */
  url: string | null;
  /** Page 1 of a PDF, or a HEIC photo, as a JPG. */
  preview_url: string | null;
};

export type ProofOfAddressStatus = {
  state: 'missing' | 'valid' | 'expiring' | 'expired';
  expires_at: string | null;
  /** End of the grace period; new listings pause after it. */
  deadline: string | null;
  days_left?: number;
};

/** The full application, as our verification team sees it. */
export type SellerApplication = {
  id: string;
  user_id: string;
  seller_code: string;
  status: SellerApplicationStatus;
  email: string | null;
  account_created_at: string | null;
  account_active: boolean;
  business_name: string | null;
  owner_name: string | null;
  plaza: string | null;
  shop_number: string | null;
  business_phone: string | null;
  area: string | null;
  categories: string[];
  registration_type: 'rc' | 'bn' | null;
  registration_number: string | null;
  registration: string | null;
  number_check: NumberCheck;
  number_checked_at: string | null;
  documents: SellerApplicationDocument[];
  /** Proof of shop address: 12 months from upload, then a grace period before listings pause. */
  proof_of_address?: ProofOfAddressStatus;
  rules_accepted_at: string | null;
  submitted_at: string | null;
  resubmitted_at: string | null;
  decided_at: string | null;
  reviewed_by: string | null;
  team_note: string | null;
  reject_reason: string | null;
  second_review_requested_at: string | null;
  queued_at: string | null;
  review_due_at: string | null;
  checks: SellerCheck[];
  duplicates: SellerDuplicate[];
};

type ApplicationResult = { success: boolean; data: SellerApplication; message?: string };

/** Seller applications: business details, the RC/BN number and three private documents. */
export const sellerApplicationsApi = {
  list: (params: { status: SellerApplicationFilter; search?: string; page?: number }) => {
    const sp = new URLSearchParams({ status: params.status });
    if (params.search?.trim()) sp.set('search', params.search.trim());
    if (params.page && params.page > 1) sp.set('page', String(params.page));
    return request<PageResult<SellerApplicationRow> & { counts: SellerApplicationCounts }>(
      `/admin/seller-applications?${sp}`
    );
  },
  get: (id: string) => request<ApplicationResult>(`/admin/seller-applications/${id}`),
  numberCheck: (id: string, result: 'matched' | 'not_matched') =>
    request<ApplicationResult>(`/admin/seller-applications/${id}/number-check`, {
      method: 'POST',
      body: JSON.stringify({ result }),
    }),
  reviewDocument: (id: string, kind: SellerDocumentKind, status: 'accepted' | 'needs_fix', note?: string) =>
    request<ApplicationResult>(`/admin/seller-applications/${id}/documents/${kind}`, {
      method: 'POST',
      body: JSON.stringify({ status, note: note?.trim() || undefined }),
    }),
  approve: (id: string) =>
    request<ApplicationResult>(`/admin/seller-applications/${id}/approve`, { method: 'POST' }),
  needsInfo: (id: string, note: string) =>
    request<ApplicationResult>(`/admin/seller-applications/${id}/needs-info`, {
      method: 'POST',
      body: JSON.stringify({ note: note.trim() }),
    }),
  reject: (id: string, reason: string) =>
    request<ApplicationResult>(`/admin/seller-applications/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason.trim() }),
    }),
};

export type SellerPayoutStatus = 'sending' | 'paid' | 'failed';
export type SellerPayoutFilter = SellerPayoutStatus | 'all';

/** One 6 pm payout: a seller's ready orders, sent as one transfer. */
export type SellerPayoutRow = {
  id: string;
  /** PO-20261127-7F3A2C */
  reference: string;
  status: SellerPayoutStatus;
  amount: number;
  order_count: number;
  /** The 6 pm run it belongs to. */
  scheduled_for: string;
  created_at: string;
  paid_at: string | null;
  failure_reason: string | null;
  via_paystack: boolean;
  /** While sending through Paystack. */
  transfer_state: 'queued' | 'starting' | 'sent' | null;
  transfer_code: string | null;
  /** What our team typed when they marked it paid by hand. */
  bank_reference: string | null;
  marked_by: { id: string; name: string } | null;
  bank_name: string | null;
  account_last4: string | null;
  account_name: string | null;
  seller: {
    id: string;
    code: string;
    business_name: string | null;
    name: string;
    email: string | null;
    phone: string | null;
  };
  /** Empty once a payout failed (its orders went back to ready). */
  orders: Array<{
    id: string;
    order_number: string;
    amount: number;
    payout_status: string | null;
    title: string | null;
    open_case: boolean;
  }>;
};

type SellerPayoutResult = { success: boolean; data: SellerPayoutRow; message?: string };

/** The 6 pm seller payouts. Not live: our team sends them by hand and marks them here. */
export const sellerPayoutsApi = {
  list: (params: { status: SellerPayoutFilter; search?: string; page?: number; limit?: number }) => {
    const sp = new URLSearchParams({ status: params.status });
    if (params.search?.trim()) sp.set('search', params.search.trim());
    if (params.page && params.page > 1) sp.set('page', String(params.page));
    if (params.limit) sp.set('limit', String(params.limit));
    return request<
      PageResult<SellerPayoutRow> & {
        counts: Record<SellerPayoutStatus, number>;
        sending_amount: number;
        automatic: boolean;
        next_run_at: string;
      }
    >(`/admin/seller-payouts?${sp}`);
  },
  markPaid: (id: string, bankReference: string) =>
    request<SellerPayoutResult>(`/admin/seller-payouts/${id}/mark-paid`, {
      method: 'POST',
      body: JSON.stringify({ bank_reference: bankReference.trim() }),
    }),
  markFailed: (id: string, reason: string) =>
    request<SellerPayoutResult>(`/admin/seller-payouts/${id}/mark-failed`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason.trim() }),
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

/** One line of the hub's 7-point check. */
export type InspectionCheck = { key: string; label: string };
/** What the hub recorded for an order (admin only: includes who checked it). */
export type OrderInspection = {
  checks: (InspectionCheck & { passed: boolean })[];
  passed: number;
  total: number;
  note: string | null;
  by: { id: string; name: string | null };
  at: string;
};
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

/** One search across orders, people (email, name, phone, seller ID) and listings. */
export type SearchHit = { id: string; path: string };
export type AdminSearchResult = {
  query: string;
  orders: (SearchHit & { order_number: string; title: string | null; status: string | null })[];
  users: (SearchHit & { name: string; email: string | null; role: string; seller_code: string | null })[];
  listings: (SearchHit & { title: string; status: string | null })[];
};

/** A page couldn't load: record it in the audit log under its reference. False when that didn't work either. */
export async function reportPageError(body: { reference: string; page: string; status: number; message: string }) {
  try {
    await request<{ data: { logged: boolean } }>('/admin/client-errors', { method: 'POST', body: JSON.stringify(body) });
    return true;
  } catch {
    return false;
  }
}

/* ---------------- People (Users: buyers, sellers, suspended) ---------------- */

/**
 * active · suspended (team suspended the account) · listings_paused (team paused a seller's listings)
 * · store_closed · bidding_paused (3 missed payments in 90 days, automatic) · pending_approval
 * (a pause waiting for a second admin).
 */
export type PersonStatus =
  | 'active'
  | 'suspended'
  | 'listings_paused'
  | 'store_closed'
  | 'bidding_paused'
  | 'pending_approval';

export type SuspendReason = 'missed_payments' | 'shill_bidding' | 'abusive' | 'fraud' | 'other';
export type PauseReason = 'failed_inspections' | 'misleading' | 'stolen' | 'documents' | 'other';
export type RestoreReason = 'served' | 'mistake' | 'appeal';
export type SuspendDuration = '7d' | '30d' | 'permanent';
export type PauseDuration = 'until_fixed' | '30d' | 'close_store';

export type PeopleStats = {
  buyers: number;
  buyers_this_week: number;
  verified_sellers: number;
  /** Everyone in the Suspended tab (buyers and sellers). */
  suspended: number;
  /** Buyers with 3 missed payments in 90 days who aren't suspended. */
  suggested: { count: number; first: { id: string; name: string; missed: number } | null };
  tabs: { buyers: number; sellers: number; suspended: number };
};

export type BuyerRow = {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  joined_at: string | null;
  /** Paid orders. */
  orders: number;
  status: PersonStatus;
  /** 3 missed payments in 90 days: suggested for suspension. */
  suggested: boolean;
  missed_90d: number;
  /** Missed payments in 90 days that pause bidding (3). */
  missed_limit: number;
};

export type SellerRow = {
  id: string;
  /** Business (store) name. */
  name: string;
  email: string | null;
  joined_at: string | null;
  sales: number;
  /** Share of hub inspections passed (null before any). */
  passed_percent: number | null;
  rating: number | null;
  kyb_verified: boolean;
  /** No sales yet. */
  is_new: boolean;
  status: PersonStatus;
};

export type RestrictedRow = {
  /** The person (user id). */
  id: string;
  restriction_id: string | null;
  name: string;
  email: string | null;
  type: 'buyer' | 'seller';
  /** "Missed payments", "Stolen IMEI flagged", … */
  why: string;
  until: string | null;
  /** Admin's name, or null for automatic. */
  by: string | null;
  status: PersonStatus;
  /** team: a suspension or pause from this page · automatic: missed payments · legacy: switched off before reasons */
  source: 'team' | 'automatic' | 'legacy';
  /** A suspension or a listings pause (null for older switch-offs and automatic bidding pauses). */
  kind: 'suspend' | 'pause_listings' | null;
  /** A pause waiting for a second admin: whether you (not the requester) can approve it. */
  can_approve?: boolean;
};

export type RestrictionView = {
  id: string;
  kind: 'suspend' | 'pause_listings';
  status: 'pending' | 'active';
  reason: SuspendReason | PauseReason;
  reason_label: string;
  until: string | null;
  close_store: boolean;
  note: string | null;
  by: string | null;
  created_at: string;
  /** Second admin asked to approve (pending), or who approved it. */
  approver: string | null;
};

export type BuyerDetail = {
  id: string;
  name: string;
  email: string | null;
  /** "0803 ••• 1187" */
  phone_masked: string | null;
  avatar_url: string | null;
  joined_at: string | null;
  status: PersonStatus;
  two_factor: boolean;
  restriction: RestrictionView | null;
  stats: {
    orders: number;
    spent: number;
    live_bids: number;
    disputes: number;
    missed_90d: number;
    missed_limit: number;
    last_active_at: string | null;
  };
  counts: { orders: number; live_bids: number; disputes: number; notes: number };
};

export type BuyerOrder = {
  id: string;
  order_number: string;
  created_at: string | null;
  title: string;
  image: string | null;
  seller_code: string | null;
  amount: number;
  status: 'in_progress' | 'completed' | 'not_paid' | 'refunded' | 'cancelled';
  status_label: string;
};

export type BuyerLiveBid = {
  auction_id: string;
  title: string;
  image: string | null;
  my_bid: number;
  current_price: number;
  leading: boolean;
  ends_at: string;
  bids: number;
};

export type PersonDispute = {
  id: string;
  case_number: string;
  order_number: string | null;
  title: string | null;
  status: string;
  status_label: string;
  opened_at: string | null;
};

export type SellerDetail = {
  id: string;
  name: string;
  owner_name: string | null;
  /** "Shop 14, Otigba Tech Plaza, Computer Village" */
  shop: string | null;
  email: string | null;
  seller_code: string;
  joined_at: string | null;
  status: PersonStatus;
  kyb_status: string;
  application_id: string | null;
  restriction: RestrictionView | null;
  stats: {
    sales: number;
    sold_value: number;
    rating: number | null;
    ratings: number;
    passed_percent: number | null;
    open_disputes: number;
    /** Paid orders not paid out yet (escrow). */
    on_hold: number;
  };
  counts: { listings: number; payouts: number; notes: number };
  /** New listings paused on their own: failed hub checks or refunded cases in the window. */
  auto_pause: {
    paused: boolean;
    failed: { order_id: string; order_number: string; title: string; at: string; reason: string; kind: 'hub_check' | 'case' }[];
    count: number;
    limit: number;
    window_days: number;
    review_requested_at: string | null;
  };
};

export type SellerListing = {
  id: string;
  auction_id: string | null;
  title: string;
  image: string | null;
  price: number;
  bids: number | null;
  status: 'live' | 'scheduled' | 'in_review' | 'changes' | 'sold' | 'unsold' | 'paused' | 'rejected';
  status_label: string;
  /** "Ends in 24m", "Submitted 40m ago", "Case D-115 open" */
  sub: string;
  path: string;
};

export type SellerPayoutItem = {
  id: string;
  reference: string;
  amount: number;
  status: string;
  status_label: string;
  created_at: string;
  orders: number;
};

export type PersonNote = {
  id: string;
  body: string;
  author: string | null;
  created_at: string;
  /** note: typed here · suspend / pause / restore: the note left with that action */
  kind: 'note' | 'suspend' | 'pause' | 'restore';
};

/** What suspending or pausing would do right now, for the sheet's "What happens". */
export type RestrictionPreview = {
  name: string;
  email: string | null;
  type: 'buyer' | 'seller';
  joined_at: string | null;
  live_bids: number;
  live_auctions: number;
  escrow: number;
  /** Sellers with live auctions or money in escrow need a second admin. */
  needs_second_admin: boolean;
  approver: string | null;
  suggested_reason: SuspendReason | null;
  missed_90d: number;
  restriction: RestrictionView | null;
};

export type EmailPreview = { subject: string; html: string; summary: string };

export const peopleApi = {
  stats: () => request<{ data: PeopleStats }>('/admin/people/stats'),
  list: <T,>(tab: 'buyers' | 'sellers' | 'suspended', params: { search?: string; page?: number } = {}) =>
    request<{ data: T[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(
      `/admin/people${qs({ tab, search: params.search, page: params.page })}`
    ),
  buyer: (id: string) => request<{ data: BuyerDetail }>(`/admin/people/buyers/${id}`),
  buyerOrders: (id: string) => request<{ data: BuyerOrder[] }>(`/admin/people/buyers/${id}/orders`),
  buyerBids: (id: string) => request<{ data: BuyerLiveBid[] }>(`/admin/people/buyers/${id}/bids`),
  buyerDisputes: (id: string) => request<{ data: PersonDispute[] }>(`/admin/people/buyers/${id}/disputes`),
  seller: (id: string) => request<{ data: SellerDetail }>(`/admin/people/sellers/${id}`),
  liftListingPause: (id: string) =>
    request<{ data: { cleared_at: string; failed_cleared: number }; message?: string }>(
      `/admin/people/sellers/${id}/lift-listing-pause`,
      { method: 'POST' }
    ),
  sellerListings: (id: string) => request<{ data: SellerListing[] }>(`/admin/people/sellers/${id}/listings`),
  sellerPayouts: (id: string) => request<{ data: SellerPayoutItem[] }>(`/admin/people/sellers/${id}/payouts`),
  notes: (id: string) => request<{ data: PersonNote[] }>(`/admin/people/${id}/notes`),
  addNote: (id: string, body: string) =>
    request<{ data: PersonNote }>(`/admin/people/${id}/notes`, { method: 'POST', body: JSON.stringify({ body }) }),
  preview: (id: string, kind: 'suspend' | 'pause_listings') =>
    request<{ data: RestrictionPreview }>(`/admin/people/${id}/restriction-preview?kind=${kind}`),
  emailPreview: (
    id: string,
    params: { kind: 'suspend' | 'pause_listings' | 'restore'; reason: string; duration?: string }
  ) => request<{ data: EmailPreview }>(`/admin/people/${id}/email-preview${qs(params)}`),
  suspend: (id: string, body: { reason: SuspendReason; duration: SuspendDuration; note?: string }) =>
    request<{ data: { status: 'active' | 'pending'; restriction: RestrictionView } }>(`/admin/people/${id}/suspend`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  pauseListings: (id: string, body: { reason: PauseReason; duration: PauseDuration; note?: string }) =>
    request<{ data: { status: 'active' | 'pending'; restriction: RestrictionView } }>(
      `/admin/people/${id}/pause-listings`,
      { method: 'POST', body: JSON.stringify(body) }
    ),
  restore: (id: string, body: { reason: RestoreReason; note?: string }) =>
    request<{ data: { restored: true } }>(`/admin/people/${id}/restore`, { method: 'POST', body: JSON.stringify(body) }),
  approve: (restrictionId: string) =>
    request<{ data: RestrictionView }>(`/admin/restrictions/${restrictionId}/approve`, { method: 'POST' }),
  decline: (restrictionId: string) =>
    request<{ data: { declined: true } }>(`/admin/restrictions/${restrictionId}/decline`, { method: 'POST' }),
  passwordReset: (id: string) =>
    request<{ data: { sent_to: string } }>(`/admin/people/${id}/password-reset`, { method: 'POST' }),
};

export const adminApi = {
  search: (q: string) => request<{ data: AdminSearchResult }>(`/admin/search?q=${encodeURIComponent(q)}`),
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

  gadgetReview: (id: string) =>
    request<{ data: ListingReview }>(`/admin/gadgets/${id}`),

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

  /** The hub's checklist, in order. */
  inspectionChecks: () => request<{ data: InspectionCheck[] }>('/admin/inspection-checks'),

  /** Record the hub check for an order at the hub. A note is required when any check fails. */
  recordInspection: (id: string, body: { checks: Record<string, boolean>; note?: string }) =>
    request<{ data: { inspection: OrderInspection; all_passed: boolean }; message?: string }>(
      `/admin/orders/${id}/inspection`,
      { method: 'POST', body: JSON.stringify(body) }
    ),

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
      /** Why it's switched off (required for team accounts; they see it at sign-in). */
      reason?: string;
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

  /** "What our hub found" rows the seller and buyer see. An empty list clears them. */
  disputeHubFindings: (id: string, rows: { label: string; value: string }[]) =>
    request<any>(`/admin/disputes/${id}/hub-findings`, {
      method: 'PUT',
      body: JSON.stringify({ rows }),
    }),

  /** The returned item left the hub with the seller (collected, or our rider dropped it off). */
  disputeReturnedToSeller: (id: string) =>
    request<any>(`/admin/disputes/${id}/returned-to-seller`, { method: 'POST' }),

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

/** A seller's store: closed by the seller (Store › Close my store) or open. Our team can reopen it. */
export const sellerStoreAdminApi = {
  status: (sellerId: string) =>
    request<{ success: boolean; data: { closed_at: string | null } }>(`/admin/sellers/${sellerId}/store`),
  reopen: (sellerId: string) =>
    request<{ success: boolean; data: { closed_at: null } }>(`/admin/sellers/${sellerId}/reopen-store`, {
      method: 'POST',
    }),
};
