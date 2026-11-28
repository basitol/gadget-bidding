import { SELLER_POLICY } from '@gadget-bidding/shared';
import prisma from '../../config/prisma';
import { Prisma } from '../../generated/prisma';
import logger from '../../utils/logger';
import * as notificationService from '../notification/notification.service';
import { alreadyNotified, createNotification } from '../notification/notification.service';
import { cardPaymentFor, creditBuyerWallet, startCardRefund } from '../order/buyerRefund.service';
import { DROPOFF_CUTOFF_HOUR, HUB_CLOSED_WEEKDAYS, dropoffDueOf } from '../order/order.service';
import { feeLabelOf } from './sellerOrder.service';
import { FAILED_CHECK } from './listingGate.service';

/**
 * Getting a sold item to the hub and, if it fails the check, back to the seller (/seller/hub).
 *
 * It fits the order's existing fulfilment steps: paid orders sit in 'processing' until the hub
 * has them. The seller picks how it gets there (orders.hub_method): they drop it off with the
 * order number as the code, or a rider collects it from their shop (orders.rider_pickup, fee
 * taken off a payout as a pending seller charge). Hub staff check it in (→ received_by_backoffice;
 * a rider's pickup first moves it to sent_to_backoffice) and record the check.
 *
 * A failed check: the seller chooses to collect it (free for SELLER_POLICY.freeCollectionDays),
 * have a rider bring it to their shop (returnDeliveryFee) or ask once for a second check. Collect
 * or deliver is final: the buyer is refunded in full and orders.payment_status becomes 'refunded'
 * (the inspection stays with passed < total, which counts as a failed check for the seller).
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const LAGOS = 1; // UTC+1 all year
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The hub opens at 9 am; it closes at the drop-off cut-off (6 pm), Monday to Saturday. */
const HUB_OPEN_HOUR = 9;
export const HUB_INFO = {
  name: 'Gadgets Bidding hub',
  address: SELLER_POLICY.hubAddress,
  hours: `Mon–Sat, ${HUB_OPEN_HOUR}:00 am – ${DROPOFF_CUTOFF_HOUR % 12 || 12}:00 pm`,
};

/** A rider comes within this long when booked "as soon as possible". */
const RIDER_ASAP_HOURS = 2;
/** Shop to hub. */
const RIDER_TO_HUB_HOURS = 1;
/** Pickup windows start on the hour, this long; the last one leaves time to reach the hub before it closes. */
const RIDER_WINDOW_HOURS = 1;
const RIDER_LEAD_HOURS = 1;
/** How many windows the seller sees (the first ones, plus the last that still makes it). */
const RIDER_WINDOWS_SHOWN = 3;

export const RIDER_PICKUP_REASON = 'Rider pickup to the hub';
export const RIDER_RETURN_REASON = 'Rider to your shop for an item that failed the hub check';

export class HubError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string
  ) {
    super(message);
  }
}

const num = (v: unknown) => (v == null ? 0 : Number(v.toString()));
const round2 = (n: number) => Math.round(n * 100) / 100;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

/* ---------------- Lagos time ---------------- */

const lagos = (d: Date) => {
  const l = new Date(d.getTime() + LAGOS * HOUR);
  return {
    y: l.getUTCFullYear(),
    m: l.getUTCMonth(),
    d: l.getUTCDate(),
    h: l.getUTCHours(),
    min: l.getUTCMinutes(),
    dow: l.getUTCDay(),
  };
};
const lagosAt = (y: number, m: number, d: number, h: number) => new Date(Date.UTC(y, m, d, h) - LAGOS * HOUR);
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "12:00", "1:00 pm" */
const clock = (d: Date, withPeriod: boolean) => {
  const t = lagos(d);
  const h = t.h % 12 || 12;
  const mm = String(t.min).padStart(2, '0');
  return withPeriod ? `${h}:${mm} ${t.h < 12 ? 'am' : 'pm'}` : `${h}:${mm}`;
};
/** "Today", "Tomorrow", "Tue" */
const dayWord = (d: Date, now: Date) => {
  const a = lagos(d);
  const b = lagos(now);
  const days = Math.round((Date.UTC(a.y, a.m, a.d) - Date.UTC(b.y, b.m, b.d)) / DAY);
  return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : DAYS[a.dow];
};
/** "Today, 12:00 – 1:00 pm" (the start keeps its am/pm only when it differs). */
const windowLabel = (start: Date, end: Date, now: Date) => {
  const samePeriod = lagos(start).h < 12 === lagos(end).h < 12;
  return `${dayWord(start, now)}, ${clock(start, !samePeriod)} – ${clock(end, true)}`;
};
/** "6:00 pm today", "6:00 pm Tue" */
const byLabel = (d: Date, now: Date) => {
  const w = dayWord(d, now);
  return `${clock(d, true)} ${w === 'Today' || w === 'Tomorrow' ? w.toLowerCase() : w}`;
};

