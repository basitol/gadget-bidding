import prisma from '../../config/prisma';
import { SELLER_POLICY } from '@gadget-bidding/shared';

/**
 * Can this seller send a new listing for review right now? One place for every rule
 * (seller agreement): verified, store not closed, not away, fewer than 3 failed sales (failed hub checks or refunded cases) in
 * 90 days, and proof of shop address not past its grace period.
 * Editing a listing our team sent back is still allowed (see requireSellerKyb).
 */

const DAY = 86_400_000;

type DocEntry = { uploaded_at?: string; status?: string };

/** Proof of shop address: valid for 12 months from upload, then a 30-day grace to upload a new one. */
export const proofOfAddressStatus = (documents: unknown, now = new Date()) => {
  const doc = ((documents ?? {}) as Record<string, DocEntry>).shop_address;
  if (!doc?.uploaded_at) return { state: 'missing' as const, expires_at: null, deadline: null };
  const uploaded = new Date(doc.uploaded_at);
  const expires = new Date(uploaded);
  expires.setMonth(expires.getMonth() + SELLER_POLICY.proofOfAddressMonths);
  const deadline = new Date(expires.getTime() + SELLER_POLICY.proofOfAddressGraceDays * DAY);
  const state = now < expires ? 'valid' : now < deadline ? 'expiring' : 'expired';
  return {
    state: state as 'valid' | 'expiring' | 'expired',
    expires_at: expires.toISOString(),
    deadline: deadline.toISOString(),
    days_left: Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / DAY)),
  };
};

/* ---------------- Failed sales (the automatic pause) ---------------- */

export type FailedSale = {
  order_id: string;
  order_number: string;
  title: string;
  /** When it failed: the hub check, or the refund decision on the case. */
  at: string;
  /** "Screen crack", "Battery lower than listed", "Not as described". */
  reason: string;
  kind: 'hub_check' | 'case';
};

const PROBLEM_LABEL: Record<string, string> = {
  item_not_as_described: 'Not as described',
  not_working: 'Didn’t work properly',
  missing_parts: 'Missing parts',
  wrong_item: 'Wrong item',
  item_damaged: 'Damaged in delivery',
  item_not_received: 'Didn’t arrive',
  fraud: 'Something was wrong',
  other: 'Refunded',
};

type Inspection = { checks?: { label?: string; passed?: boolean }[]; passed?: number; total?: number; note?: string | null; at?: string };

const readInspection = (v: unknown): Inspection | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Inspection) : null;

/** The hub check didn't pass (some check failed). */
export const inspectionFailed = (v: unknown) => {
  const i = readInspection(v);
  return !!i && typeof i.total === 'number' && typeof i.passed === 'number' && i.total > 0 && i.passed < i.total;
};

/** The first thing the hub found: its note's first line, else the first failed check. */
const hubReason = (v: unknown) => {
  const i = readInspection(v);
  const note = i?.note?.split(/\r?\n/)[0]?.trim();
  if (note) return note.length > 40 ? `${note.slice(0, 39)}…` : note;
  return i?.checks?.find(c => c.passed === false)?.label ?? 'Didn’t pass the hub check';
};

/** When the window starts for this seller: 90 days back, or when our team last lifted the pause. */
const windowStart = async (sellerId: string, now: Date) => {
  const u = await prisma.user.findUnique({ where: { id: sellerId }, select: { listingPauseClearedAt: true } });
  const since = new Date(now.getTime() - SELLER_POLICY.failedSaleWindowDays * DAY);
  return u?.listingPauseClearedAt && u.listingPauseClearedAt > since ? u.listingPauseClearedAt : since;
};

