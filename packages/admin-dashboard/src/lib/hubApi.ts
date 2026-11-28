import { request } from '@/api';

/**
 * Hub desk calls (/admin/hub) and the `hub` block on each admin order: how the item gets to the hub
 * (drop-off or a booked rider) and, after a failed check, what the seller chose.
 */

export type HubRider = {
  slot: 'asap' | 'window';
  slot_start: string;
  slot_end: string;
  /** "Today, 12:00 – 1:00 pm" */
  label: string;
  contact_name: string;
  contact_phone: string;
  /** "Amaka Obi · 0800 000 0101" */
  contact: string;
  address: string;
  fee: number;
  booked_at: string;
};

export type OrderHub = {
  method: 'dropoff' | 'rider' | null;
  checklist_at: string | null;
  rider: HubRider | null;
  failed: boolean;
  failed_choice: 'collect' | 'deliver' | 'second_check' | null;
  failed_choice_at: string | null;
  second_check_at: string | null;
  second_check_pending: boolean;
  /** "CL-20910" when the check failed. */
  collect_code: string | null;
  collect_by: string | null;
  returned_at: string | null;
};

export const hubApi = {
  /** The rider has it: on its way to the hub (sent_to_backoffice). */
  riderCollected: (orderId: string) =>
    request<{ data: { id: string }; message?: string }>(`/admin/hub/orders/${orderId}/rider-collected`, { method: 'POST' }),
  /** A failed item went back to its seller (collected, or delivered to their shop). */
  handedBack: (orderId: string) =>
    request<{ data: { id: string }; message?: string }>(`/admin/hub/orders/${orderId}/handed-back`, { method: 'POST' }),
};