/** +2348030004521 / 2348030004521 / 08030004521 → "08030004521"; null if it isn't a Nigerian mobile number. */
const localPhone = (raw: string): string | null => {
  const digits = raw.replace(/[^\d+]/g, '');
  const m = digits.match(/^(?:\+?234|0)([789][01]\d{8})$/);
  return m ? `0${m[1]}` : null;
};
/** "0803 000 4521" */
const spacedPhone = (p: string) => {
  const local = localPhone(p) ?? p;
  return /^0\d{10}$/.test(local) ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}` : local;
};

/* ---------------- Reading the order ---------------- */

type InspectionCheck = { key: string; label: string; passed: boolean };
type Inspection = {
  checks: InspectionCheck[];
  passed: number;
  total: number;
  note: string | null;
  at: string;
  photos?: unknown;
};

const readInspection = (value: unknown): Inspection | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Inspection;
  return Array.isArray(v.checks) && typeof v.total === 'number' && typeof v.passed === 'number' ? v : null;
};

/** The hub recorded a check and something didn't pass. */
export const inspectionFailed = (value: unknown) => {
  const i = readInspection(value);
  return !!i && i.passed < i.total;
};

export type RiderPickup = {
  slot: 'asap' | 'window';
  slot_start: string;
  slot_end: string;
  label: string;
  contact_name: string;
  contact_phone: string;
  address: string;
  fee: number;
  booked_at: string;
};

const readRider = (value: unknown): RiderPickup | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as RiderPickup;
  return typeof v.slot_start === 'string' && typeof v.contact_name === 'string' ? v : null;
};

/** "GV-20910" → "CL-20910": what the seller shows to collect a failed item. */
export const collectCodeOf = (orderNumber: string) => `CL-${orderNumber.replace(/^[A-Za-z]+-/, '')}`;

/** The second check was asked for and the hub hasn't recorded a new result since. */
const secondCheckPending = (o: { secondCheckAt: Date | null; inspection: unknown }) => {
  if (!o.secondCheckAt) return false;
  const i = readInspection(o.inspection);
  return !i || new Date(i.at).getTime() <= o.secondCheckAt.getTime();
};

/** "Shop 14, Otigba Tech Plaza, Computer Village" */
const shopLine = (a: { shopNumber: string | null; plaza: string | null; area: string } | null) => {
  if (!a) return null;
  const place = [a.shopNumber, a.plaza].filter(Boolean).join(', ');
  if (!place) return null;
  return [place, a.area.split(',')[0]].filter(Boolean).join(', ');
};

const orderSelect = {
  id: true,
  orderNumber: true,
  sellerId: true,
  buyerId: true,
  totalAmount: true,
  deliveryFee: true,
  platformFee: true,
  sellerPayout: true,
  deliveryMethod: true,
  paymentStatus: true,
  fulfillmentStatus: true,
  payoutStatus: true,
  inspection: true,
  hubMethod: true,
  hubChecklistAt: true,
  riderPickup: true,
  failedChoice: true,
  failedChoiceAt: true,
  secondCheckAt: true,
  returnedToSellerAt: true,
  updatedAt: true,
  auction: { select: { totalBids: true, gadget: { select: { title: true, images: true } } } },
  events: { select: { kind: true, status: true, createdAt: true }, orderBy: { createdAt: 'asc' as const } },
  disputes: { select: { id: true, status: true }, orderBy: { createdAt: 'desc' as const }, take: 1 },
} satisfies Prisma.OrderSelect;

type HubOrder = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

const loadOrder = async (sellerId: string, orderId: string): Promise<HubOrder> => {
  if (!UUID.test(orderId)) throw new HubError('Order not found', 404);
  const o = await prisma.order.findFirst({ where: { id: orderId, sellerId }, select: orderSelect });
  if (!o) throw new HubError('Order not found', 404);
  return o;
};

const eventAt = (o: HubOrder, kind: string, status: string) => {
  for (let i = o.events.length - 1; i >= 0; i--) {
    if (o.events[i].kind === kind && o.events[i].status === status) return o.events[i].createdAt;
  }
  return null;
};

const caseOpen = (o: HubOrder) => !!o.disputes[0] && ['open', 'investigating'].includes(o.disputes[0].status ?? '');

/** Paid, not at the hub yet, nothing in the way: the seller can choose (or change) how it gets there. */
const canSend = (o: HubOrder) => o.paymentStatus === 'paid' && o.fulfillmentStatus === 'processing' && !caseOpen(o);

/* ---------------- Rider slots ---------------- */

export type RiderSlot = { key: string; title: string; sub: string; start: string; end: string; last: boolean };

/**
 * Pickup times that still get it to the hub by the drop-off deadline: "as soon as possible"
 * (within 2 hours) while the hub is open, then hour-long windows on hub days.
 */
export const riderSlots = (deadline: Date, now = new Date()): RiderSlot[] => {
  const slots: RiderSlot[] = [];
  const t = lagos(now);
  const hubDay = (dow: number) => !HUB_CLOSED_WEEKDAYS.includes(dow);
  const lastStartHour = DROPOFF_CUTOFF_HOUR - RIDER_TO_HUB_HOURS - RIDER_WINDOW_HOURS;

  if (hubDay(t.dow) && t.h >= HUB_OPEN_HOUR && t.h < lastStartHour) {
    const end = new Date(now.getTime() + RIDER_ASAP_HOURS * HOUR);
    if (end.getTime() + RIDER_TO_HUB_HOURS * HOUR <= deadline.getTime()) {
      slots.push({
        key: 'asap',
        title: 'As soon as possible',
        sub: `A rider comes within ${RIDER_ASAP_HOURS} hours`,
        start: now.toISOString(),
        end: end.toISOString(),
        last: false,
      });
    }
  }

  const windows: { start: Date; end: Date }[] = [];
  const earliest = now.getTime() + RIDER_LEAD_HOURS * HOUR;
  for (let day = 0; day < 8; day++) {
    const base = new Date(Date.UTC(t.y, t.m, t.d + day));
    if (!hubDay(base.getUTCDay())) continue;
    for (let h = HUB_OPEN_HOUR; h <= lastStartHour; h++) {
      const start = lagosAt(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), h);
      const end = new Date(start.getTime() + RIDER_WINDOW_HOURS * HOUR);
      if (start.getTime() < earliest) continue;
      if (end.getTime() + RIDER_TO_HUB_HOURS * HOUR > deadline.getTime()) continue;
      windows.push({ start, end });
    }
  }
  const shown = windows.slice(0, RIDER_WINDOWS_SHOWN - 1);
  const lastWindow = windows[windows.length - 1];
  if (lastWindow && !shown.includes(lastWindow)) shown.push(lastWindow);
  for (const w of shown) {
    const last = w === lastWindow;
    slots.push({
      key: w.start.toISOString(),
      title: windowLabel(w.start, w.end, now),
      sub: last ? `Last slot that reaches the hub by ${clock(deadline, true)}` : 'A rider comes in this hour',
      start: w.start.toISOString(),
      end: w.end.toISOString(),
      last,
    });
  }
  return slots;
};

/* ---------------- The seller's view ---------------- */

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

export type HubView = {
  order_id: string;
  order_number: string;
  stage: HubStage;
  item: { title: string; image: string | null; bids: number };
  delivery_method: 'delivery' | 'pickup';
  money: { sale_price: number; platform_fee: number; fee_label: string; you_receive: number };
  dropoff_due_at: string | null;
  method: 'dropoff' | 'rider' | null;
  checklist_done_at: string | null;
  rider: (RiderPickup & { contact: string }) | null;
  checked_in_at: string | null;
  inspection: {
    result: 'passed' | 'failed';
    checks: { label: string; passed: boolean }[];
    /** The hub's note, a sentence a line ("Hairline crack on the top-left of the screen"). */
    findings: string[];
    /** The checks that didn't pass. */
    failed_checks: string[];
    photos: string[];
    at: string;
  } | null;
  failed: {
    choice: 'collect' | 'deliver' | 'second_check' | null;
    chosen_at: string | null;
    second_check_at: string | null;
    second_check_pending: boolean;
    can_second_check: boolean;
    refunded: boolean;
    collect_code: string;
    /** Free to collect until this time (once they chose to collect). */
    collect_by: string | null;
    returned_at: string | null;
  } | null;
  hub: typeof HUB_INFO;
  fees: { rider_pickup: number; return_delivery: number; storage_per_day: number; free_collection_days: number };
  can_send: boolean;
  case_open: boolean;
};

const stageOf = (o: HubOrder): HubStage => {
  const fs = o.fulfillmentStatus ?? 'pending';
  const failed = inspectionFailed(o.inspection);
  if (o.returnedToSellerAt) return 'returned';
  if (o.paymentStatus === 'refunded') {
    return failed && (o.failedChoice === 'collect' || o.failedChoice === 'deliver') ? 'returning' : 'refunded';
  }
  if (o.paymentStatus !== 'paid') return 'not_paid';
  if (fs === 'pending' || fs === 'processing')
    return o.hubMethod === 'rider' && readRider(o.riderPickup) ? 'rider_booked' : 'to_send';
  if (fs === 'sent_to_backoffice') return 'on_its_way';
  if (fs === 'received_by_backoffice') {
    if (secondCheckPending(o)) return 'second_check';
    const i = readInspection(o.inspection);
    if (!i) return 'at_hub';
    return i.passed < i.total ? 'failed' : 'passed';
  }
  return 'moved_on';
};

/** "Crack on the screen. Battery 79%." → ["Crack on the screen", "Battery 79%"] */
const noteLines = (note: string | null) =>
  (note ?? '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map(l => l.trim().replace(/[.]$/, ''))
    .filter(Boolean)
    .slice(0, 6);

const viewOf = (o: HubOrder, now = new Date()): HubView => {
  const sale = round2(num(o.totalAmount) - num(o.deliveryFee));
  const fee = round2(num(o.platformFee));
  const inspection = readInspection(o.inspection);
  const rider = readRider(o.riderPickup);
  const failed = !!inspection && inspection.passed < inspection.total;
  const due = dropoffDueOf(o);
  const pending = secondCheckPending(o);
  const choice = (o.failedChoice as 'collect' | 'deliver' | 'second_check' | null) ?? null;
  const photos = Array.isArray(inspection?.photos)
    ? (inspection!.photos as unknown[]).filter((p): p is string => typeof p === 'string')
    : [];

  return {
    order_id: o.id,
    order_number: o.orderNumber,
    stage: stageOf(o),
    item: {
      title: o.auction?.gadget?.title ?? 'Gadget',
      image: o.auction?.gadget?.images?.[0] ?? null,
      bids: o.auction?.totalBids ?? 0,
    },
    delivery_method: o.deliveryMethod === 'pickup' ? 'pickup' : 'delivery',
    money: {
      sale_price: sale,
      platform_fee: fee,
      fee_label: feeLabelOf(sale, fee),
      you_receive: round2(num(o.sellerPayout)),
    },
    dropoff_due_at: iso(due),
    method: (o.hubMethod as 'dropoff' | 'rider' | null) ?? null,
    checklist_done_at: iso(o.hubChecklistAt),
    rider: rider ? { ...rider, contact: `${rider.contact_name} · ${spacedPhone(rider.contact_phone)}` } : null,
    checked_in_at: iso(eventAt(o, 'fulfillment', 'received_by_backoffice')),
    inspection: inspection
      ? {
          result: failed ? 'failed' : 'passed',
          // Never who checked it: only what and when.
          checks: inspection.checks.map(c => ({ label: c.label, passed: c.passed })),
          findings: noteLines(inspection.note),
          failed_checks: inspection.checks.filter(c => !c.passed).map(c => FAILED_CHECK[c.key] ?? c.label),
          photos,
          at: inspection.at,
        }
      : null,
    failed:
      failed || choice
        ? {
            choice,
            chosen_at: iso(o.failedChoiceAt),
            second_check_at: iso(o.secondCheckAt),
            second_check_pending: pending,
            can_second_check: !o.secondCheckAt && o.paymentStatus === 'paid' && !o.returnedToSellerAt,
            refunded: o.paymentStatus === 'refunded',
            collect_code: collectCodeOf(o.orderNumber),
            collect_by:
              choice === 'collect' && o.failedChoiceAt
                ? new Date(o.failedChoiceAt.getTime() + SELLER_POLICY.freeCollectionDays * DAY).toISOString()
                : null,
            returned_at: iso(o.returnedToSellerAt),
          }
        : null,
    hub: HUB_INFO,
    fees: {
      rider_pickup: SELLER_POLICY.riderPickupFee,
      return_delivery: SELLER_POLICY.returnDeliveryFee,
      storage_per_day: SELLER_POLICY.storageFeePerDay,
      free_collection_days: SELLER_POLICY.freeCollectionDays,
    },
    can_send: canSend(o),
    case_open: caseOpen(o),
  };
};

/** GET /seller/hub/orders/:id */
export const getHubView = async (sellerId: string, orderId: string, now = new Date()) =>
  viewOf(await loadOrder(sellerId, orderId), now);

/** For the Orders tab: a booked rider, a failed check, a second check still running. */
export const hubFlags = (o: {
  hubMethod: string | null;
  riderPickup: unknown;
  inspection: unknown;
  secondCheckAt: Date | null;
}) => ({
  riderBooked: o.hubMethod === 'rider' && !!readRider(o.riderPickup),
  failedCheck: inspectionFailed(o.inspection),
  secondCheckPending: secondCheckPending(o),
});

/** What the Sold / order screens need to point at the right hub screen. */
export const hubSummaryOf = (o: {
  orderNumber: string;
  hubMethod: string | null;
  riderPickup: unknown;
  inspection: unknown;
  failedChoice: string | null;
  secondCheckAt: Date | null;
  returnedToSellerAt: Date | null;
  paymentStatus: string | null;
}) => {
  const i = readInspection(o.inspection);
  const rider = readRider(o.riderPickup);
  return {
    method: (o.hubMethod as 'dropoff' | 'rider' | null) ?? null,
    rider: rider
      ? { label: rider.label, contact: `${rider.contact_name} · ${spacedPhone(rider.contact_phone)}` }
      : null,
    result: i ? (i.passed < i.total ? ('failed' as const) : ('passed' as const)) : null,
    second_check_pending: secondCheckPending(o),
    failed_choice: (o.failedChoice as 'collect' | 'deliver' | 'second_check' | null) ?? null,
    collect_code: i && i.passed < i.total ? collectCodeOf(o.orderNumber) : null,
    returned_at: iso(o.returnedToSellerAt),
  };
};

/* ---------------- Rider options and booking ---------------- */

/** GET /seller/hub/orders/:id/rider-options */
export const riderOptions = async (sellerId: string, orderId: string, now = new Date()) => {
  const o = await loadOrder(sellerId, orderId);
  if (!canSend(o)) throw new HubError("This order can't be sent to the hub now.", 409);
  const due = dropoffDueOf(o);
  const [user, app, staff] = await Promise.all([
    prisma.user.findUnique({ where: { id: sellerId }, select: { fullName: true, phoneNumber: true } }),
    prisma.sellerApplication.findUnique({
      where: { userId: sellerId },
      select: { shopNumber: true, plaza: true, area: true },
    }),
    prisma.storeStaff.findMany({
      where: { sellerId },
      select: { fullName: true, phone: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const contacts = [
    ...(user ? [{ name: user.fullName, phone: user.phoneNumber, role: 'owner' as const }] : []),
    ...staff.map(s => ({ name: s.fullName, phone: s.phone, role: 'staff' as const })),
  ]
    .map(c => ({
      ...c,
      phone: localPhone(c.phone) ?? c.phone,
      label: `${c.name.split(' ')[0]} · ${spacedPhone(c.phone)}`,
    }))
    .filter((c, i, all) => all.findIndex(x => x.phone === c.phone) === i);
  const rider = readRider(o.riderPickup);
  return {
    pickup_from: shopLine(app),
    slots: due ? riderSlots(due, now) : [],
    deadline: iso(due),
    deadline_label: due ? byLabel(due, now) : null,
    contacts,
    fee: SELLER_POLICY.riderPickupFee,
    paid_from: "This sale's payout",
    current: rider
      ? {
          key: rider.slot === 'asap' ? 'asap' : rider.slot_start,
          contact_name: rider.contact_name,
          contact_phone: rider.contact_phone,
        }
      : null,
  };
};

const lockOrder = (tx: Prisma.TransactionClient, id: string) =>
  tx.$queryRaw`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;