/** Failed sales that count towards the pause, newest first (one per order). */
export const failedSales = async (sellerId: string, now = new Date()): Promise<FailedSale[]> => {
  const since = await windowStart(sellerId, now);
  const [cases, hubOrders] = await Promise.all([
    prisma.dispute.findMany({
      where: { outcome: 'refund', decidedAt: { gt: since }, order: { sellerId } },
      select: {
        decidedAt: true,
        disputeType: true,
        order: { select: { id: true, orderNumber: true, auction: { select: { gadget: { select: { title: true } } } } } },
      },
    }),
    // Refunded after a failed hub check (the inspection stays on the order with passed < total).
    prisma.order.findMany({
      where: { sellerId, paymentStatus: 'refunded' },
      select: {
        id: true,
        orderNumber: true,
        inspection: true,
        updatedAt: true,
        auction: { select: { gadget: { select: { title: true } } } },
      },
    }),
  ]);

  const out = new Map<string, FailedSale>();
  for (const o of hubOrders) {
    if (!inspectionFailed(o.inspection)) continue;
    const atRaw = readInspection(o.inspection)?.at;
    const at = atRaw ? new Date(atRaw) : (o.updatedAt ?? now);
    if (Number.isNaN(at.getTime()) || at <= since) continue;
    out.set(o.id, {
      order_id: o.id,
      order_number: o.orderNumber,
      title: o.auction?.gadget?.title ?? 'Gadget',
      at: at.toISOString(),
      reason: hubReason(o.inspection),
      kind: 'hub_check',
    });
  }
  for (const c of cases) {
    if (!c.order || !c.decidedAt || out.has(c.order.id)) continue;
    out.set(c.order.id, {
      order_id: c.order.id,
      order_number: c.order.orderNumber,
      title: c.order.auction?.gadget?.title ?? 'Gadget',
      at: c.decidedAt.toISOString(),
      reason: PROBLEM_LABEL[c.disputeType] ?? 'Refunded',
      kind: 'case',
    });
  }
  return [...out.values()].sort((a, b) => b.at.localeCompare(a.at));
};

/** Failed sales in the window (hub checks failed and refunded, or cases refunded). */
export const failedSalesCount = async (sellerId: string, now = new Date()) => (await failedSales(sellerId, now)).length;

export type ListingBlock = { code: string; message: string } | null;

export const whyCantList = async (sellerId: string): Promise<ListingBlock> => {
  const user = await prisma.user.findUnique({
    where: { id: sellerId },
    select: {
      sellerKybStatus: true,
      storeClosedAt: true,
      storeAway: true,
      sellerApplication: { select: { documents: true } },
    },
  });
  if (!user) return { code: 'NOT_FOUND', message: 'Account not found.' };
  if (user.storeClosedAt) return { code: 'STORE_CLOSED', message: 'Your store is closed. Contact us to reopen it.' };
  if (user.sellerKybStatus !== 'approved') {
    return {
      code: 'NOT_VERIFIED',
      message:
        user.sellerKybStatus === 'pending'
          ? "We're still checking your business. You can list once you're approved."
          : user.sellerKybStatus === 'needs_info'
            ? 'Our team needs one more thing before you can list. Open your application to see what.'
            : user.sellerKybStatus === 'rejected'
              ? "Your business wasn't approved, so you can't list yet."
              : 'Finish your seller application before listing a gadget.',
    };
  }
  // Our team paused this seller's listings (Users › Pause listings).
  const { listingsPausedByTeam } = await import('../admin/people.service');
  if (await listingsPausedByTeam(sellerId)) {
    return {
      code: 'PAUSED_BY_TEAM',
      message: 'Our team paused your listings. Check your email for why, or reply to it to appeal.',
    };
  }
  if (user.storeAway) {
    return { code: 'STORE_AWAY', message: "You're set to away. Turn it off in Store details to list again." };
  }
  if (proofOfAddressStatus(user.sellerApplication?.documents).state === 'expired') {
    return {
      code: 'DOCUMENT_EXPIRED',
      message: 'Your proof of shop address is out of date. Upload a recent one in Business documents to list again.',
    };
  }
  const failed = await failedSalesCount(sellerId);
  if (failed >= SELLER_POLICY.failedSaleLimit) {
    return {
      code: 'LISTINGS_PAUSED',
      message: `New listings are paused: ${failed} of your sales failed the hub check or were refunded in the last ${SELLER_POLICY.failedSaleWindowDays} days.`,
    };
  }
  return null;
};
