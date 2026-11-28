import prisma from '../../config/prisma';
import logger from '../../utils/logger';
import { Prisma } from '../../generated/prisma';
import { SELLER_POLICY } from '@gadget-bidding/shared';
import { sellerCode } from '../buyer/sellerSummary.service';
import {
  inspectionPassed,
  MISSED_PAYMENT_LIMIT,
  MISSED_PAYMENT_LOOKBACK_DAYS,
} from '../order/order.service';
import { createNotification } from '../notification/notification.service';
import {
  buildListingsPausedEmail,
  buildRestoredEmail,
  buildSuspendedEmail,
  sendBuiltEmail,
  type BuiltEmail,
} from '../notification/email.service';
import { releaseHold } from '../wallet/wallet.service';
import { failedSales } from '../seller/listingGate.service';
import { startPasswordReset, maskEmail } from '../auth/auth.service';

/**
 * Users (admin): buyers, sellers and everyone who can't bid or list right now, each person's page,
 * notes, and the three actions from the design: suspend a buyer, pause a seller's listings, restore.
 *
 * Suspending a buyer switches the account off (signed out, can't bid or pay), withdraws their live
 * bids (the next-highest bidder leads again) and turns off their auto-bids. Pausing a seller pauses
 * their live and scheduled auctions (bidders are told; restoring gives back the time they had left),
 * blocks new listings and holds payouts; "Close store" also closes the store. A seller with live
 * auctions or money in escrow needs a second admin to approve the pause.
 */

export class PeopleError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

const DAY = 86_400_000;
const TZ = 'Africa/Lagos';
const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? 0 : Number(v));
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/* ---------------- Reasons and durations ---------------- */

export const SUSPEND_REASONS = {
  missed_payments: { label: '3 missed payments in 90 days', short: 'Missed payments', email: 'You won auctions and didn’t pay for them (3 in the last 90 days).' },
  shill_bidding: { label: 'Shill bidding', short: 'Shill bidding', email: 'Bidding to push up the price of a seller’s items.' },
  abusive: { label: 'Abusive to staff or sellers', short: 'Abusive to staff or sellers', email: 'Abusive messages to our team or to sellers.' },
  fraud: { label: 'Fake account or stolen card', short: 'Fake account or stolen card', email: 'We think this account, or a card used on it, isn’t genuine.' },
  other: { label: 'Something else', short: 'Something else', email: 'A break of our rules. Reply to this email and we’ll tell you more.' },
} as const;
export type SuspendReason = keyof typeof SUSPEND_REASONS;

export const PAUSE_REASONS = {
  failed_inspections: { label: 'Too many failed inspections', short: 'Failed inspections', email: 'Too many of your items didn’t match their listings at our hub.' },
  misleading: { label: 'Fake or misleading listings', short: 'Misleading listings', email: 'Listings with stock photos or details that don’t match the item.' },
  stolen: { label: 'Possible stolen goods', short: 'Stolen IMEI flagged', email: 'An IMEI or serial number on one of your items was flagged.' },
  documents: { label: 'Business documents expired', short: 'Documents expired', email: 'Your business documents need updating (CAC certificate or ID).' },
  other: { label: 'Something else', short: 'Something else', email: 'A break of our seller rules. Reply to this email and we’ll tell you more.' },
} as const;
export type PauseReason = keyof typeof PAUSE_REASONS;

export const RESTORE_REASONS = ['served', 'mistake', 'appeal'] as const;
export type RestoreReason = (typeof RESTORE_REASONS)[number];

export const SUSPEND_DURATIONS = ['7d', '30d', 'permanent'] as const;
export const PAUSE_DURATIONS = ['until_fixed', '30d', 'close_store'] as const;
export type SuspendDuration = (typeof SUSPEND_DURATIONS)[number];
export type PauseDuration = (typeof PAUSE_DURATIONS)[number];

const untilFor = (duration: string, from = Date.now()) =>
  duration === '7d' ? new Date(from + 7 * DAY) : duration === '30d' ? new Date(from + 30 * DAY) : null;

const shortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ });

/** "7 days (until Dec 5)", "Permanent", "Until it’s fixed", "Store closed". */
const untilText = (duration: string, from = Date.now()) => {
  const until = untilFor(duration, from);
  if (until) return `${duration === '7d' ? '7' : '30'} days (until ${shortDate(until)})`;
  return duration === 'permanent' ? 'Permanent' : duration === 'close_store' ? 'Your store stays closed until we reopen it' : 'Until it’s fixed';
};

const reasonLabel = (kind: string, reason: string) =>
  kind === 'suspend'
    ? SUSPEND_REASONS[reason as SuspendReason]?.label ?? reason
    : PAUSE_REASONS[reason as PauseReason]?.label ?? reason;
const reasonShort = (kind: string, reason: string) =>
  kind === 'suspend'
    ? SUSPEND_REASONS[reason as SuspendReason]?.short ?? reason
    : PAUSE_REASONS[reason as PauseReason]?.short ?? reason;

/* ---------------- Shared lookups ---------------- */

const OPEN = { in: ['pending', 'active'] };
const RESTRICTION_INCLUDE = {
  requester: { select: { fullName: true } },
  approver: { select: { fullName: true } },
} as const;
type RestrictionRow = Prisma.AccountRestrictionGetPayload<{ include: typeof RESTRICTION_INCLUDE }>;

const openRestriction = (userId: string, db: Prisma.TransactionClient | typeof prisma = prisma) =>
  db.accountRestriction.findFirst({ where: { userId, status: OPEN }, include: RESTRICTION_INCLUDE });

export const restrictionView = (r: RestrictionRow) => ({
  id: r.id,
  kind: r.kind as 'suspend' | 'pause_listings',
  status: r.status as 'pending' | 'active',
  reason: r.reason,
  reason_label: reasonLabel(r.kind, r.reason),
  until: iso(r.until),
  close_store: r.closeStore,
  note: r.note,
  by: r.requester?.fullName ?? null,
  created_at: r.createdAt.toISOString(),
  approver: r.approver?.fullName ?? null,
});

const firstName = (name: string | null | undefined) => (name || '').trim().split(/\s+/)[0] || 'there';

/** Bids on auctions still running. */
const liveBidAuctions = async (userId: string) => {
  const rows = await prisma.bid.findMany({
    where: { bidderId: userId, status: { in: ['active', 'outbid'] }, auction: { status: 'active' } },
    select: { auctionId: true },
    distinct: ['auctionId'],
  });
  return rows.map(r => r.auctionId).filter((id): id is string => !!id);
};

const sellerAuctionsWhere = (sellerId: string): Prisma.AuctionWhereInput => ({
  OR: [{ sellerId }, { gadget: { sellerId } }],
});

/** Money for this seller's paid orders that hasn't been paid out (escrow). */
const escrowOf = async (sellerId: string) => {
  const agg = await prisma.order.aggregate({
    where: { sellerId, paymentStatus: 'paid', payoutStatus: { in: ['pending', 'ready', 'held', 'sending'] } },
    _sum: { sellerPayout: true },
  });
  return num(agg._sum.sellerPayout);
};