/** POST /seller/hub/orders/:id/rider { slot, contact_name, contact_phone, checklist: true } */
export const bookRider = async (
  sellerId: string,
  orderId: string,
  body: { slot?: unknown; contact_name?: unknown; contact_phone?: unknown; checklist?: unknown },
  now = new Date()
) => {
  if (body.checklist !== true) throw new HubError('Tick everything on the list before you send it.');
  const name = typeof body.contact_name === 'string' ? body.contact_name.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2 || name.length > 60) throw new HubError('Add the name the rider should ask for.');
  const phone = typeof body.contact_phone === 'string' ? localPhone(body.contact_phone) : null;
  if (!phone) throw new HubError('Add a Nigerian mobile number for the rider, like 0803 000 4521.');

  const options = await riderOptions(sellerId, orderId, now);
  if (!options.pickup_from)
    throw new HubError(
      'Add your shop number and plaza in Store details so the rider can find you.',
      409,
      'SHOP_ADDRESS_MISSING'
    );
  const slot = options.slots.find(s => s.key === body.slot);
  if (!slot) {
    throw new HubError(
      options.slots.length
        ? 'That pickup time has passed. Pick another one.'
        : `No rider can reach the hub before ${options.deadline_label ?? 'the deadline'}. Drop it off yourself instead.`,
      409,
      'SLOT_GONE'
    );
  }
  const pickup: RiderPickup = {
    slot: slot.key === 'asap' ? 'asap' : 'window',
    slot_start: slot.start,
    slot_end: slot.end,
    label: slot.key === 'asap' ? `${slot.title} · within ${RIDER_ASAP_HOURS} hours` : slot.title,
    contact_name: name,
    contact_phone: phone,
    address: options.pickup_from,
    fee: SELLER_POLICY.riderPickupFee,
    booked_at: now.toISOString(),
  };

  const o = await prisma.$transaction(async tx => {
    await lockOrder(tx, orderId);
    const cur = await tx.order.findFirst({
      where: { id: orderId, sellerId },
      select: { paymentStatus: true, fulfillmentStatus: true, hubChecklistAt: true },
    });
    if (!cur || cur.paymentStatus !== 'paid' || cur.fulfillmentStatus !== 'processing') {
      throw new HubError("This order can't be sent to the hub now.", 409);
    }
    await tx.order.update({
      where: { id: orderId },
      data: {
        hubMethod: 'rider',
        hubChecklistAt: cur.hubChecklistAt ?? now,
        riderPickup: pickup as unknown as Prisma.InputJsonValue,
        updatedAt: now,
      },
    });
    // One rider fee per order, taken off a payout. Booking again (another time) keeps the same one.
    const charge = await tx.sellerCharge.findFirst({ where: { orderId, reason: RIDER_PICKUP_REASON } });
    if (!charge) {
      await tx.sellerCharge.create({
        data: { sellerId, orderId, amount: SELLER_POLICY.riderPickupFee, reason: RIDER_PICKUP_REASON },
      });
    } else if (charge.status === 'waived') {
      await tx.sellerCharge.update({
        where: { id: charge.id },
        data: { status: 'pending', amount: SELLER_POLICY.riderPickupFee },
      });
    }
    return tx.order.findUniqueOrThrow({ where: { id: orderId }, select: orderSelect });
  });

  notificationService
    .notifyAdmins(
      'backoffice_intake',
      `Rider pickup: ${o.orderNumber}`,
      `Collect from ${pickup.address}, ${pickup.label}. Ask for ${pickup.contact_name} · ${spacedPhone(pickup.contact_phone)}. It must reach the hub by ${options.deadline_label}.`,
      { orderId: o.id, orderNumber: o.orderNumber, route: `/backoffice?order=${o.id}` }
    )
    .catch(err => logger.error('Rider pickup admin alert failed:', err));
  logger.info(`Rider pickup booked for ${o.orderNumber}: ${pickup.label}`);
  return viewOf(o, now);
};

