import axios from 'axios';
import api, { getErrorMessage } from './api';

/** A seller's payout account and payouts: /api/v1/seller/payout-account and /api/v1/wallet/withdraw. */

export interface PayoutAccount {
  bank_code: string;
  bank_name: string;
  account_number_last4: string;
  account_name: string;
  added_at: string | null;
}

export interface PayoutAccountState {
  account: PayoutAccount | null;
  /** The registered business name the account must be in. */
  business_name: string | null;
  two_step_enabled: boolean;
}

export interface Bank {
  id: number;
  code: string;
  name: string;
}

export interface PayoutSent {
  transaction_id: string;
  reference: string;
  amount: number;
  status: string;
  payout_account: PayoutAccount;
}

/** PAYOUT_ACCOUNT_REQUIRED, TWO_STEP_REQUIRED, NAME_MISMATCH, WRONG_PASSWORD, … */
export class PayoutError extends Error {
  constructor(
    message: string,
    public code?: string,
    public missing: string[] = []
  ) {
    super(message);
  }
}

const toPayoutError = (error: unknown) => {
  const data = axios.isAxiosError(error) ? (error.response?.data as { code?: string; missing?: string[] } | undefined) : undefined;
  return new PayoutError(getErrorMessage(error), data?.code, data?.missing ?? []);
};

let bankCache: Bank[] | null = null;

export const payoutService = {
  async get(): Promise<PayoutAccountState> {
    try {
      const res = await api.get('/seller/payout-account');
      return {
        account: res.data.data ?? null,
        business_name: res.data.meta?.business_name ?? null,
        two_step_enabled: !!res.data.meta?.two_step_enabled,
      };
    } catch (error) {
      throw toPayoutError(error);
    }
  },

  async save(input: { bank_code: string; account_number: string; password: string }): Promise<PayoutAccount> {
    try {
      const res = await api.put('/seller/payout-account', input);
      return res.data.data;
    } catch (error) {
      throw toPayoutError(error);
    }
  },

  async banks(): Promise<Bank[]> {
    if (bankCache?.length) return bankCache;
    try {
      const res = await api.get('/wallet/banks');
      const list: Bank[] = res.data.data ?? [];
      if (list.length) bankCache = list;
      return list;
    } catch (error) {
      throw toPayoutError(error);
    }
  },

  /** The name the bank has on the account. */
  async resolve(bank_code: string, account_number: string): Promise<string> {
    try {
      const res = await api.get('/wallet/resolve-account', { params: { bank_code, account_number } });
      return res.data.data?.account_name ?? '';
    } catch (error) {
      throw toPayoutError(error);
    }
  },

  /** Sellers: always paid to the saved payout account. */
  async withdraw(amount: number): Promise<{ payout: PayoutSent; message?: string }> {
    try {
      const res = await api.post('/wallet/withdraw', { amount });
      return { payout: res.data.data, message: res.data.message };
    } catch (error) {
      throw toPayoutError(error);
    }
  },
};
