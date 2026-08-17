import api, { getErrorMessage } from './api';
import {
  Wallet,
  WalletTransaction,
  ApiResponse,
  PaginatedResponse,
} from '../types';

export interface InitiateDepositData {
  amount: number;
  payment_method: 'paystack' | 'monnify' | 'bank_transfer';
  email?: string;
}

export interface InitiateWithdrawalData {
  amount: number;
  bank_code: string;
  account_number: string;
  account_name: string;
}

export interface DepositResponse {
  transaction_id: string;
  reference: string;
  authorization_url?: string;
  bank_details?: {
    bank_name: string;
    account_number: string;
    account_name: string;
  };
}

class WalletService {
  // Get wallet balance
  async getWallet(): Promise<ApiResponse<Wallet>> {
    try {
      const response = await api.get('/wallet');
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Get available balance (excluding held amounts)
  async getAvailableBalance(): Promise<
    ApiResponse<{
      available_balance: number;
      total_balance: number;
      held_balance: number;
    }>
  > {
    try {
      const response = await api.get('/wallet/balance');
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Get transaction history
  async getTransactions(
    page = 1,
    limit = 20
  ): Promise<PaginatedResponse<WalletTransaction>> {
    try {
      const response = await api.get('/wallet/transactions', {
        params: { page, limit },
      });
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Initiate deposit (fund wallet)
  async initiateDeposit(
    data: InitiateDepositData
  ): Promise<ApiResponse<DepositResponse>> {
    try {
      const response = await api.post('/wallet/fund', data);
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Verify payment
  async verifyDeposit(
    reference: string
  ): Promise<ApiResponse<WalletTransaction>> {
    try {
      const response = await api.get('/wallet/verify-payment', {
        params: { reference },
      });
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Initiate withdrawal
  async initiateWithdrawal(
    data: InitiateWithdrawalData
  ): Promise<ApiResponse<WalletTransaction>> {
    try {
      const response = await api.post('/wallet/withdraw', data);
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Get bank list
  async getBanks(): Promise<
    ApiResponse<Array<{ code: string; name: string }>>
  > {
    try {
      const response = await api.get('/wallet/banks');
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  // Verify bank account (resolve account)
  async verifyBankAccount(
    bank_code: string,
    account_number: string
  ): Promise<ApiResponse<{ account_name: string; account_number: string }>> {
    try {
      const response = await api.get('/wallet/resolve-account', {
        params: { bank_code, account_number },
      });
      return response.data;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }
}

export const walletService = new WalletService();