/** POST /seller/hub/orders/:id/dropoff { checklist: true }: they'll bring it in themselves. */
export const chooseDropoff = async (
  sellerId: string,
  orderId: string,
  body: { checklist?: unknown },
  now = new Date()
) => {
  if (body.checklist !== true) throw new HubError('Tick everything on the list before you send it.');
  const before = await loadOrder(sellerId, orderId);
  if (!canSend(before)) throw new HubError("This order can't be sent to the hub now.", 409);
  const hadRider = !!readRider(before.riderPickup);

  const o = await prisma.$transaction(async tx => {
    await lockOrder(tx, orderId);
    const cur = await tx.order.findFirst({
      where: { id: orderId, sellerId },
      select: { paymentStatus: true, fulfillmentStatus: true, hubChecklistAt: true },
    });
    if (!cur || cur.paymentStatus !== 'paid' || cur.fulfillmentStatus !== 'processing') {
      throw new HubError(
        cur?.fulfillmentStatus === 'sent_to_backoffice'
          ? 'The rider already has it. It’s on its way to the hub.'
          : "This order can't be sent to the hub now.",
        409
      );
    }
    await tx.order.update({
      where: { id: orderId },
      data: {
        hubMethod: 'dropoff',
        hubChecklistAt: cur.hubChecklistAt ?? now,
        riderPickup: Prisma.DbNull,
        updatedAt: now,
      },
    });
    // Switched before the rider came: no rider fee.
    await tx.sellerCharge.updateMany({
      where: { orderId, reason: RIDER_PICKUP_REASON, status: 'pending' },
      data: { status: 'waived' },
    });
    return tx.order.findUniqueOrThrow({ where: { id: orderId }, select: orderSelect });
  });

  if (hadRider) {
    notificationService
      .notifyAdmins(
        'backoffice_intake',
        `Rider pickup cancelled: ${o.orderNumber}`,
        'The seller will drop it off at the hub instead.',
        {
          orderId: o.id,
          orderNumber: o.orderNumber,
          route: `/backoffice?order=${o.id}`,
        }
      )
      .catch(err => logger.error('Rider cancel admin alert failed:', err));
  }
  return viewOf(o, now);
};