/** Another active admin to approve a pause: the one most recently active. */
const secondAdmin = (requesterId: string) =>
  prisma.user.findFirst({
    where: { role: 'admin', isActive: true, deletedAt: null, id: { not: requesterId } },
    orderBy: [{ lastActiveAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'asc' }],
    select: { id: true, fullName: true },
  });

const missedSince = () => new Date(Date.now() - MISSED_PAYMENT_LOOKBACK_DAYS * DAY);

const missedCounts = async (userIds: string[]) => {
  if (!userIds.length) return new Map<string, number>();
  const rows = await prisma.missedPayment.groupBy({
    by: ['userId'],
    where: { userId: { in: userIds }, createdAt: { gte: missedSince() } },
    _count: { _all: true },
  });
  return new Map(rows.map(r => [r.userId, r._count._all]));
};

/** Sales as the seller app counts them: delivered, paid, not refunded after a case. */
const SOLD = (sellerId: string): Prisma.OrderWhereInput => ({
  sellerId,
  fulfillmentStatus: 'delivered',
  paymentStatus: 'paid',
  disputes: { none: { outcome: 'refund' } },
});

type PersonStatus = 'active' | 'suspended' | 'listings_paused' | 'store_closed' | 'bidding_paused' | 'pending_approval';

const statusOf = (
  u: { isActive: boolean | null; biddingPausedUntil?: Date | null; storeClosedAt?: Date | null },
  r: { kind: string; status: string } | null | undefined
): PersonStatus => {
  if (r?.status === 'pending') return 'pending_approval';
  if (r?.kind === 'suspend' || u.isActive === false) return 'suspended';
  if (r?.kind === 'pause_listings') return 'listings_paused';
  if (u.storeClosedAt) return 'store_closed';
  if (u.biddingPausedUntil && u.biddingPausedUntil > new Date()) return 'bidding_paused';
  return 'active';
};

/* ---------------- Stats and lists ---------------- */

const PEOPLE_ROLES = ['bidder', 'seller'];

/** Everyone who can't bid or list right now: the team's restrictions, older switch-offs, and automatic bidding pauses. */
const restrictedRows = async (adminId: string) => {
  const [restrictions, inactive, biddingPaused] = await Promise.all([
    prisma.accountRestriction.findMany({
      where: { status: OPEN },
      include: { ...RESTRICTION_INCLUDE, user: { select: { id: true, fullName: true, businessName: true, email: true, role: true, phoneNumber: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.findMany({
      where: { isActive: false, deletedAt: null, role: { in: PEOPLE_ROLES }, restrictions: { none: { status: OPEN } } },
      select: { id: true, fullName: true, businessName: true, email: true, role: true, phoneNumber: true, updatedAt: true },
    }),
    prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        role: 'bidder',
        biddingPausedUntil: { gt: new Date() },
        restrictions: { none: { status: OPEN } },
      },
      select: { id: true, fullName: true, email: true, phoneNumber: true, biddingPausedUntil: true },
    }),
  ]);

  // Older switch-offs: the reason and who, from the audit log entry that did it.
  const audits = inactive.length
    ? await prisma.auditLog.findMany({
        where: {
          action: 'user_update',
          resourceType: 'user',
          resourceId: { in: inactive.map(u => u.id) },
          changes: { path: ['is_active'], equals: false },
        },
        orderBy: { createdAt: 'desc' },
        select: { resourceId: true, changes: true, user: { select: { fullName: true } } },
      })
    : [];
  const latestAudit = new Map<string, (typeof audits)[number]>();
  audits.forEach(a => a.resourceId && !latestAudit.has(a.resourceId) && latestAudit.set(a.resourceId, a));

  type Row = {
    id: string;
    restriction_id: string | null;
    name: string;
    email: string | null;
    phone: string;
    type: 'buyer' | 'seller';
    why: string;
    until: string | null;
    by: string | null;
    status: PersonStatus;
    source: 'team' | 'automatic' | 'legacy';
    /** What's in place: a suspension or a listings pause (null for older switch-offs and automatic pauses). */
    kind: 'suspend' | 'pause_listings' | null;
    can_approve?: boolean;
  };
  const rows: Row[] = [
    ...restrictions.map(r => ({
      id: r.userId,
      restriction_id: r.id,
      name: (r.user.role === 'seller' ? r.user.businessName : null) || r.user.fullName || r.user.email || 'No name',
      email: r.user.email,
      phone: r.user.phoneNumber,
      type: (r.user.role === 'seller' ? 'seller' : 'buyer') as 'buyer' | 'seller',
      why: r.closeStore ? `${reasonShort(r.kind, r.reason)} · store closed` : reasonShort(r.kind, r.reason),
      until: iso(r.until),
      by: r.requester?.fullName ?? null,
      status: statusOf({ isActive: true }, r),
      source: 'team' as const,
      kind: r.kind as 'suspend' | 'pause_listings',
      can_approve: r.status === 'pending' ? r.requestedBy !== adminId : undefined,
    })),
    ...inactive.map(u => {
      const a = latestAudit.get(u.id);
      const reason = (a?.changes as { reason?: unknown } | null)?.reason;
      return {
        id: u.id,
        restriction_id: null,
        name: (u.role === 'seller' ? u.businessName : null) || u.fullName || u.email || 'No name',
        email: u.email,
        phone: u.phoneNumber,
        type: (u.role === 'seller' ? 'seller' : 'buyer') as 'buyer' | 'seller',
        why: typeof reason === 'string' && reason ? reason : 'Switched off',
        until: null,
        by: a?.user?.fullName ?? null,
        status: 'suspended' as const,
        source: 'legacy' as const,
        kind: null,
      };
    }),
    ...biddingPaused.map(u => ({
      id: u.id,
      restriction_id: null,
      name: u.fullName || u.email || 'No name',
      email: u.email,
      phone: u.phoneNumber,
      type: 'buyer' as const,
      why: `${MISSED_PAYMENT_LIMIT} missed payments · bidding paused`,
      until: iso(u.biddingPausedUntil),
      by: null,
      status: 'bidding_paused' as const,
      source: 'automatic' as const,
      kind: null,
    })),
  ];
  return rows;
};

const buyerWhere = (search?: string): Prisma.UserWhereInput => {
  const q = search?.trim();
  const digits = q?.replace(/\D/g, '') ?? '';
  return {
    role: 'bidder',
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { username: { contains: q, mode: 'insensitive' } },
            ...(digits.length >= 7 ? [{ phoneNumber: { contains: digits.slice(-10) } }] : []),
          ],
        }
      : {}),
  };
};

