import axios from 'axios';
import api, { getErrorMessage } from './api';

/**
 * Getting a sold item to the hub and back (/seller/hub): how it gets there (drop off or a rider),
 * the drop-off code, the hub's check, and after a failed check what happens next.
 */

export class HubError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number
  ) {
    super(message);
  }
}

const call = async <T>(p: Promise<{ data: { data: T } }>): Promise<T> => {
  try {
    return (await p).data.data;
  } catch (error) {
    const res = axios.isAxiosError(error) ? error.response : undefined;
    throw new HubError(getErrorMessage(error), (res?.data as { code?: string } | undefined)?.code, res?.status);
  }
};

export type HubStage =
  | 'not_paid'
  | 'to_send'
  | 'rider_booked'
  | 'on_its_way'
  | 'at_hub'
  | 'passed'
  | 'failed'
  | 'second_check'
  | 'returning'
  | 'returned'
  | 'refunded'
  | 'moved_on';

export type FailedChoice = 'collect' | 'deliver' | 'second_check';

export interface RiderBooking {
  slot: 'asap' | 'window';
  slot_start: string;
  slot_end: string;
  /** "Today, 12:00 – 1:00 pm" */
  label: string;
  contact_name: string;
  contact_phone: string;
  /** "Amaka · 0800 000 0101" */
  contact: string;
  address: string;
  fee: number;
  booked_at: string;
}

export interface HubView {
  order_id: string;
  order_number: string;
  stage: HubStage;
  item: { title: string; image: string | null; bids: number };
  delivery_method: 'delivery' | 'pickup';
  money: { sale_price: number; platform_fee: number; fee_label: string; you_receive: number };
  dropoff_due_at: string | null;
  method: 'dropoff' | 'rider' | null;
  checklist_done_at: string | null;
  rider: RiderBooking | null;
  checked_in_at: string | null;
  inspection: {
    result: 'passed' | 'failed';
    checks: { label: string; passed: boolean }[];
    /** The hub's note, a sentence a line. */
    findings: string[];
    failed_checks: string[];
    photos: string[];
    at: string;
  } | null;
  failed: {
    choice: FailedChoice | null;
    chosen_at: string | null;
    second_check_at: string | null;
    second_check_pending: boolean;
    can_second_check: boolean;
    refunded: boolean;
    collect_code: string;
    collect_by: string | null;
    returned_at: string | null;
  } | null;
  hub: { name: string; address: string; hours: string };
  fees: { rider_pickup: number; return_delivery: number; storage_per_day: number; free_collection_days: number };
  can_send: boolean;
  case_open: boolean;
}

export interface RiderSlot {
  /** 'asap' or the window's start time. */
  key: string;
  title: string;
  sub: string;
  start: string;
  end: string;
  last: boolean;
}

export interface RiderContact {
  name: string;
  phone: string;
  role: 'owner' | 'staff';
  /** "Tunde · 0803 000 4521" */
  label: string;
}

export interface RiderOptions {
  /** "Shop 14, Otigba Tech Plaza, Computer Village"; null until the shop address is in Store details. */
  pickup_from: string | null;
  slots: RiderSlot[];
  deadline: string | null;
  /** "6:00 pm today" */
  deadline_label: string | null;
  contacts: RiderContact[];
  fee: number;
  paid_from: string;
  current: { key: string; contact_name: string; contact_phone: string } | null;
}

export const sellerHubService = {
  view: (orderId: string) => call<HubView>(api.get(`/seller/hub/orders/${orderId}`)),
  riderOptions: (orderId: string) => call<RiderOptions>(api.get(`/seller/hub/orders/${orderId}/rider-options`)),
  dropOff: (orderId: string) => call<HubView>(api.post(`/seller/hub/orders/${orderId}/dropoff`, { checklist: true })),
  bookRider: (orderId: string, body: { slot: string; contact_name: string; contact_phone: string }) =>
    call<HubView>(api.post(`/seller/hub/orders/${orderId}/rider`, { ...body, checklist: true })),
  chooseAfterFail: (orderId: string, choice: FailedChoice) =>
    call<HubView>(api.post(`/seller/hub/orders/${orderId}/failed-choice`, { choice })),
};