/* ---------------- After a failed check ---------------- */

/**
 * POST /seller/hub/orders/:id/failed-choice { choice: 'collect' | 'deliver' | 'second_check' }
 * Collect or deliver refunds the buyer (once). Before it's handed back, the seller can switch
 * between collect and deliver (the rider fee follows). A second check is allowed once.
 */
export const chooseAfterFailedCheck = async (
  sellerId: string,
  orderId: string,
  body: { choice?: unknown },
  now = new Date()
) => {
  const choice = body.choice;
  if (choice !== 'collect' && choice !== 'deliver' && choice !== 'second_check') {
    throw new HubError('Choose collect, send it back to your shop, or a second check.');
  }
  const o = await loadOrder(sellerId, orderId);
  if (o.fulfillmentStatus !== 'received_by_backoffice' || !inspectionFailed(o.inspection)) {
    throw new HubError('This order hasn’t failed the hub check.', 409);
  }
  if (o.returnedToSellerAt) throw new HubError('The item is already back with you.', 409);
  if (secondCheckPending(o))
    throw new HubError(
      'A senior inspector is checking it again. We’ll tell you the result.',
      409,
      'SECOND_CHECK_PENDING'
    );

  if (choice === 'second_check') {
    if (o.secondCheckAt) throw new HubError('A second check was already done on this item.', 409);
    if (o.paymentStatus !== 'paid')
      throw new HubError('The buyer was already refunded, so it can’t be checked again.', 409);
    const claimed = await prisma.order.updateMany({
      where: { id: orderId, sellerId, secondCheckAt: null, paymentStatus: 'paid', failedChoice: null },
      data: { failedChoice: 'second_check', failedChoiceAt: now, secondCheckAt: now, updatedAt: now },
    });
    if (!claimed.count) throw new HubError('You already chose what happens to this item. Refresh to see it.', 409);
    notificationService
      .notifyAdmins(
        'backoffice_intake',
        `Second check asked: ${o.orderNumber}`,
        'The seller thinks the hub check is wrong. Ask a senior inspector to check it again and record the result.',
        { orderId: o.id, orderNumber: o.orderNumber, route: `/backoffice?order=${o.id}` }
      )
      .catch(err => logger.error('Second check admin alert failed:', err));
    return getHubView(sellerId, orderId, now);
  }

  // Already refunded: only switching between collect and deliver.
  if (o.paymentStatus === 'refunded') {
    if (o.failedChoice !== 'collect' && o.failedChoice !== 'deliver')
      throw new HubError('This order was refunded another way.', 409);
    if (o.failedChoice !== choice) await switchReturn(o, choice, now);
    return getHubView(sellerId, orderId, now);
  }
  if (o.paymentStatus !== 'paid') throw new HubError('This order isn’t paid.', 409);

  // Claim it first so two taps can never refund twice.
  const previous = { failedChoice: o.failedChoice, failedChoiceAt: o.failedChoiceAt };
  const claimed = await prisma.order.updateMany({
    where: {
      id: orderId,
      sellerId,
      paymentStatus: 'paid',
      fulfillmentStatus: 'received_by_backoffice',
      OR: [{ failedChoice: null }, { failedChoice: 'second_check' }],
    },
    data: { failedChoice: choice, failedChoiceAt: now, updatedAt: now },
  });
  if (!claimed.count) throw new HubError('You already chose what happens to this item. Refresh to see it.', 409);

  const amount = num(o.totalAmount);
  let destination: 'card' | 'wallet' = 'wallet';
  let reference = `RF-${o.orderNumber}`;
  try {
    const card = await cardPaymentFor(o.id);
    if (card?.gatewayReference) {
      reference = await startCardRefund(card.gatewayReference, 'Gadgets Bidding: item failed the hub check');
      destination = 'card';
    }
  } catch (err: any) {
    // Nothing was refunded: let them try again.
    await prisma.order.updateMany({
      where: { id: orderId, failedChoice: choice, paymentStatus: 'paid' },
      data: previous,
    });
    logger.error(`Hub-check refund for ${o.orderNumber} didn't start:`, err);
    throw new HubError('We couldn’t start the buyer’s refund. Try again in a minute.', 502);
  }

  await prisma.$transaction(async tx => {
    if (destination === 'wallet' && o.buyerId) {
      await creditBuyerWallet(
        tx,
        o.buyerId,
        amount,
        o.orderNumber,
        `Refund for order ${o.orderNumber}: it didn't pass the hub check`
      );
    }
    await tx.order.update({
      where: { id: orderId },
      data: { paymentStatus: 'refunded', payoutStatus: 'held', updatedAt: new Date() },
    });
    if (choice === 'deliver') await upsertReturnCharge(tx, o, 'pending');
  });
  logger.info(
    `Order ${o.orderNumber} failed the hub check: buyer refunded to ${destination} (${reference}); seller chose ${choice}`
  );

  if (o.buyerId) {
    createNotification(
      o.buyerId,
      'fulfillment_updated',
      'Your order is being refunded',
      destination === 'card'
        ? `${o.auction?.gadget?.title ?? 'Your item'} didn't pass our hub check, so we didn't send it. ${naira(amount)} is going back to your card; banks usually take 3–5 working days.`
        : `${o.auction?.gadget?.title ?? 'Your item'} didn't pass our hub check, so we didn't send it. ${naira(amount)} is back in your wallet.`,
      { orderId: o.id, kind: 'hub_refund' },
      ['push']
    ).catch(err => logger.error('Hub refund buyer alert failed:', err));
  }
  notificationService
    .notifyAdmins(
      'backoffice_intake',
      `${o.orderNumber} going back to the seller`,
      choice === 'deliver'
        ? `Book a rider to the seller's shop (${naira(SELLER_POLICY.returnDeliveryFee)} off their next payout). The buyer was refunded.`
        : `The seller will collect it with code ${collectCodeOf(o.orderNumber)}. The buyer was refunded.`,
      { orderId: o.id, orderNumber: o.orderNumber, route: `/backoffice?order=${o.id}` }
    )
    .catch(err => logger.error('Hub return admin alert failed:', err));
  return getHubView(sellerId, orderId, now);
};