const sellerWhere = (search?: string): Prisma.UserWhereInput => {
  const q = search?.trim();
  const digits = q?.replace(/\D/g, '') ?? '';
  return {
    role: 'seller',
    deletedAt: null,
    sellerApplication: { status: 'approved' },
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: 'insensitive' } },
            { businessName: { contains: q, mode: 'insensitive' } },
            { sellerApplication: { businessName: { contains: q, mode: 'insensitive' } } },
            { email: { contains: q, mode: 'insensitive' } },
            ...(digits.length >= 7 ? [{ phoneNumber: { contains: digits.slice(-10) } }] : []),
          ],
        }
      : {}),
  };
};

export const peopleStats = async (adminId: string) => {
  const weekAgo = new Date(Date.now() - 7 * DAY);
  const [buyers, buyersThisWeek, sellers, restricted, missed] = await Promise.all([
    prisma.user.count({ where: buyerWhere() }),
    prisma.user.count({ where: { ...buyerWhere(), createdAt: { gte: weekAgo } } }),
    prisma.user.count({ where: sellerWhere() }),
    restrictedRows(adminId),
    prisma.missedPayment.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: missedSince() } },
      _count: { _all: true },
      having: { userId: { _count: { gte: MISSED_PAYMENT_LIMIT } } },
    }),
  ]);
  // Suggested: hit the missed-payment limit, still able to sign in, not suspended by the team.
  const candidates = missed.length
    ? await prisma.user.findMany({
        where: {
          id: { in: missed.map(m => m.userId) },
          role: 'bidder',
          isActive: true,
          deletedAt: null,
          restrictions: { none: { status: OPEN } },
        },
        select: { id: true, fullName: true, email: true },
        orderBy: { createdAt: 'asc' },
      })
    : [];
  const missedBy = new Map(missed.map(m => [m.userId, m._count._all]));
  const first = candidates[0];
  return {
    buyers,
    buyers_this_week: buyersThisWeek,
    verified_sellers: sellers,
    suspended: restricted.length,
    suggested: {
      count: candidates.length,
      first: first ? { id: first.id, name: first.fullName || first.email || 'A buyer', missed: missedBy.get(first.id) ?? 0 } : null,
    },
    tabs: { buyers, sellers, suspended: restricted.length },
  };
};

export const listPeople = async (
  adminId: string,
  tab: 'buyers' | 'sellers' | 'suspended',
  opts: { search?: string; page: number; limit: number }
) => {
  const skip = (opts.page - 1) * opts.limit;

  if (tab === 'suspended') {
    const q = opts.search?.trim().toLowerCase();
    const digits = q?.replace(/\D/g, '') ?? '';
    const all = (await restrictedRows(adminId)).filter(
      r =>
        !q ||
        r.name.toLowerCase().includes(q) ||
        (r.email ?? '').toLowerCase().includes(q) ||
        (digits.length >= 7 && r.phone.includes(digits.slice(-10)))
    );
    // Waiting for approval first, then the newest.
    all.sort((a, b) => Number(b.status === 'pending_approval') - Number(a.status === 'pending_approval'));
    return { items: all.slice(skip, skip + opts.limit).map(({ phone: _p, ...r }) => r), total: all.length };
  }

  if (tab === 'buyers') {
    const where = buyerWhere(opts.search);
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          email: true,
          avatarUrl: true,
          createdAt: true,
          isActive: true,
          biddingPausedUntil: true,
          restrictions: { where: { status: OPEN }, select: { kind: true, status: true }, take: 1 },
          _count: { select: { buyerOrders: { where: { paymentStatus: { in: ['paid', 'refunded'] } } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: opts.limit,
      }),
      prisma.user.count({ where }),
    ]);
    const missed = await missedCounts(users.map(u => u.id));
    return {
      items: users.map(u => {
        const m = missed.get(u.id) ?? 0;
        const status = statusOf(u, u.restrictions[0]);
        return {
          id: u.id,
          name: u.fullName || u.email || 'No name',
          email: u.email,
          avatar_url: u.avatarUrl,
          joined_at: iso(u.createdAt),
          orders: u._count.buyerOrders,
          status,
          suggested: m >= MISSED_PAYMENT_LIMIT && status !== 'suspended',
          missed_90d: m,
          missed_limit: MISSED_PAYMENT_LIMIT,
        };
      }),
      total,
    };
  }

  const where = sellerWhere(opts.search);
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        businessName: true,
        email: true,
        createdAt: true,
        isActive: true,
        storeClosedAt: true,
        sellerKybStatus: true,
        sellerApplication: { select: { businessName: true, status: true } },
        restrictions: { where: { status: OPEN }, select: { kind: true, status: true }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: opts.limit,
    }),
    prisma.user.count({ where }),
  ]);
  const ids = users.map(u => u.id);
  const [sales, ratings, inspected] = await Promise.all([
    prisma.order.groupBy({
      by: ['sellerId'],
      where: { sellerId: { in: ids }, fulfillmentStatus: 'delivered', paymentStatus: 'paid', disputes: { none: { outcome: 'refund' } } },
      _count: { _all: true },
    }),
    prisma.rating.groupBy({ by: ['rateeId'], where: { rateeId: { in: ids } }, _avg: { score: true } }),
    prisma.order.findMany({
      where: { sellerId: { in: ids }, inspection: { not: Prisma.DbNull } },
      select: { sellerId: true, inspection: true },
    }),
  ]);
  const salesBy = new Map(sales.map(s => [s.sellerId, s._count._all]));
  const ratingBy = new Map(ratings.map(r => [r.rateeId, r._avg.score]));
  const passBy = new Map<string, { n: number; passed: number }>();
  inspected.forEach(o => {
    if (!o.sellerId) return;
    const cur = passBy.get(o.sellerId) ?? { n: 0, passed: 0 };
    cur.n++;
    if (inspectionPassed(o.inspection)) cur.passed++;
    passBy.set(o.sellerId, cur);
  });
  return {
    items: users.map(u => {
      const pass = passBy.get(u.id);
      const n = salesBy.get(u.id) ?? 0;
      const rating = ratingBy.get(u.id);
      return {
        id: u.id,
        name: u.sellerApplication?.businessName || u.businessName || u.fullName || u.email || 'No name',
        email: u.email,
        joined_at: iso(u.createdAt),
        sales: n,
        passed_percent: pass?.n ? Math.round((pass.passed / pass.n) * 100) : null,
        rating: rating != null ? Math.round(rating * 10) / 10 : null,
        kyb_verified: u.sellerApplication?.status === 'approved',
        is_new: n === 0,
        status: statusOf(u, u.restrictions[0]),
      };
    }),
    total,
  };
};

/* ---------------- A buyer's page ---------------- */

const maskPhone = (p: string | null) => {
  if (!p || p.startsWith('+9')) return null; // placeholder numbers on email-only accounts
  const local = p.startsWith('+234') ? `0${p.slice(4)}` : p;
  return `${local.slice(0, 4)} ••• ${local.slice(-4)}`;
};

