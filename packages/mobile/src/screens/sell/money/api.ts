import axios from 'axios';
import api, { getErrorMessage } from '../../../services/api';
import type { PayoutAccount } from '../../../services/payout.service';

/**
 * Calls behind the seller money screens: one order (GET /seller/orders/:id), one payout
 * (GET /seller/payouts/:id, POST …/statement) and the payout account change flow
 * (GET /seller/payout-account with its pause info, GET /seller/payout-account/check).
 */

export class MoneyError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number
  ) {
    super(message);
  }
}

const toError = (error: unknown) => {
  const res = axios.isAxiosError(error) ? error.response : undefined;
  const data = res?.data as { code?: string } | undefined;
  return new MoneyError(getErrorMessage(error), data?.code, res?.status);
};

const call = async <T,>(p: Promise<{ data: { data: T; message?: string } }>): Promise<T> => {
  try {
    return (await p).data.data;
  } catch (error) {
    throw toError(error);
  }
};

/* ---------------- Order ---------------- */

export type SellerOrderStage =
  | 'sold'
  | 'at_hub'
  | 'passed'
  | 'on_the_way'
  | 'delivered'
  | 'paid_out'
  | 'unpaid'
  | 'refunded'
  | 'cancelled';

export type StepKey = 'sold' | 'at_hub' | 'passed' | 'on_the_way' | 'delivered' | 'paid_out';
export const STEP_KEYS: StepKey[] = ['sold', 'at_hub', 'passed', 'on_the_way', 'delivered', 'paid_out'];

export type PayoutBlock = {
  code: 'PAYOUT_ACCOUNT_REQUIRED' | 'TWO_STEP_REQUIRED' | 'PAYOUTS_PAUSED';
  message: string;
  resumes_at?: string;
};

export interface SellerOrderDetail {
  id: string;
  order_number: string;
  stage: SellerOrderStage;
  /** Step reached, 0–5 (-1 before payment). */
  step: number;
  delivery_method: 'delivery' | 'pickup';
  item: { title: string; image: string | null; auction_id: string | null; bids: number };
  /** "Ikeja, Lagos" — never the buyer's name. */
  buyer_area: string | null;
  times: Record<StepKey, string | null>;
  dropoff_due_at: string | null;
  payment_due_at: string | null;
  confirm_by: string | null;
  buyer_confirmed_at: string | null;
  inspection: { passed: number; total: number } | null;
  money: { sale_price: number; platform_fee: number; fee_label: string; you_receive: number };
  payout: {
    status: string;
    next_payout_at: string | null;
    blocked: PayoutBlock | null;
    paid_at: string | null;
    batch: { id: string; reference: string; status: string } | null;
  };
  case: { id: string; number: string; status: string; open: boolean } | null;
  can_send_to_hub: boolean;
}

/* ---------------- Payout ---------------- */

export interface SellerPayoutDetail {
  id: string;
  reference: string;
  status: 'sending' | 'paid' | 'failed';
  amount: number;
  sent_at: string | null;
  scheduled_for: string;
  automatic: boolean;
  failure_reason: string | null;
  to: { bank_name: string | null; account_last4: string | null; account_name: string | null };
  bank_reference: string | null;
  order_count: number;
  orders: Array<{ id: string; order_number: string; title: string; image: string | null; sold_for: number; platform_fee: number; payout: number }>;
  charges: Array<{ id: string; reason: string; amount: number; order_number: string | null }>;
  totals: { sales: number; platform_fees: number; charges: number; paid_to_you: number };
}

/* ---------------- Payout account ---------------- */

export interface PayoutAccountFull {
  account: PayoutAccount | null;
  business_name: string | null;
  two_step_enabled: boolean;
  hold_days: number;
  /** If changed now, payouts resume at this 6 pm (null when there's no account yet). */
  change_resumes_at: string | null;
  payouts_paused_until: string | null;
  payouts_resume_at: string | null;
}

export interface AccountCheck {
  bank_code: string;
  bank_name: string;
  account_name: string;
  matches: boolean;
  business_name: string | null;
}

export const moneyService = {
  order: (orderId: string) => call<SellerOrderDetail>(api.get(`/seller/orders/${orderId}`)),
  /** "Send to hub": the item is with our hub team. */
  sendToHub: (orderId: string) => call<unknown>(api.put(`/orders/${orderId}/fulfillment`, { status: 'sent_to_backoffice' })),

  payout: (payoutId: string) => call<SellerPayoutDetail>(api.get(`/seller/payouts/${payoutId}`)),
  /** Emails a statement of the payout to the account's email. → "s•••@example.com" */
  emailStatement: (payoutId: string) => call<{ sent_to: string }>(api.post(`/seller/payouts/${payoutId}/statement`)),

  async payoutAccount(): Promise<PayoutAccountFull> {
    try {
      const res = await api.get('/seller/payout-account');
      const m = res.data.meta ?? {};
      return {
        account: res.data.data ?? null,
        business_name: m.business_name ?? null,
        two_step_enabled: !!m.two_step_enabled,
        hold_days: Number(m.hold_days) || 7,
        change_resumes_at: m.change_resumes_at ?? null,
        payouts_paused_until: m.payouts_paused_until ?? null,
        payouts_resume_at: m.payouts_resume_at ?? null,
      };
    } catch (error) {
      throw toError(error);
    }
  },
  /** The name the bank has on the account, and whether it's the business name. Saves nothing. */
  checkAccount: (bank_code: string, account_number: string) =>
    call<AccountCheck>(api.get('/seller/payout-account/check', { params: { bank_code, account_number } })),
};

/* ---------------- Formatting ---------------- */

/** ₦865,000 (no kobo). */
export const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const time = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();

/** "Nov 26, 2:14 pm" */
export const shortWhen = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time(d)}`;
};

/** "Nov 24, 2026 at 6:00 pm" */
export const longWhen = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${time(d)}`;
};

/** "Nov 24, 2026" */
export const longDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** "Dec 3" */
export const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** "6:00 pm today" / "6:00 pm tomorrow" / "6:00 pm Mon" / "6:00 pm, Dec 3" */
export const atWhen = (iso: string, now = Date.now()) => {
  const d = new Date(iso);
  const t = time(d);
  if (sameDay(d, new Date(now))) return `${t} today`;
  if (sameDay(d, new Date(now + 86_400_000))) return `${t} tomorrow`;
  if (d.getTime() - now < 6 * 86_400_000) return `${t} ${d.toLocaleDateString('en-US', { weekday: 'short' })}`;
  return `${t}, ${shortDay(iso)}`;
};