const upsertReturnCharge = async (tx: Prisma.TransactionClient, o: HubOrder, status: 'pending' | 'waived') => {
  const charge = await tx.sellerCharge.findFirst({ where: { orderId: o.id, reason: RIDER_RETURN_REASON } });
  if (!charge) {
    if (status === 'pending') {
      await tx.sellerCharge.create({
        data: {
          sellerId: o.sellerId!,
          orderId: o.id,
          amount: SELLER_POLICY.returnDeliveryFee,
          reason: RIDER_RETURN_REASON,
        },
      });
    }
  } else if (charge.status !== 'applied' && charge.status !== status) {
    await tx.sellerCharge.update({ where: { id: charge.id }, data: { status } });
  }
};

/** Collect ↔ deliver before it's handed back. Once the rider fee was taken from a payout, it stays deliver. */
const switchReturn = async (o: HubOrder, choice: 'collect' | 'deliver', now: Date) => {
  await prisma.$transaction(async tx => {
    await lockOrder(tx, o.id);
    if (choice === 'collect') {
      const applied = await tx.sellerCharge.findFirst({
        where: { orderId: o.id, reason: RIDER_RETURN_REASON, status: 'applied' },
      });
      if (applied)
        throw new HubError(
          'The rider fee was already taken from a payout, so our rider will bring it to your shop.',
          409
        );
    }
    // failed_choice_at stays when it was first settled, so switching never extends the free-collection days.
    await tx.order.update({ where: { id: o.id }, data: { failedChoice: choice, updatedAt: now } });
    await upsertReturnCharge(tx, o, choice === 'deliver' ? 'pending' : 'waived');
  });
  notificationService
    .notifyAdmins(
      'backoffice_intake',
      `${o.orderNumber}: ${choice === 'deliver' ? 'rider to the seller' : 'seller will collect'}`,
      choice === 'deliver'
        ? "Book a rider to the seller's shop."
        : `The seller will collect it with code ${collectCodeOf(o.orderNumber)}.`,
      { orderId: o.id, orderNumber: o.orderNumber, route: `/backoffice?order=${o.id}` }
    )
    .catch(err => logger.error('Hub return switch admin alert failed:', err));
};