const loadPerson = async (id: string, role: 'bidder' | 'seller') => {
  const u = await prisma.user.findFirst({
    where: { id, role, deletedAt: null },
    select: {
      id: true,
      fullName: true,
      businessName: true,
      email: true,
      phoneNumber: true,
      avatarUrl: true,
      createdAt: true,
      isActive: true,
      biddingPausedUntil: true,
      storeClosedAt: true,
      twoFactorEnabled: true,
      lastActiveAt: true,
      sellerKybStatus: true,
      listingReviewRequestedAt: true,
      sellerApplication: {
        select: { id: true, status: true, businessName: true, ownerName: true, shopNumber: true, plaza: true, area: true },
      },
    },
  });
  if (!u) throw new PeopleError(role === 'seller' ? 'We can’t find that seller.' : 'We can’t find that buyer.', 404);
  return u;
};

export const buyerDetail = async (id: string) => {
  const u = await loadPerson(id, 'bidder');
  const [restriction, orders, spent, liveBids, disputes, missed, notes] = await Promise.all([
    openRestriction(id),
    prisma.order.count({ where: { buyerId: id } }),
    prisma.order.aggregate({ where: { buyerId: id, paymentStatus: 'paid' }, _sum: { totalAmount: true } }),
    liveBidAuctions(id),
    prisma.dispute.count({ where: { raisedBy: id } }),
    missedCounts([id]),
    prisma.userNote.count({ where: { userId: id } }),
  ]);
  return {
    id: u.id,
    name: u.fullName || u.email || 'No name',
    email: u.email,
    phone_masked: maskPhone(u.phoneNumber),
    avatar_url: u.avatarUrl,
    joined_at: iso(u.createdAt),
    status: statusOf(u, restriction),
    two_factor: u.twoFactorEnabled,
    restriction: restriction ? restrictionView(restriction) : null,
    stats: {
      orders,
      spent: num(spent._sum.totalAmount),
      live_bids: liveBids.length,
      disputes,
      missed_90d: missed.get(id) ?? 0,
      missed_limit: MISSED_PAYMENT_LIMIT,
      last_active_at: iso(u.lastActiveAt),
    },
    counts: { orders, live_bids: liveBids.length, disputes, notes },
  };
};

const firstImage = (images: unknown) =>
  Array.isArray(images) && typeof images[0] === 'string' ? (images[0] as string) : null;

