import prisma from '../../config/prisma';
import { platformFeeFor, platformFeeLabel } from '@gadget-bidding/shared';
import { caseLabel } from '../buyer/case.service';
import { CONFIRM_WINDOW_HOURS, dropoffDueOf, paymentDueOf } from '../order/order.service';
import { nextPayoutTime, payoutBlockFor, PayoutBlock } from './payouts.service';

/**
 * One order, as the seller sees it (GET /seller/orders/:id): where it is in the six steps
 * (sold → at hub → passed → on the way / ready for pickup → delivered → paid out), when each
 * step happened (order_events), the money (the stored fee and payout, never recomputed) and
 * what's next. The buyer stays private: only the city and state of the delivery address.
 */

const HOUR = 3_600_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (v: unknown) => (v == null ? 0 : Number(v.toString()));
const round2 = (n: number) => Math.round(n * 100) / 100;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export class SellerOrderError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

/** Where the order is. The first six are the progress steps, in order. */
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

const STEPS = ['sold', 'at_hub', 'passed', 'on_the_way', 'delivered', 'paid_out'] as const;
type StepKey = (typeof STEPS)[number];

export type SellerOrderDetail = {
  id: string;
  order_number: string;
  stage: SellerOrderStage;
  /** Index of the step reached (0–5), -1 before payment. Drives the 6-part bar and the timeline. */
  step: number;
  delivery_method: 'delivery' | 'pickup';
  item: { title: string; image: string | null; auction_id: string | null; bids: number };
  /** "Ikeja, Lagos" from the delivery address (never the name, phone or street); null for pickup. */
  buyer_area: string | null;
  /** When each step happened; null when it hasn't (or we have no record). */
  times: Record<StepKey, string | null>;
  /** Drop it at the hub by this time (only while it hasn't been dropped off). */
  dropoff_due_at: string | null;
  /** Unpaid: the buyer has until this time. */
  payment_due_at: string | null;
  /** Delivered, not confirmed: the buyer confirms (or we do) by this time. */
  confirm_by: string | null;
  buyer_confirmed_at: string | null;
  inspection: { passed: number; total: number } | null;
  money: {
    sale_price: number;
    platform_fee: number;
    /** "5%", "flat ₦50,000", or the stored fee's own % for older orders. */
    fee_label: string;
    you_receive: number;
  };
  payout: {
    /** pending (in escrow) · ready · sending · paid · held (case) */
    status: string;
    /** Ready: the 6 pm it goes out (null while payouts can't go). */
    next_payout_at: string | null;
    /** Ready but can't be paid yet (no payout account, 2-step off, paused after a change). */
    blocked: PayoutBlock | null;
    paid_at: string | null;
    batch: { id: string; reference: string; status: string } | null;
  };
  case: { id: string; number: string; status: string; open: boolean } | null;
  /** "Send to hub" is allowed now. */
  can_send_to_hub: boolean;
};

/** Last time the order reached this status. */
const eventAt = (events: { kind: string; status: string; createdAt: Date }[], kind: string, status: string) => {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].kind === kind && events[i].status === status) return events[i].createdAt;
  }
  return null;
};

const readInspection = (value: unknown): { passed: number; total: number; at: string | null } | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as { passed?: unknown; total?: unknown; at?: unknown };
  const passed = Number(v.passed);
  const total = Number(v.total);
  if (!Number.isFinite(passed) || !Number.isFinite(total) || total <= 0) return null;
  return { passed, total, at: typeof v.at === 'string' ? v.at : null };
};

/** "5%" when the stored fee is the band's fee, else the stored fee's own share ("0%", "4.5%"). */
const feeLabelOf = (sale: number, fee: number) => {
  if (Math.round(fee) === platformFeeFor(sale)) return platformFeeLabel(sale);
  if (sale <= 0) return '0%';
  const pct = Math.round((fee / sale) * 1000) / 10;
  return `${pct}%`;
};

/** "Ikeja, Lagos" (city and state only). */
const areaOf = (address: unknown): string | null => {
  if (!address || typeof address !== 'object' || Array.isArray(address)) return null;
  const a = address as { city?: unknown; state?: unknown };
  const city = typeof a.city === 'string' ? a.city.trim() : '';
  const state = typeof a.state === 'string' ? a.state.trim() : '';
  if (city && state && city.toLowerCase() !== state.toLowerCase()) return `${city}, ${state}`;
  return city || state || null;
};