/* ---------------- Alerts ---------------- */

/** "Didn't pass hub inspection": once per result (a second check that fails again tells them again). */
export const notifySellerHubFailed = async (orderId: string) => {
  try {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        sellerId: true,
        inspection: true,
        secondCheckAt: true,
        auction: { select: { gadget: { select: { title: true } } } },
      },
    });
    if (!o?.sellerId || !inspectionFailed(o.inspection)) return;
    const reminder = o.secondCheckAt ? 'hub_failed_again' : 'hub_failed';
    if (await alreadyNotified(o.sellerId, 'fulfillment_updated', 'orderId', o.id, reminder)) return;
    const title = o.auction?.gadget?.title ?? 'Your item';
    await createNotification(
      o.sellerId,
      'fulfillment_updated',
      o.secondCheckAt ? 'The second check didn’t pass either' : "Didn't pass hub inspection",
      o.secondCheckAt
        ? `A senior inspector checked ${title} again and it still doesn't match the listing. Choose how to get it back.`
        : `${title} doesn't match the listing, so we can't send it to the buyer. See what the hub found and choose what happens next.`,
      { kind: 'order', reminder, orderId: o.id },
      ['push']
    );
  } catch (err) {
    logger.error('Seller alert (hub failed) failed:', err);
  }
};