export const buyerOrders = async (id: string) => {
  await loadPerson(id, 'bidder');
  const orders = await prisma.order.findMany({
    where: { buyerId: id },
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      totalAmount: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      buyerConfirmedAt: true,
      payoutStatus: true,
      sellerId: true,
      auction: { select: { gadget: { select: { title: true, images: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return orders.map(o => {
    const status =
      o.paymentStatus === 'refunded'
        ? 'refunded'
        : o.fulfillmentStatus === 'cancelled'
          ? 'cancelled'
          : o.paymentStatus !== 'paid'
            ? 'not_paid'
            : o.fulfillmentStatus === 'delivered' && (o.buyerConfirmedAt || o.payoutStatus === 'paid')
              ? 'completed'
              : 'in_progress';
    const label = { refunded: 'Refunded', cancelled: 'Cancelled', not_paid: 'Not paid', completed: 'Completed', in_progress: 'In progress' }[status];
    return {
      id: o.id,
      order_number: o.orderNumber,
      created_at: iso(o.createdAt),
      title: o.auction?.gadget?.title ?? 'Gadget',
      image: firstImage(o.auction?.gadget?.images),
      seller_code: o.sellerId ? sellerCode(o.sellerId) : null,
      amount: num(o.totalAmount),
      status,
      status_label: label,
    };
  });
};

export const buyerBids = async (id: string) => {
  await loadPerson(id, 'bidder');
  const auctionIds = await liveBidAuctions(id);
  if (!auctionIds.length) return [];
  const [auctions, mine] = await Promise.all([
    prisma.auction.findMany({
      where: { id: { in: auctionIds } },
      select: { id: true, currentPrice: true, endTime: true, totalBids: true, gadget: { select: { title: true, images: true } } },
      orderBy: { endTime: 'asc' },
    }),
    prisma.bid.groupBy({
      by: ['auctionId'],
      where: { bidderId: id, auctionId: { in: auctionIds }, status: { in: ['active', 'outbid'] } },
      _max: { amount: true },
    }),
  ]);
  const leading = new Set(
    (
      await prisma.bid.findMany({
        where: { bidderId: id, auctionId: { in: auctionIds }, isWinning: true },
        select: { auctionId: true },
      })
    ).map(b => b.auctionId)
  );
  const myMax = new Map(mine.map(m => [m.auctionId, num(m._max.amount)]));
  return auctions.map(a => ({
    auction_id: a.id,
    title: a.gadget?.title ?? 'Gadget',
    image: firstImage(a.gadget?.images),
    my_bid: myMax.get(a.id) ?? 0,
    current_price: num(a.currentPrice),
    leading: leading.has(a.id),
    ends_at: a.endTime.toISOString(),
    bids: a.totalBids ?? 0,
  }));
};

const DISPUTE_STATUS: Record<string, string> = {
  open: 'Open',
  investigating: 'Being checked',
  resolved: 'Resolved',
  closed: 'Closed',
};
const caseLabel = (n: number | null | undefined) => (n ? `D-${n}` : 'Case');

const disputesFor = async (where: Prisma.DisputeWhereInput) => {
  const rows = await prisma.dispute.findMany({
    where,
    select: {
      id: true,
      caseNumber: true,
      status: true,
      createdAt: true,
      order: { select: { orderNumber: true, auction: { select: { gadget: { select: { title: true } } } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map(d => ({
    id: d.id,
    case_number: caseLabel(d.caseNumber),
    order_number: d.order?.orderNumber ?? null,
    title: d.order?.auction?.gadget?.title ?? null,
    status: d.status ?? 'open',
    status_label: DISPUTE_STATUS[d.status ?? 'open'] ?? d.status ?? 'Open',
    opened_at: iso(d.createdAt),
  }));
};

export const buyerDisputes = async (id: string) => {
  await loadPerson(id, 'bidder');
  return disputesFor({ raisedBy: id });
};

/* ---------------- A seller's page ---------------- */

export const sellerDetail = async (id: string) => {
  const u = await loadPerson(id, 'seller');
  const app = u.sellerApplication;
  const [restriction, sold, rating, inspected, openDisputes, onHold, listings, payouts, notes, failed] = await Promise.all([
    openRestriction(id),
    prisma.order.findMany({ where: SOLD(id), select: { totalAmount: true, deliveryFee: true } }),
    prisma.rating.aggregate({ where: { rateeId: id }, _avg: { score: true }, _count: { _all: true } }),
    prisma.order.findMany({ where: { sellerId: id, inspection: { not: Prisma.DbNull } }, select: { inspection: true } }),
    prisma.dispute.count({ where: { order: { sellerId: id }, status: { in: ['open', 'investigating'] } } }),
    escrowOf(id),
    prisma.gadget.count({ where: { sellerId: id } }),
    prisma.sellerPayout.count({ where: { sellerId: id } }),
    prisma.userNote.count({ where: { userId: id } }),
    failedSales(id),
  ]);
  const passed = inspected.filter(o => inspectionPassed(o.inspection)).length;
  const shop = [
    app?.shopNumber ? (/^\d/.test(app.shopNumber.trim()) ? `Shop ${app.shopNumber.trim()}` : app.shopNumber.trim()) : null,
    app?.plaza,
    app?.area?.replace(/,\s*Ikeja$/i, ''),
  ]
    .filter(Boolean)
    .join(', ');
  return {
    id: u.id,
    name: app?.businessName || u.businessName || u.fullName || u.email || 'No name',
    owner_name: app?.ownerName || u.fullName || null,
    shop: shop || null,
    email: u.email,
    seller_code: sellerCode(u.id),
    joined_at: iso(u.createdAt),
    status: statusOf(u, restriction),
    kyb_status: app?.status ?? u.sellerKybStatus,
    application_id: app?.id ?? null,
    restriction: restriction ? restrictionView(restriction) : null,
    stats: {
      sales: sold.length,
      sold_value: sold.reduce((s, o) => s + num(o.totalAmount) - num(o.deliveryFee), 0),
      rating: rating._avg.score != null ? Math.round(rating._avg.score * 10) / 10 : null,
      ratings: rating._count._all,
      passed_percent: inspected.length ? Math.round((passed / inspected.length) * 100) : null,
      open_disputes: openDisputes,
      on_hold: onHold,
    },
    counts: { listings, payouts, notes },
    /** New listings paused on their own: failed hub checks or refunded cases in the window. */
    auto_pause: {
      paused: failed.length >= SELLER_POLICY.failedSaleLimit,
      failed: failed.slice(0, 10),
      count: failed.length,
      limit: SELLER_POLICY.failedSaleLimit,
      window_days: SELLER_POLICY.failedSaleWindowDays,
      review_requested_at: iso(u.listingReviewRequestedAt),
    },
  };
};

const span = (ms: number) => {
  const m = Math.max(1, Math.round(Math.abs(ms) / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
};

export const sellerListings = async (id: string) => {
  await loadPerson(id, 'seller');
  const gadgets = await prisma.gadget.findMany({
    where: { sellerId: id },
    select: {
      id: true,
      title: true,
      images: true,
      status: true,
      createdAt: true,
      auctions: {
        select: {
          id: true,
          status: true,
          currentPrice: true,
          startingPrice: true,
          totalBids: true,
          startTime: true,
          endTime: true,
          order: { select: { id: true, disputes: { where: { status: { in: ['open', 'investigating'] } }, select: { caseNumber: true }, take: 1 } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const now = Date.now();
  type Status = 'live' | 'scheduled' | 'in_review' | 'changes' | 'sold' | 'unsold' | 'paused' | 'rejected';
  const LABEL: Record<Status, string> = {
    live: 'Live',
    scheduled: 'Starts soon',
    in_review: 'In review',
    changes: 'Changes asked',
    sold: 'Sold',
    unsold: 'Didn’t sell',
    paused: 'Paused',
    rejected: 'Turned down',
  };
  const ORDER: Status[] = ['live', 'paused', 'scheduled', 'in_review', 'changes', 'sold', 'unsold', 'rejected'];
  return gadgets
    .map(g => {
      const a = g.auctions[0];
      let status: Status;
      let sub: string;
      if (a?.status === 'active') {
        status = 'live';
        sub = a.endTime.getTime() > now ? `Ends in ${span(a.endTime.getTime() - now)}` : 'Ending now';
      } else if (a?.status === 'paused') {
        status = 'paused';
        sub = 'Paused by our team';
      } else if (a?.status === 'scheduled') {
        status = 'scheduled';
        sub = `Starts in ${span(a.startTime.getTime() - now)}`;
      } else if (a?.order) {
        status = 'sold';
        const c = a.order.disputes[0];
        sub = c ? `Case ${caseLabel(c.caseNumber)} open` : `Sold ${shortDate(a.endTime)}`;
      } else if (a && (a.status === 'ended' || a.status === 'cancelled')) {
        status = 'unsold';
        sub = `Ended ${shortDate(a.endTime)}`;
      } else if (g.status === 'pending') {
        status = 'in_review';
        sub = `Submitted ${span(now - (g.createdAt?.getTime() ?? now))} ago`;
      } else if (g.status === 'rejected') {
        status = 'changes';
        sub = 'Waiting for the seller';
      } else {
        status = 'in_review';
        sub = 'Not listed yet';
      }
      return {
        id: g.id,
        auction_id: a?.id ?? null,
        title: g.title,
        image: firstImage(g.images),
        price: num(a?.currentPrice ?? a?.startingPrice),
        bids: a ? a.totalBids ?? 0 : null,
        status,
        status_label: LABEL[status],
        sub,
        path: a ? `/auctions?search=${encodeURIComponent(g.title)}` : `/gadgets?search=${encodeURIComponent(g.title)}`,
      };
    })
    .sort((x, y) => ORDER.indexOf(x.status) - ORDER.indexOf(y.status));
};

const PAYOUT_LABEL: Record<string, string> = { sending: 'Sending', paid: 'Paid', failed: 'Didn’t go through' };

export const sellerPayouts = async (id: string) => {
  await loadPerson(id, 'seller');
  const rows = await prisma.sellerPayout.findMany({
    where: { sellerId: id },
    select: { id: true, reference: true, amount: true, status: true, createdAt: true, orderCount: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map(p => ({
    id: p.id,
    reference: p.reference,
    amount: num(p.amount),
    status: p.status,
    status_label: PAYOUT_LABEL[p.status] ?? p.status,
    created_at: p.createdAt.toISOString(),
    orders: p.orderCount,
  }));
};

/* ---------------- Notes ---------------- */

const personExists = async (id: string) => {
  const u = await prisma.user.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!u) throw new PeopleError('We can’t find that person.', 404);
};

export const listNotes = async (id: string) => {
  await personExists(id);
  const notes = await prisma.userNote.findMany({
    where: { userId: id },
    select: { id: true, body: true, kind: true, createdAt: true, author: { select: { fullName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return notes.map(n => ({
    id: n.id,
    body: n.body,
    author: n.author?.fullName ?? null,
    created_at: n.createdAt.toISOString(),
    kind: n.kind as 'note' | 'suspend' | 'pause' | 'restore',
  }));
};

export const addNote = async (adminId: string, id: string, raw: unknown) => {
  await personExists(id);
  const body = typeof raw === 'string' ? raw.trim() : '';
  if (body.length < 5) throw new PeopleError('Write a note of at least 5 characters.');
  const n = await prisma.userNote.create({
    data: { userId: id, authorId: adminId, body: body.slice(0, 1000) },
    select: { id: true, body: true, kind: true, createdAt: true, author: { select: { fullName: true } } },
  });
  return { id: n.id, body: n.body, author: n.author?.fullName ?? null, created_at: n.createdAt.toISOString(), kind: 'note' as const };
};

/* ---------------- What an action would do, and its email ---------------- */

const loadTarget = async (id: string) => {
  const u = await prisma.user.findFirst({
    where: { id, deletedAt: null, role: { in: PEOPLE_ROLES } },
    select: {
      id: true,
      role: true,
      fullName: true,
      businessName: true,
      email: true,
      createdAt: true,
      isActive: true,
      biddingPausedUntil: true,
      storeClosedAt: true,
      sellerApplication: { select: { businessName: true } },
    },
  });
  if (!u) throw new PeopleError('We can’t find that person.', 404);
  return u;
};
type Target = Awaited<ReturnType<typeof loadTarget>>;
const nameOf = (u: Target) =>
  (u.role === 'seller' ? u.sellerApplication?.businessName || u.businessName : null) || u.fullName || u.email || 'No name';

const liveAuctionCount = (sellerId: string) =>
  prisma.auction.count({ where: { ...sellerAuctionsWhere(sellerId), status: { in: ['active', 'scheduled'] } } });

export const restrictionPreview = async (adminId: string, id: string, kind: 'suspend' | 'pause_listings') => {
  const u = await loadTarget(id);
  const seller = u.role === 'seller';
  const [liveBids, liveAuctions, escrow, missed, restriction, approver] = await Promise.all([
    seller ? Promise.resolve([] as string[]) : liveBidAuctions(id),
    seller ? liveAuctionCount(id) : Promise.resolve(0),
    seller ? escrowOf(id) : Promise.resolve(0),
    missedCounts([id]),
    openRestriction(id),
    secondAdmin(adminId),
  ]);
  const m = missed.get(id) ?? 0;
  const needsSecond = kind === 'pause_listings' && seller && (liveAuctions > 0 || escrow > 0);
  return {
    name: nameOf(u),
    email: u.email,
    type: (seller ? 'seller' : 'buyer') as 'buyer' | 'seller',
    joined_at: iso(u.createdAt),
    live_bids: liveBids.length,
    live_auctions: liveAuctions,
    escrow,
    needs_second_admin: needsSecond,
    approver: needsSecond ? approver?.fullName ?? null : null,
    suggested_reason: !seller && m >= MISSED_PAYMENT_LIMIT ? ('missed_payments' as const) : null,
    missed_90d: m,
    restriction: restriction ? restrictionView(restriction) : null,
  };
};

/** Before a reason is picked, the email shows where it goes (as in the design). */
const PICK = '[the reason you pick]';

const buildEmail = async (
  u: Target,
  kind: 'suspend' | 'pause_listings' | 'restore',
  reason: string,
  duration?: string
): Promise<BuiltEmail> => {
  if (kind === 'restore') {
    const r = await openRestriction(u.id);
    const seller = r?.kind === 'pause_listings';
    return buildRestoredEmail({
      firstName: seller ? nameOf(u) : firstName(u.fullName),
      seller,
      reason: (RESTORE_REASONS as readonly string[]).includes(reason) ? (reason as RestoreReason) : 'served',
    });
  }
  if (kind === 'suspend') {
    return buildSuspendedEmail({
      firstName: firstName(u.fullName),
      why: reason ? SUSPEND_REASONS[reason as SuspendReason]?.email ?? SUSPEND_REASONS.other.email : PICK,
      until: untilText(duration && (SUSPEND_DURATIONS as readonly string[]).includes(duration) ? duration : '7d'),
    });
  }
  const d = duration && (PAUSE_DURATIONS as readonly string[]).includes(duration) ? duration : 'until_fixed';
  return buildListingsPausedEmail({
    name: nameOf(u),
    why: reason ? PAUSE_REASONS[reason as PauseReason]?.email ?? PAUSE_REASONS.other.email : PICK,
    until: untilText(d),
    closeStore: d === 'close_store',
    liveAuctions: await liveAuctionCount(u.id),
  });
};

export const emailPreview = async (
  id: string,
  kind: 'suspend' | 'pause_listings' | 'restore',
  reason: string,
  duration?: string
) => buildEmail(await loadTarget(id), kind, reason, duration);

/* ---------------- Doing it ---------------- */

const checkNote = (reason: string, raw: unknown) => {
  const note = typeof raw === 'string' ? raw.trim().slice(0, 500) : '';
  if (reason === 'other' && note.length < 10) throw new PeopleError('Say what happened in the note (at least 10 characters).');
  return note || null;
};

const audit = (adminId: string | null, action: string, userId: string, changes: Record<string, unknown>) =>
  prisma.auditLog
    .create({
      data: {
        userId: adminId,
        action,
        resourceType: 'user',
        resourceId: userId,
        changes: changes as Prisma.InputJsonValue,
      },
    })
    .catch(err => logger.error('People audit failed:', err));

const email = (to: string | null, e: BuiltEmail) => {
  if (!to) return;
  sendBuiltEmail(to, e).catch(err => logger.error('People email failed:', err));
};

/** Takes the buyer's bids off auctions still running; the next-highest bidder leads again. */
const withdrawLiveBids = async (userId: string) => {
  const auctionIds = await liveBidAuctions(userId);
  for (const auctionId of auctionIds) {
    await prisma.$transaction(async tx => {
      const auction = await tx.auction.findUnique({ where: { id: auctionId }, select: { startingPrice: true, status: true } });
      if (!auction || auction.status !== 'active') return;
      const theirs = await tx.bid.findMany({
        where: { auctionId, bidderId: userId, status: { in: ['active', 'outbid'] } },
        select: { id: true, isWinning: true },
      });
      if (!theirs.length) return;
      await tx.bid.updateMany({ where: { id: { in: theirs.map(b => b.id) } }, data: { status: 'withdrawn', isWinning: false } });
      const remaining = await tx.bid.findMany({
        where: { auctionId, status: { in: ['active', 'outbid'] } },
        orderBy: [{ amount: 'desc' }, { bidTime: 'asc' }],
        select: { id: true, amount: true, isWinning: true },
      });
      const top = remaining[0];
      if (theirs.some(b => b.isWinning) && top) {
        await tx.bid.update({ where: { id: top.id }, data: { isWinning: true, status: 'active' } });
      }
      await tx.auction.update({
        where: { id: auctionId },
        data: {
          totalBids: remaining.length,
          ...(theirs.some(b => b.isWinning) ? { currentPrice: top ? top.amount : auction.startingPrice } : {}),
          updatedAt: new Date(),
        },
      });
    });
    // Their ₦1,000 commitment on this auction goes back to their wallet.
    const hold = await prisma.bidHold.findFirst({
      where: { status: 'held', bid: { auctionId, bidderId: userId } },
      select: { bidId: true },
    });
    if (hold?.bidId) await releaseHold(hold.bidId).catch(err => logger.error('Release hold failed:', err));
  }
  await prisma.autoBid.updateMany({ where: { userId, isActive: true }, data: { isActive: false } });
  return auctionIds.length;
};

type PausedAuction = { id: string; status: string; remaining_ms: number; starts_in_ms: number; duration_ms: number };

/** Pauses the seller's live and scheduled auctions, keeping the time each had left; tells their bidders. */
const pauseAuctions = async (sellerId: string): Promise<PausedAuction[]> => {
  const now = Date.now();
  const auctions = await prisma.auction.findMany({
    where: { ...sellerAuctionsWhere(sellerId), status: { in: ['active', 'scheduled'] } },
    select: { id: true, status: true, startTime: true, endTime: true, gadget: { select: { title: true } } },
  });
  if (!auctions.length) return [];
  await prisma.auction.updateMany({ where: { id: { in: auctions.map(a => a.id) } }, data: { status: 'paused', updatedAt: new Date() } });
  const bidders = await prisma.bid.findMany({
    where: { auctionId: { in: auctions.map(a => a.id) }, status: { in: ['active', 'outbid'] } },
    select: { auctionId: true, bidderId: true },
    distinct: ['auctionId', 'bidderId'],
  });
  for (const b of bidders) {
    const a = auctions.find(x => x.id === b.auctionId);
    if (!a || !b.bidderId) continue;
    createNotification(
      b.bidderId,
      'system',
      'Auction paused',
      `Bidding on ${a.gadget?.title ?? 'an auction you bid on'} is paused while our team checks the seller. Your bid stays, and the auction keeps the time it had left.`,
      { auction_id: a.id }
    ).catch(() => {});
  }
  return auctions.map(a => ({
    id: a.id,
    status: a.status ?? 'active',
    remaining_ms: Math.max(0, a.endTime.getTime() - Math.max(now, a.startTime.getTime())),
    starts_in_ms: Math.max(0, a.startTime.getTime() - now),
    duration_ms: a.endTime.getTime() - a.startTime.getTime(),
  }));
};

/** Minimum time a resumed auction gets, so bidders can come back to it. */
const RESUME_MIN_MS = 15 * 60_000;

const resumeAuctions = async (paused: PausedAuction[]) => {
  const now = Date.now();
  for (const p of paused) {
    const a = await prisma.auction.findUnique({ where: { id: p.id }, select: { status: true, gadget: { select: { title: true } } } });
    if (a?.status !== 'paused') continue;
    if (p.status === 'scheduled' && p.starts_in_ms > 0) {
      const start = new Date(now + p.starts_in_ms);
      await prisma.auction.update({
        where: { id: p.id },
        data: { status: 'scheduled', startTime: start, endTime: new Date(start.getTime() + p.duration_ms), updatedAt: new Date() },
      });
    } else {
      await prisma.auction.update({
        where: { id: p.id },
        data: { status: 'active', endTime: new Date(now + Math.max(p.remaining_ms, RESUME_MIN_MS)), updatedAt: new Date() },
      });
      const bidders = await prisma.bid.findMany({
        where: { auctionId: p.id, status: { in: ['active', 'outbid'] } },
        select: { bidderId: true },
        distinct: ['bidderId'],
      });
      bidders.forEach(
        b =>
          b.bidderId &&
          createNotification(b.bidderId, 'system', 'Bidding is back on', `${a.gadget?.title ?? 'The auction'} is open for bids again.`, {
            auction_id: p.id,
          }).catch(() => {})
      );
    }
  }
};

/** Applies a restriction's effects (once it's active). */
const applyRestriction = async (r: { id: string; userId: string; kind: string; closeStore: boolean }) => {
  if (r.kind === 'suspend') {
    await prisma.user.update({ where: { id: r.userId }, data: { isActive: false } });
    await prisma.refreshToken.deleteMany({ where: { userId: r.userId } });
    const withdrawn = await withdrawLiveBids(r.userId);
    await prisma.accountRestriction.update({ where: { id: r.id }, data: { meta: { withdrawn_bids: withdrawn } } });
    return;
  }
  const paused = await pauseAuctions(r.userId);
  if (r.closeStore) {
    await prisma.user.update({ where: { id: r.userId }, data: { storeClosedAt: new Date() } });
    await prisma.refreshToken.deleteMany({ where: { userId: r.userId } });
  }
  await prisma.accountRestriction.update({ where: { id: r.id }, data: { meta: { auctions: paused } as Prisma.InputJsonValue } });
};

const note = (userId: string, authorId: string | null, kind: 'suspend' | 'pause' | 'restore', body: string | null) =>
  body ? prisma.userNote.create({ data: { userId, authorId, kind, body } }).catch(() => {}) : Promise.resolve();

export const suspendBuyer = async (adminId: string, id: string, body: { reason?: unknown; duration?: unknown; note?: unknown }) => {
  const u = await loadTarget(id);
  if (u.role !== 'bidder') throw new PeopleError('Only buyers can be suspended here. Pause a seller’s listings instead.');
  const reason = String(body.reason ?? '') as SuspendReason;
  if (!(reason in SUSPEND_REASONS)) throw new PeopleError('Pick why you’re suspending them.');
  const duration = String(body.duration ?? '') as SuspendDuration;
  if (!(SUSPEND_DURATIONS as readonly string[]).includes(duration)) throw new PeopleError('Pick how long.');
  const text = checkNote(reason, body.note);
  if (await openRestriction(id)) throw new PeopleError('They’re already suspended or paused. Restore them first.');

  const r = await prisma.accountRestriction.create({
    data: {
      userId: id,
      kind: 'suspend',
      reason,
      note: text,
      until: untilFor(duration),
      status: 'active',
      requestedBy: adminId,
      appliedAt: new Date(),
    },
  });
  await applyRestriction(r);
  await note(id, adminId, 'suspend', text);
  await audit(adminId, 'user_suspend', id, { reason, duration, note: text });
  email(u.email, await buildEmail(u, 'suspend', reason, duration));
  return { status: 'active' as const, restriction: restrictionView((await openRestriction(id))!) };
};

export const pauseSellerListings = async (adminId: string, id: string, body: { reason?: unknown; duration?: unknown; note?: unknown }) => {
  const u = await loadTarget(id);
  if (u.role !== 'seller') throw new PeopleError('Only sellers have listings to pause. Suspend a buyer instead.');
  const reason = String(body.reason ?? '') as PauseReason;
  if (!(reason in PAUSE_REASONS)) throw new PeopleError('Pick why you’re pausing them.');
  const duration = String(body.duration ?? '') as PauseDuration;
  if (!(PAUSE_DURATIONS as readonly string[]).includes(duration)) throw new PeopleError('Pick how long.');
  const text = checkNote(reason, body.note);
  if (await openRestriction(id)) throw new PeopleError('Their listings are already paused (or waiting for approval).');

  // Live auctions or money in escrow: a second admin approves before anything changes.
  const [live, escrow] = await Promise.all([liveAuctionCount(id), escrowOf(id)]);
  const needsSecond = live > 0 || escrow > 0;
  const approver = needsSecond ? await secondAdmin(adminId) : null;
  if (needsSecond && !approver) {
    throw new PeopleError('This seller has live auctions or money in escrow, so a second admin has to approve. There’s no other admin yet.');
  }

  const r = await prisma.accountRestriction.create({
    data: {
      userId: id,
      kind: 'pause_listings',
      reason,
      note: text,
      until: untilFor(duration),
      closeStore: duration === 'close_store',
      status: needsSecond ? 'pending' : 'active',
      requestedBy: adminId,
      approverId: approver?.id ?? null,
      appliedAt: needsSecond ? null : new Date(),
      // The duration is kept so approval starts the clock then.
      meta: { duration } as Prisma.InputJsonValue,
    },
  });
  await note(id, adminId, 'pause', text);
  await audit(adminId, needsSecond ? 'seller_pause_requested' : 'seller_pause', id, { reason, duration, note: text });

  if (needsSecond && approver) {
    const requester = await prisma.user.findUnique({ where: { id: adminId }, select: { fullName: true } });
    createNotification(
      approver.id,
      'system',
      'Approve a listings pause',
      `${requester?.fullName ?? 'An admin'} wants to pause ${nameOf(u)}’s listings (${PAUSE_REASONS[reason].label.toLowerCase()}). Open Users › Suspended to approve or decline.`,
      { path: '/users/suspended', restriction_id: r.id }
    ).catch(() => {});
    return { status: 'pending' as const, restriction: restrictionView((await openRestriction(id))!) };
  }

  await applyRestriction(r);
  email(u.email, await buildEmail(u, 'pause_listings', reason, duration));
  return { status: 'active' as const, restriction: restrictionView((await openRestriction(id))!) };
};

export const approveRestriction = async (adminId: string, restrictionId: string) => {
  const r = await prisma.accountRestriction.findUnique({ where: { id: restrictionId } });
  if (!r || r.status !== 'pending') throw new PeopleError('This is no longer waiting for approval.', 409);
  if (r.requestedBy === adminId) throw new PeopleError('Someone other than the admin who asked has to approve it.', 403);
  const duration = String((r.meta as { duration?: string } | null)?.duration ?? 'until_fixed');
  const updated = await prisma.accountRestriction.update({
    where: { id: r.id },
    data: { status: 'active', approverId: adminId, appliedAt: new Date(), until: untilFor(duration) },
  });
  await applyRestriction(updated);
  await audit(adminId, 'seller_pause_approved', r.userId, { restriction_id: r.id });
  const u = await loadTarget(r.userId);
  email(u.email, await buildEmail(u, 'pause_listings', r.reason, duration));
  return restrictionView((await openRestriction(r.userId))!);
};

export const declineRestriction = async (adminId: string, restrictionId: string) => {
  const r = await prisma.accountRestriction.findUnique({ where: { id: restrictionId } });
  if (!r || r.status !== 'pending') throw new PeopleError('This is no longer waiting for approval.', 409);
  await prisma.accountRestriction.update({
    where: { id: r.id },
    data: { status: 'declined', liftedAt: new Date(), liftedBy: adminId },
  });
  await audit(adminId, 'seller_pause_declined', r.userId, { restriction_id: r.id });
  return { declined: true as const };
};

/** Lifts what's in place (a team restriction, an older switch-off, or an automatic bidding pause). */
const lift = async (
  adminId: string | null,
  userId: string,
  reason: RestoreReason | 'expired',
  text: string | null
) => {
  const u = await loadTarget(userId);
  const r = await openRestriction(userId);
  if (r?.status === 'pending') throw new PeopleError('This pause is still waiting for approval. Decline it instead.');

  if (r) {
    if (r.kind === 'suspend') {
      await prisma.user.update({ where: { id: userId }, data: { isActive: true } });
    } else {
      const paused = ((r.meta as { auctions?: PausedAuction[] } | null)?.auctions ?? []) as PausedAuction[];
      await resumeAuctions(paused);
      if (r.closeStore) await prisma.user.update({ where: { id: userId }, data: { storeClosedAt: null } });
    }
    await prisma.accountRestriction.update({
      where: { id: r.id },
      data: { status: 'lifted', liftedAt: new Date(), liftedBy: adminId, liftReason: reason, liftNote: text },
    });
  } else if (u.isActive === false) {
    await prisma.user.update({ where: { id: userId }, data: { isActive: true } });
  } else if (u.biddingPausedUntil && u.biddingPausedUntil > new Date()) {
    await prisma.user.update({ where: { id: userId }, data: { biddingPausedUntil: null } });
  } else if (u.storeClosedAt) {
    // The seller closed their own store; "Contact us to reopen it" ends here.
    await prisma.user.update({ where: { id: userId }, data: { storeClosedAt: null } });
  } else {
    throw new PeopleError('They’re not suspended or paused.');
  }

  await note(userId, adminId, 'restore', text);
  await audit(adminId, 'user_restore', userId, { reason, note: text, restriction_id: r?.id ?? null });
  const seller = r?.kind === 'pause_listings' || (!r && u.role === 'seller' && !!u.storeClosedAt);
  email(
    u.email,
    buildRestoredEmail({ firstName: seller ? nameOf(u) : firstName(u.fullName), seller, reason })
  );
};

export const restorePerson = async (adminId: string, id: string, body: { reason?: unknown; note?: unknown }) => {
  const reason = String(body.reason ?? '') as RestoreReason;
  if (!(RESTORE_REASONS as readonly string[]).includes(reason)) throw new PeopleError('Pick why you’re restoring them.');
  const text = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null;
  await lift(adminId, id, reason, text);
  return { restored: true as const };
};

/** Suspensions and pauses that ran their time (7 or 30 days) end by themselves. Runs with the auction job. */
export const liftExpiredRestrictions = async () => {
  const due = await prisma.accountRestriction.findMany({
    where: { status: 'active', until: { lte: new Date() } },
    select: { userId: true },
    take: 50,
  });
  for (const r of due) {
    await lift(null, r.userId, 'expired', null).catch(err => logger.error('Lift expired restriction failed:', err));
  }
  return due.length;
};

export const sendPasswordReset = async (id: string) => {
  const u = await loadTarget(id);
  if (!u.email) throw new PeopleError('They don’t have an email on their account.');
  await startPasswordReset(u.email);
  return { sent_to: maskEmail(u.email) };
};

/** For the sign-in message: the team's suspension on this account, if any. */
export const suspensionFor = (userId: string) =>
  prisma.accountRestriction.findFirst({
    where: { userId, kind: 'suspend', status: 'active' },
    select: { until: true },
  });

/** For the listing gate and payouts: the team paused this seller's listings. */
export const listingsPausedByTeam = async (sellerId: string) =>
  !!(await prisma.accountRestriction.findFirst({
    where: { userId: sellerId, kind: 'pause_listings', status: 'active' },
    select: { id: true },
  }));