export const getSellerOrder = async (sellerId: string, orderId: string, now = new Date()): Promise<SellerOrderDetail> => {
  if (!UUID.test(orderId)) throw new SellerOrderError('Order not found', 404);
  const o = await prisma.order.findFirst({
    where: { id: orderId, sellerId },
    select: {
      id: true,
      orderNumber: true,
      totalAmount: true,
      deliveryFee: true,
      platformFee: true,
      sellerPayout: true,
      deliveryMethod: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      payoutStatus: true,
      payoutPaidAt: true,
      payoutBatchId: true,
      shippingAddress: true,
      paymentDueAt: true,
      buyerConfirmedAt: true,
      inspection: true,
      createdAt: true,
      updatedAt: true,
      auction: { select: { id: true, totalBids: true, gadget: { select: { title: true, images: true } } } },
      events: { select: { kind: true, status: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
      disputes: { select: { id: true, caseNumber: true, status: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      payoutBatch: { select: { id: true, reference: true, status: true } },
    },
  });
  if (!o) throw new SellerOrderError('Order not found', 404);

  const pickup = o.deliveryMethod === 'pickup';
  const fs = o.fulfillmentStatus ?? 'pending';
  const paid = o.paymentStatus === 'paid';
  const inspection = readInspection(o.inspection);
  const passedCheck = !!inspection && inspection.passed === inspection.total;
  const ev = o.events;

  // When each step happened.
  const paidAt = eventAt(ev, 'payment', 'paid');
  const atHubAt = eventAt(ev, 'fulfillment', 'sent_to_backoffice') ?? eventAt(ev, 'fulfillment', 'received_by_backoffice');
  const passedAt =
    (passedCheck && inspection?.at ? new Date(inspection.at) : null) ??
    (passedCheck ? eventAt(ev, 'fulfillment', 'received_by_backoffice') : null);
  const shippedAt = eventAt(ev, 'fulfillment', 'shipped');
  const deliveredAt = eventAt(ev, 'fulfillment', 'delivered');

  // The furthest step reached.
  let step = -1;
  if (paid || o.paymentStatus === 'refunded') {
    step = 0;
    if (['sent_to_backoffice', 'received_by_backoffice', 'shipped', 'delivered'].includes(fs)) step = 1;
    if ((fs === 'received_by_backoffice' && passedCheck) || fs === 'shipped' || fs === 'delivered') step = 2;
    // Pickup: once it passed, it's ready for the buyer to collect.
    if (fs === 'shipped' || fs === 'delivered' || (pickup && step >= 2)) step = 3;
    if (fs === 'delivered') step = 4;
    if (o.payoutStatus === 'paid') step = 5;
  }

  const dispute = o.disputes[0] ?? null;
  const caseOpen = !!dispute && ['open', 'investigating'].includes(dispute.status ?? '');

  let stage: SellerOrderStage;
  if (o.paymentStatus === 'refunded') stage = 'refunded';
  else if (fs === 'cancelled') stage = 'cancelled';
  else if (!paid) stage = 'unpaid';
  else stage = STEPS[Math.max(0, step)];

  const times: Record<StepKey, string | null> = {
    sold: iso(paidAt),
    at_hub: step >= 1 ? iso(atHubAt) : null,
    passed: step >= 2 ? iso(passedAt) : null,
    on_the_way: step >= 3 ? iso(shippedAt ?? (pickup ? passedAt : null)) : null,
    delivered: step >= 4 ? iso(deliveredAt) : null,
    paid_out: step >= 5 ? iso(o.payoutPaidAt) : null,
  };

  const sale = round2(num(o.totalAmount) - num(o.deliveryFee));
  const fee = round2(num(o.platformFee));

  // Payout: when a ready order goes, or why it can't yet.
  const payoutStatus = o.payoutStatus ?? 'pending';
  const ready = payoutStatus === 'ready' && !o.payoutBatchId && stage === 'delivered' && !caseOpen;
  const blocked = ready ? await payoutBlockFor(sellerId, now) : null;
  const nextPayoutAt = ready
    ? blocked
      ? blocked.code === 'PAYOUTS_PAUSED' && blocked.resumes_at
        ? blocked.resumes_at
        : null
      : nextPayoutTime(now).toISOString()
    : null;

  const due = dropoffDueOf({ ...o, events: ev });
  const confirmBy =
    stage === 'delivered' && !o.buyerConfirmedAt && deliveredAt
      ? new Date(deliveredAt.getTime() + CONFIRM_WINDOW_HOURS * HOUR)
      : null;

  return {
    id: o.id,
    order_number: o.orderNumber,
    stage,
    step,
    delivery_method: pickup ? 'pickup' : 'delivery',
    item: {
      title: o.auction?.gadget?.title ?? 'Gadget',
      image: o.auction?.gadget?.images?.[0] ?? null,
      auction_id: o.auction?.id ?? null,
      bids: o.auction?.totalBids ?? 0,
    },
    buyer_area: pickup ? null : areaOf(o.shippingAddress),
    times,
    dropoff_due_at: iso(due),
    payment_due_at: stage === 'unpaid' ? iso(paymentDueOf(o)) : null,
    confirm_by: iso(confirmBy),
    buyer_confirmed_at: iso(o.buyerConfirmedAt),
    inspection: inspection ? { passed: inspection.passed, total: inspection.total } : null,
    money: { sale_price: sale, platform_fee: fee, fee_label: feeLabelOf(sale, fee), you_receive: round2(num(o.sellerPayout)) },
    payout: {
      status: payoutStatus,
      next_payout_at: nextPayoutAt,
      blocked,
      paid_at: iso(o.payoutPaidAt),
      batch: o.payoutBatch ? { id: o.payoutBatch.id, reference: o.payoutBatch.reference, status: o.payoutBatch.status } : null,
    },
    case: dispute
      ? { id: dispute.id, number: caseLabel(dispute.caseNumber), status: dispute.status ?? 'open', open: caseOpen }
      : null,
    // Payment moves it to processing; only from there can the seller hand it in.
    can_send_to_hub: stage === 'sold' && fs === 'processing' && !caseOpen,
  };
};