/* ---------------- Our team (backoffice) ---------------- */

/** What the backoffice shows about getting it in and back (admin only: includes the rider contact). */
export const hubAdminSummary = (o: {
  orderNumber: string;
  hubMethod: string | null;
  hubChecklistAt: Date | null;
  riderPickup: unknown;
  inspection: unknown;
  failedChoice: string | null;
  failedChoiceAt: Date | null;
  secondCheckAt: Date | null;
  returnedToSellerAt: Date | null;
  paymentStatus: string | null;
}) => {
  const rider = readRider(o.riderPickup);
  const failed = inspectionFailed(o.inspection);
  return {
    method: o.hubMethod,
    checklist_at: iso(o.hubChecklistAt),
    rider: rider ? { ...rider, contact: `${rider.contact_name} · ${spacedPhone(rider.contact_phone)}` } : null,
    failed,
    failed_choice: o.failedChoice,
    failed_choice_at: iso(o.failedChoiceAt),
    second_check_at: iso(o.secondCheckAt),
    second_check_pending: secondCheckPending(o),
    collect_code: failed ? collectCodeOf(o.orderNumber) : null,
    collect_by:
      o.failedChoice === 'collect' && o.failedChoiceAt
        ? new Date(o.failedChoiceAt.getTime() + SELLER_POLICY.freeCollectionDays * DAY).toISOString()
        : null,
    returned_at: iso(o.returnedToSellerAt),
  };
};

/** POST /admin/hub/orders/:id/rider-collected: the rider has it; it's on its way to the hub. */
export const markRiderCollected = async (orderId: string) => {
  if (!UUID.test(orderId)) throw new HubError('Order not found', 404);
  const moved = await prisma.order.updateMany({
    where: { id: orderId, paymentStatus: 'paid', fulfillmentStatus: 'processing', hubMethod: 'rider' },
    data: { fulfillmentStatus: 'sent_to_backoffice', updatedAt: new Date() },
  });
  if (!moved.count) throw new HubError('Only a paid order waiting for its rider pickup can be marked collected.', 409);
  return prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { id: true, orderNumber: true } });
};

/** POST /admin/hub/orders/:id/handed-back: a failed item went back to the seller (collected, or the rider delivered it). */
export const markHandedBack = async (orderId: string) => {
  if (!UUID.test(orderId)) throw new HubError('Order not found', 404);
  const now = new Date();
  const moved = await prisma.order.updateMany({
    where: {
      id: orderId,
      paymentStatus: 'refunded',
      fulfillmentStatus: 'received_by_backoffice',
      failedChoice: { in: ['collect', 'deliver'] },
      returnedToSellerAt: null,
    },
    data: { returnedToSellerAt: now, fulfillmentStatus: 'cancelled', updatedAt: now },
  });
  if (!moved.count)
    throw new HubError('Only a refunded item at the hub that the seller chose to get back can be handed back.', 409);
  const o = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      sellerId: true,
      failedChoice: true,
      auction: { select: { gadget: { select: { title: true } } } },
    },
  });
  if (o.sellerId) {
    createNotification(
      o.sellerId,
      'fulfillment_updated',
      o.failedChoice === 'deliver' ? 'Delivered back to your shop' : 'Collected from the hub',
      `${o.auction?.gadget?.title ?? 'Your item'} (order ${o.orderNumber}) is back with you.`,
      { kind: 'order', reminder: 'hub_returned', orderId: o.id },
      ['push']
    ).catch(err => logger.error('Hub returned seller alert failed:', err));
  }
  return { id: o.id, order_number: o.orderNumber };
};
