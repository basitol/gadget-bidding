import * as SecureStore from 'expo-secure-store';
import api, { getErrorMessage } from './api';
import { STORAGE_KEYS } from '../constants';
import type { User } from '../types';
import type { Tone } from './sellerTabs.service';

/** The staff app (role "staff"): one store's hub work, never its money. */
export interface StaffHome {
  store: { name: string };
  me: { full_name: string; email: string | null; id_label: string | null; id_phrase: string; pickup_code: string | null };
  hub: { address: string };
  /** Sold and paid: take these to the hub. `code` is what hub staff look it up by. */
  dropoff: { order_id: string; code: string; title: string; image: string | null; due_at: string }[];
  /** Returned after a refund and waiting at the hub. */
  collect: {
    order_id: string | null;
    code: string;
    title: string;
    image: string | null;
    at_hub_since: string | null;
    free_until: string | null;
  }[];
  on_the_way: { id: string; order_number: string; title: string; image: string | null; chip: { label: string; tone: Tone } }[];
}

/** The owner removed them, or the store closed: nothing to show until they're added again. */
export class StaffAccessError extends Error {}

const call = async <T,>(p: Promise<{ data: { data: T } }>): Promise<T> => {
  try {
    return (await p).data.data;
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 403) throw new StaffAccessError(getErrorMessage(error));
    throw new Error(getErrorMessage(error));
  }
};

export const staffService = {
  /* Joining from the owner's invite (no session yet) */
  joinStart: (email: string) =>
    call<{ verification_id: string; email: string; expires_in: number; full_name: string }>(
      api.post('/auth/staff/join/email', { email })
    ),
  joinVerify: (verification_id: string, otp: string) =>
    call<{ verification_id: string; email: string }>(api.post('/auth/staff/join/verify', { verification_id, otp })),
  joinResend: (verification_id: string) => call<{ expires_in: number }>(api.post('/auth/staff/join/resend', { verification_id })),
  /** Makes the staff account and keeps the session on this phone. */
  joinComplete: async (verification_id: string, password: string): Promise<User> => {
    const session = await call<{ access_token: string; refresh_token: string; user: User }>(
      api.post('/auth/staff/join/complete', { verification_id, password })
    );
    try {
      await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, session.access_token);
      await SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, session.refresh_token);
      await SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(session.user));
      await SecureStore.setItemAsync(STORAGE_KEYS.INTERFACE_TYPE, 'seller');
    } catch {
      throw new Error("Your sign-in is ready, but we couldn't keep you signed in on this phone. Log in to carry on.");
    }
    return session.user;
  },

  /* Signed in as staff */
  home: () => call<StaffHome>(api.get('/staff/home')),
  droppedOff: (orderId: string) => call<StaffHome>(api.post(`/staff/orders/${orderId}/dropped-off`)),
};
