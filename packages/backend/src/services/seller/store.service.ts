import { randomInt } from 'crypto';
import prisma from '../../config/prisma';
import config from '../../config';
import logger from '../../utils/logger';
import { Prisma } from '../../generated/prisma';
import * as ratingService from '../buyer/rating.service';
import * as buyerStore from '../buyer/store.service';
import { sellerCode } from '../buyer/sellerSummary.service';
import { inspectionPassed, dropoffDueAt } from '../order/order.service';
import { createNotification } from '../notification/notification.service';
import { sendSMS } from '../notification/sms.service';
import { sendStaffInviteEmail } from '../notification/email.service';
import { getPayoutAccount } from './payoutAccount.service';
import { DOCUMENT_KINDS, SELLER_CATEGORIES } from './sellerApplication.service';

/**
 * The seller app's Store tab and the screens under it: the store card, store details (about and
 * hours), reviews, staff who can use the hub, sales insights. Seller side only; buyers see the
 * store through services/buyer/store.service.ts (anonymous: "Verified seller CV-1042").
 */

export class StoreError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

const DAY_MS = 86_400_000;
export const STAFF_MAX = 5;
export const ABOUT_MAX = 200;
export const REPLY_MAX = 500;
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type Day = (typeof DAYS)[number];
export type StoreHours = Record<Day, { open: string; close: string } | null>;

/** Orders that reached the buyer, refunded or not. "As described" is measured against these. */
const COMPLETED: Prisma.OrderWhereInput = { fulfillmentStatus: 'delivered' };
/** Sales: delivered, paid and not refunded after a case. Same as the buyer store's sales count. */
const SOLD: Prisma.OrderWhereInput = {
  fulfillmentStatus: 'delivered',
  paymentStatus: 'paid',
  disputes: { none: { outcome: 'refund' } },
};

/* ---------------- Helpers ---------------- */

/** 0803…, 803…, +234803… → +234803…; null when it isn't a Nigerian mobile number. */
const toPhone = (raw: string) => {
  const d = raw.replace(/\D/g, '');
  const phone = d.startsWith('234') ? `+${d}` : d.startsWith('0') ? `+234${d.slice(1)}` : `+234${d}`;
  return /^\+234[789][01]\d{8}$/.test(phone) ? phone : null;
};
/** +2348030000000 → "0803 000 0000" */
const localPhone = (p: string | null) =>
  p && p.startsWith('+234') ? `0${p.slice(4, 7)} ${p.slice(7, 10)} ${p.slice(10)}` : p;

/** "Shop 14, Otigba Tech Plaza · Computer Village" */
const shopLine = (app: { shopNumber: string | null; plaza: string | null; area: string } | null) => {
  if (!app) return null;
  const shop = app.shopNumber?.trim();
  const unit = shop ? (/^\d/.test(shop) ? `Shop ${shop}` : shop) : null;
  const place = [unit, app.plaza?.trim()].filter(Boolean).join(', ');
  const area = app.area?.replace(/,\s*Ikeja$/i, '').trim();
  return [place, area].filter(Boolean).join(' · ') || null;
};

/** "TechSwap Lagos" → "TS", "Ade Phones Ltd" → "AP". */
const initials = (name: string | null) =>
  (name || '')
    .replace(/\b(ltd|limited|ent|enterprises?|ventures?|nig|nigeria|company)\b\.?/gi, '')
    .split(/[\s&.-]+/)
    .flatMap(w => w.split(/(?<=[a-z])(?=[A-Z])/))
    .filter(w => /[a-z0-9]/i.test(w))
    .slice(0, 2)
    .map(w => w[0]!.toUpperCase())
    .join('') || 'S';

type DocLite = { status?: string | null };
const docsWithStatus = (documents: unknown, status: string) => {
  const docs = (documents ?? {}) as Partial<Record<string, DocLite>>;
  return DOCUMENT_KINDS.filter(k => docs[k]?.status === status).length;
};
const docsMissing = (documents: unknown) => {
  const docs = (documents ?? {}) as Partial<Record<string, DocLite>>;
  return DOCUMENT_KINDS.filter(k => !docs[k]).length;
};

const loadSeller = async (sellerId: string) => {
  const u = await prisma.user.findUnique({
    where: { id: sellerId },
    select: {
      id: true,
      businessName: true,
      sellerKybStatus: true,
      cacNumber: true,
      createdAt: true,
      storeAbout: true,
      storeHours: true,
      storeAway: true,
      sellerApplication: {
        select: {
          id: true,
          status: true,
          businessName: true,
          ownerName: true,
          categories: true,
          plaza: true,
          shopNumber: true,
          area: true,
          businessPhone: true,
          decidedAt: true,
          documents: true,
        },
      },
    },
  });
  if (!u) throw new StoreError('Account not found', 404);
  return u;
};
type SellerRow = Awaited<ReturnType<typeof loadSeller>>;

const businessNameOf = (u: SellerRow) =>
  (u.sellerApplication?.status === 'approved' ? u.sellerApplication.businessName?.trim() : null) ||
  u.businessName?.trim() ||
  u.sellerApplication?.businessName?.trim() ||
  null;

/* ---------------- GET /seller/store ---------------- */

/** Passed checks: of the orders the hub has inspected, how many passed every check. */
const inspectionStats = async (sellerId: string) => {
  const rows = await prisma.order.findMany({
    where: { sellerId, inspection: { not: Prisma.DbNull } },
    select: { inspection: true },
  });
  const passed = rows.filter(r => inspectionPassed(r.inspection)).length;
  return { inspected: rows.length, passed, percent: rows.length ? Math.round((passed / rows.length) * 100) : null };
};

export const overview = async (sellerId: string) => {
  const u = await loadSeller(sellerId);
  const app = u.sellerApplication;
  const [rating, sales, checks, payout, staffCount] = await Promise.all([
    ratingService.summaryFor(sellerId),
    prisma.order.count({ where: { sellerId, ...SOLD } }),
    inspectionStats(sellerId),
    getPayoutAccount(sellerId).catch(() => null),
    prisma.storeStaff.count({ where: { sellerId } }),
  ]);
  const name = businessNameOf(u);
  const since = (app?.status === 'approved' && app.decidedAt) || u.createdAt || new Date();

  return {
    business_name: name,
    initials: initials(name),
    seller_code: sellerCode(sellerId),
    shop_line: shopLine(app),
    since: since.toISOString(),
    badges: buyerStore.storeBadges(u, rating, sales),
    stats: {
      sales,
      rating: rating.average,
      rating_count: rating.count,
      /** null until the hub has inspected something. */
      passed_checks_percent: checks.percent,
      inspected: checks.inspected,
    },
    payout_account: payout?.account
      ? { bank_name: payout.account.bank_name, account_number_last4: payout.account.account_number_last4 }
      : null,
    staff_count: staffCount,
    documents: {
      total: DOCUMENT_KINDS.length,
      /** Our team asked for a new one. */
      needs_update: app ? docsWithStatus(app.documents, 'needs_fix') : 0,
      /** A new one sent, waiting for our team (approved sellers only; before that the application is in review). */
      in_review: app?.status === 'approved' ? docsWithStatus(app.documents, 'submitted') : 0,
      /** Never uploaded. */
      missing: docsMissing(app?.documents),
    },
  };
};

/* ---------------- Store details: about + hours ---------------- */

const readHours = (value: unknown): StoreHours | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const out = {} as StoreHours;
  for (const d of DAYS) {
    const h = v[d] as { open?: unknown; close?: unknown } | null | undefined;
    out[d] = h && typeof h.open === 'string' && typeof h.close === 'string' ? { open: h.open, close: h.close } : null;
  }
  return out;
};

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_NAMES: Record<Day, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

/** Every day must be there: closed (null) or open → close, 24-hour "HH:MM", closing after opening. */
const parseHours = (input: unknown): StoreHours => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new StoreError('Send the hours for each day.');
  const v = input as Record<string, unknown>;
  const out = {} as StoreHours;
  for (const d of DAYS) {
    const h = v[d];
    if (h === null || h === undefined || h === false) {
      out[d] = null;
      continue;
    }
    const { open, close } = (h ?? {}) as { open?: unknown; close?: unknown };
    if (typeof open !== 'string' || typeof close !== 'string' || !TIME.test(open) || !TIME.test(close)) {
      throw new StoreError(`Set an opening and closing time for ${DAY_NAMES[d]}, like 09:00 and 18:00.`);
    }
    if (close <= open) throw new StoreError(`${DAY_NAMES[d]} has to close after it opens.`);
    out[d] = { open, close };
  }
  return out;
};

/** Buyers reach sellers through us only (design guide › Privacy), so no contact details or the business name. */
const aboutProblem = (about: string, businessName: string | null) => {
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(about)) return 'Leave email addresses out. Buyers reach you through us.';
  if (/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|ng|net|org|shop|store)\b)/i.test(about)) return 'Leave links out. Buyers reach you through us.';
  const phoneLike = (about.match(/\+?\d[\d\s-]{8,}\d/g) ?? []).map(m => m.replace(/\D/g, ''));
  if (phoneLike.some(d => d.length >= 10 && /^(0[789][01]|234[789][01])/.test(d))) {
    return 'Leave phone numbers out. Buyers reach you through us.';
  }
  if (/\b(whats\s?app|telegram|instagram|call me|dm me)\b/i.test(about)) return 'Leave contact details out. Buyers reach you through us.';
  const text = ` ${about.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  const distinctive = (businessName ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(w => w.length >= 4 && !GENERIC_NAME_WORDS.has(w));
  if (distinctive.some(w => text.includes(` ${w} `))) {
    return 'Leave your business name out. Buyers see your store as a verified seller code.';
  }
  return null;
};

/** Words in business names that are fine to use when describing the shop. */
const GENERIC_NAME_WORDS = new Set(
  (
    'phone phones mobile mobiles gadget gadgets tech techs technology technologies store stores shop shops computer ' +
    'computers laptop laptops village plaza lagos ikeja otigba global world digital electronics electronic ' +
    'communications services solutions accessories limited enterprise enterprises ventures venture nigeria company ' +
    'international concepts concept trading investment investments resources link links point'
  ).split(' ')
);

const detailsView = (u: SellerRow) => {
  const app = u.sellerApplication;
  return {
    /** Verified, can't be changed here: business name, the code buyers see, area. */
    business_name: businessNameOf(u),
    seller_code: sellerCode(u.id),
    area: app?.area ?? null,
    shop: {
      plaza: app?.plaza ?? null,
      shop_number: app?.shopNumber ?? null,
      area: app?.area ?? null,
      line: shopLine(app),
    },
    /** "0803 000 0000" */
    business_phone: localPhone(app?.businessPhone ?? null),
    categories: app?.categories ?? [],
    category_options: SELLER_CATEGORIES,
    about: u.storeAbout ?? null,
    about_max: ABOUT_MAX,
    hours: readHours(u.storeHours),
    /** "Open Mon–Sat, 9:00 am–6:00 pm" (null: not set). */
    hours_line: buyerStore.hoursLine(u.storeHours),
    /** Away: new listings are paused. */
    away: u.storeAway,
  };
};

export const getDetails = async (sellerId: string) => detailsView(await loadSeller(sellerId));

type DetailsBody = {
  about?: unknown;
  hours?: unknown;
  plaza?: unknown;
  shop_number?: unknown;
  business_phone?: unknown;
  categories?: unknown;
  away?: unknown;
};

/** Trimmed, single-spaced text; "" when empty. */
const oneLine = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

/**
 * About, hours and away are on the account; plaza, shop number, business phone and what you sell
 * are on the seller application (the same fields the seller filled in to apply).
 */
export const updateDetails = async (sellerId: string, body: DetailsBody) => {
  const u = await loadSeller(sellerId);
  const data: Prisma.UserUpdateInput = {};
  if (body.about !== undefined) {
    const about = body.about === null ? '' : String(body.about).replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
    if (about.length > ABOUT_MAX) throw new StoreError(`Keep it to ${ABOUT_MAX} characters.`);
    const problem = about ? aboutProblem(about, businessNameOf(u)) : null;
    if (problem) throw new StoreError(problem);
    data.storeAbout = about || null;
  }
  if (body.hours !== undefined) {
    data.storeHours = body.hours === null ? Prisma.DbNull : (parseHours(body.hours) as Prisma.InputJsonValue);
  }
  if (body.away !== undefined) {
    if (typeof body.away !== 'boolean') throw new StoreError('Turn away mode on or off.');
    data.storeAway = body.away;
  }

  const shop: Prisma.SellerApplicationUpdateInput = {};
  if (body.plaza !== undefined) {
    const plaza = oneLine(body.plaza);
    if (!plaza) throw new StoreError('Enter the plaza or building your shop is in.');
    if (plaza.length > 120) throw new StoreError('Keep the plaza name under 120 characters.');
    shop.plaza = plaza;
  }
  if (body.shop_number !== undefined) {
    const number = oneLine(body.shop_number);
    if (!number) throw new StoreError('Enter your shop number, like Shop 14, 2nd floor.');
    if (number.length > 60) throw new StoreError('Keep the shop number under 60 characters.');
    shop.shopNumber = number;
  }
  if (body.business_phone !== undefined) {
    const phone = toPhone(String(body.business_phone ?? ''));
    if (!phone) throw new StoreError('Enter a Nigerian mobile number, like 0803 000 0000.');
    shop.businessPhone = phone;
  }
  if (body.categories !== undefined) {
    const picked = Array.isArray(body.categories) ? body.categories.map(String) : [];
    const bad = picked.find(c => !SELLER_CATEGORIES.includes(c));
    if (bad) throw new StoreError(`"${bad}" isn't one of the categories we sell.`);
    if (!picked.length) throw new StoreError('Pick at least one thing you sell.');
    shop.categories = SELLER_CATEGORIES.filter(c => picked.includes(c));
  }
  if (Object.keys(shop).length && !u.sellerApplication) {
    throw new StoreError('We couldn’t find your seller application. Contact us to update your shop.', 409);
  }

  if (!Object.keys(data).length && !Object.keys(shop).length) return detailsView(u);
  await prisma.$transaction([
    ...(Object.keys(data).length ? [prisma.user.update({ where: { id: sellerId }, data: { ...data, updatedAt: new Date() } })] : []),
    ...(Object.keys(shop).length
      ? [prisma.sellerApplication.update({ where: { id: u.sellerApplication!.id }, data: shop })]
      : []),
  ]);
  return detailsView(await loadSeller(sellerId));
};

/* ---------------- Reviews ---------------- */

export const REVIEW_FILTERS = ['all', '5', '4', '3_or_less', 'not_replied'] as const;
export type ReviewFilter = (typeof REVIEW_FILTERS)[number];

const reviewWhere = (sellerId: string, filter: ReviewFilter): Prisma.RatingWhereInput => {
  const base: Prisma.RatingWhereInput = { rateeId: sellerId };
  if (filter === '5') return { ...base, score: 5 };
  if (filter === '4') return { ...base, score: 4 };
  if (filter === '3_or_less') return { ...base, score: { lte: 3 } };
  if (filter === 'not_replied') return { ...base, sellerReply: null };
  return base;
};

const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : null);

/**
 * The three figures under the stars:
 *  - As described: completed (delivered) orders with no case decided as a refund.
 *  - Well packed: buyers who answered "Was it well packed?" and said yes (null when nobody answered).
 *  - Fast drop-off: orders that reached the hub by the drop-off deadline, last 90 days
 *    (same as the Home tab's on-time figure).
 */
const reviewMetrics = async (sellerId: string) => {
  const since90 = new Date(Date.now() - 90 * DAY_MS);
  const [completed, refunded, packedYes, packedAnswered, dropOrders] = await Promise.all([
    prisma.order.count({ where: { sellerId, ...COMPLETED } }),
    prisma.order.count({ where: { sellerId, ...COMPLETED, disputes: { some: { outcome: 'refund' } } } }),
    prisma.rating.count({ where: { rateeId: sellerId, wellPacked: true } }),
    prisma.rating.count({ where: { rateeId: sellerId, wellPacked: { not: null } } }),
    prisma.order.findMany({
      where: {
        sellerId,
        paymentStatus: { in: ['paid', 'refunded'] },
        events: {
          some: {
            kind: 'fulfillment',
            status: { in: ['sent_to_backoffice', 'received_by_backoffice'] },
            createdAt: { gte: since90 },
          },
        },
      },
      select: { events: { select: { kind: true, status: true, createdAt: true }, orderBy: { createdAt: 'asc' } } },
      take: 500,
    }),
  ]);

  let dropped = 0;
  let onTime = 0;
  for (const o of dropOrders) {
    const paid = [...o.events].reverse().find(e => e.kind === 'payment' && e.status === 'paid');
    const atHub = o.events.find(
      e => e.kind === 'fulfillment' && (e.status === 'sent_to_backoffice' || e.status === 'received_by_backoffice')
    );
    if (!paid || !atHub || atHub.createdAt < since90) continue;
    dropped++;
    if (atHub.createdAt.getTime() <= dropoffDueAt(paid.createdAt).getTime()) onTime++;
  }

  return {
    as_described: { percent: percent(completed - refunded, completed), out_of: completed },
    well_packed: { percent: percent(packedYes, packedAnswered), out_of: packedAnswered },
    fast_dropoff: { percent: percent(onTime, dropped), out_of: dropped },
  };
};

/**
 * Ratings buyers left, with the summary, the three figures and a filter. The buyer is a
 * stand-in ("Buyer •••7"), never a name. Replies are public: buyers see them on the store page.
 */
export const reviews = async (sellerId: string, filterRaw?: unknown) => {
  const filter: ReviewFilter = REVIEW_FILTERS.includes(filterRaw as ReviewFilter) ? (filterRaw as ReviewFilter) : 'all';
  const [summary, breakdown, metrics, notReplied, rows] = await Promise.all([
    ratingService.summaryFor(sellerId),
    buyerStore.ratingBreakdown(sellerId),
    reviewMetrics(sellerId),
    prisma.rating.count({ where: reviewWhere(sellerId, 'not_replied') }),
    prisma.rating.findMany({
      where: reviewWhere(sellerId, filter),
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: buyerStore.REVIEW_INCLUDE,
    }),
  ]);
  const by = (score: number) => breakdown.find(b => b.score === score)?.count ?? 0;
  return {
    average: summary.average,
    count: summary.count,
    breakdown,
    metrics,
    filter,
    /** How many each filter chip would show. */
    counts: {
      all: summary.count,
      '5': by(5),
      '4': by(4),
      '3_or_less': by(3) + by(2) + by(1),
      not_replied: notReplied,
    },
    reply_max: REPLY_MAX,
    reviews: rows.map(buyerStore.reviewView),
  };
};

/** Write or change the public reply to a review. The buyer hears about the first reply. */
export const replyToReview = async (sellerId: string, ratingId: string, textRaw: unknown) => {
  const text = String(textRaw ?? '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new StoreError('Write your reply first.');
  if (text.length > REPLY_MAX) throw new StoreError(`Keep it to ${REPLY_MAX} characters.`);

  const rating = await prisma.rating.findFirst({
    where: { id: ratingId, rateeId: sellerId },
    include: buyerStore.REVIEW_INCLUDE,
  });
  if (!rating) throw new StoreError('That review isn’t on your store.', 404);

  const problem = aboutProblem(text, businessNameOf(await loadSeller(sellerId)));
  if (problem) throw new StoreError(problem);

  const first = !rating.sellerReply;
  const updated = await prisma.rating.update({
    where: { id: rating.id },
    data: { sellerReply: text, sellerRepliedAt: new Date() },
    include: buyerStore.REVIEW_INCLUDE,
  });

  if (first) {
    const item = updated.order?.auction?.gadget?.title;
    await createNotification(
      rating.raterId,
      'system',
      'The seller replied to your review',
      `Verified seller ${sellerCode(sellerId)} replied${item ? ` about your ${item}` : ''}. See it on their store page.`,
      { kind: 'review_reply', ratingId: rating.id, sellerId, orderId: rating.orderId },
      ['push']
    ).catch(() => undefined);
  }
  return buyerStore.reviewView(updated);
};

/* ---------------- Staff who can drop off and collect ---------------- */

/** The ID a staff member shows at the hub. */
export const STAFF_ID_TYPES = {
  nin_slip: 'NIN slip',
  drivers_licence: "Driver's licence",
  passport: 'Passport',
  voters_card: "Voter's card",
} as const;
export type StaffIdType = keyof typeof STAFF_ID_TYPES;

/** A new invite email at most once a minute per person. */
const INVITE_RESEND_MS = 60_000;

const STAFF_SELECT = {
  id: true,
  fullName: true,
  phone: true,
  email: true,
  idType: true,
  userId: true,
  joinedAt: true,
  inviteSentAt: true,
  createdAt: true,
} as const;
type StaffRow = Prisma.StoreStaffGetPayload<{ select: typeof STAFF_SELECT }>;

export const staffIdLabel = (t: string | null) => (t && t in STAFF_ID_TYPES ? STAFF_ID_TYPES[t as StaffIdType] : null);

const staffView = (u: SellerRow, rows: StaffRow[]) => ({
  max: STAFF_MAX,
  business_name: businessNameOf(u),
  /** The owner, from the seller application. Their ID is on file with us. */
  owner: { full_name: u.sellerApplication?.ownerName?.trim() || null },
  id_types: Object.entries(STAFF_ID_TYPES).map(([key, label]) => ({ key, label })),
  staff: rows.map(r => ({
    id: r.id,
    full_name: r.fullName,
    phone: localPhone(r.phone),
    /** What they sign in with (null: added before staff could sign in). */
    email: r.email,
    /** invited: hasn't set up their sign-in yet · joined: signed in from the invite · no_email: added before invites */
    status: r.userId ? 'joined' : r.email ? 'invited' : 'no_email',
    joined_at: r.joinedAt?.toISOString() ?? null,
    invite_sent_at: r.inviteSentAt?.toISOString() ?? null,
    /** nin_slip | drivers_licence | passport | voters_card (null: added before we asked). */
    id_type: r.idType,
    id_label: staffIdLabel(r.idType),
    added_at: r.createdAt.toISOString(),
  })),
});

const listStaffRows = (sellerId: string, db: Pick<typeof prisma, 'storeStaff'> = prisma) =>
  db.storeStaff.findMany({ where: { sellerId }, orderBy: { createdAt: 'asc' }, select: STAFF_SELECT });

export const listStaff = async (sellerId: string) => {
  const [u, rows] = await Promise.all([loadSeller(sellerId), listStaffRows(sellerId)]);
  return staffView(u, rows);
};

/** "your NIN slip" (plain apostrophes keep the text message a single SMS). */
export const STAFF_ID_PHRASE: Record<StaffIdType, string> = {
  nin_slip: 'your NIN slip',
  drivers_licence: "your driver's licence",
  passport: 'your passport',
  voters_card: "your voter's card",
};

/** The store's name as staff see it: the business name, or "seller CV-1042" before one is set. */
export const storeNameFor = async (sellerId: string) => businessNameOf(await loadSeller(sellerId)) ?? `seller ${sellerCode(sellerId)}`;

/**
 * Text the new staff member their hub code. Only in production: the local SMS key is live, so
 * anywhere else the message is logged instead of sent.
 */
const sendStaffCode = async (phone: string, business: string, code: string, idType: StaffIdType) => {
  const message =
    `You can now drop off and collect at the Gadgets Bidding hub for ${business}. ` +
    `Your code: ${code}. Show it with ${STAFF_ID_PHRASE[idType]}.`;
  if (config.nodeEnv !== 'production') {
    logger.info(`[DEV] Staff code SMS not sent (NODE_ENV=${config.nodeEnv}). To ${phone.slice(0, 7)}•••: ${message}`);
    return;
  }
  const sent = await sendSMS({ to: phone, message }).catch(() => false);
  if (!sent) logger.warn(`Staff code SMS to ${phone.slice(0, 7)}••• didn't send`);
};

/** Email the invite: how to set up their sign-in, and their hub code. */
const sendInvite = async (u: SellerRow, row: { fullName: string; email: string; pickupCode: string | null; idType: string | null }) => {
  const idType = (row.idType && row.idType in STAFF_ID_TYPES ? row.idType : 'nin_slip') as StaffIdType;
  return sendStaffInviteEmail(row.email, {
    staffName: row.fullName,
    business: businessNameOf(u) ?? `seller ${sellerCode(u.id)}`,
    ownerName: u.sellerApplication?.ownerName?.trim() || null,
    email: row.email,
    pickupCode: row.pickupCode ?? '',
    idPhrase: STAFF_ID_PHRASE[idType],
  }).catch(() => false);
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Who can be invited with this email: not the owner, not someone already on a team, and not an
 * existing account (one email, one account). A staff account left over from a team they were
 * removed from can be invited again; it rejoins when they set up their sign-in.
 */
const emailProblem = async (sellerId: string, email: string, db: Prisma.TransactionClient) => {
  const onTeam = await db.storeStaff.findUnique({ where: { email }, select: { sellerId: true } });
  if (onTeam) {
    return onTeam.sellerId === sellerId
      ? 'Someone on your team already uses this email.'
      : "This email is already on another store's team. Use a different email.";
  }
  const account = await db.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, role: true },
  });
  if (!account) return null;
  if (account.id === sellerId) return "That's your email. Add your staff member's own email.";
  if (account.role === 'staff') return null;
  return 'This email already has a Gadgets Bidding account. Use a different email for their staff sign-in.';
};

export const addStaff = async (
  sellerId: string,
  body: { full_name?: unknown; email?: unknown; phone?: unknown; id_type?: unknown }
) => {
  const fullName = String(body.full_name ?? '').trim().replace(/\s+/g, ' ');
  if (fullName.length < 3 || !/^[\p{L}][\p{L}' .-]*$/u.test(fullName) || !fullName.includes(' ')) {
    throw new StoreError('Enter their first and last name, as on their ID.');
  }
  if (fullName.length > 80) throw new StoreError('Keep the name under 80 characters.');
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 255) throw new StoreError('Enter their email address. They sign in with it.');
  const phone = toPhone(String(body.phone ?? ''));
  if (!phone) throw new StoreError('Enter a Nigerian mobile number, like 0803 000 0000.');
  const idType = String(body.id_type ?? '') as StaffIdType;
  if (!(idType in STAFF_ID_TYPES)) throw new StoreError("Choose the ID they'll show at the hub.");

  const u = await loadSeller(sellerId);
  const pickupCode = String(randomInt(0, 1_000_000)).padStart(6, '0');

  const rows = await prisma.$transaction(async tx => {
    const existing = await tx.storeStaff.findMany({ where: { sellerId }, select: { phone: true } });
    if (existing.length >= STAFF_MAX) throw new StoreError(`You can add up to ${STAFF_MAX} people. Remove someone first.`);
    if (existing.some(r => r.phone === phone)) throw new StoreError('Someone with this number is already on your list.');
    const problem = await emailProblem(sellerId, email, tx);
    if (problem) throw new StoreError(problem);
    const created = await tx.storeStaff.create({ data: { sellerId, fullName, email, phone, idType, pickupCode }, select: { id: true } });
    return { id: created.id };
  });

  const [emailed] = await Promise.all([
    sendInvite(u, { fullName, email, pickupCode, idType }),
    sendStaffCode(phone, businessNameOf(u) ?? `seller ${sellerCode(sellerId)}`, pickupCode, idType),
  ]);
  if (emailed) await prisma.storeStaff.update({ where: { id: rows.id }, data: { inviteSentAt: new Date() } });
  return { ...staffView(u, await listStaffRows(sellerId)), invite_sent: emailed };
};

/** Send the invite again (they lost it, or it went to spam). */
export const resendStaffInvite = async (sellerId: string, staffId: string) => {
  const row = await prisma.storeStaff.findFirst({ where: { id: staffId, sellerId } });
  if (!row) throw new StoreError('That person is no longer on your list.', 404);
  if (row.userId) throw new StoreError(`${row.fullName.split(' ')[0]} has already set up their sign-in.`);
  if (!row.email) throw new StoreError('Remove them and add them again with their email.');
  if (row.inviteSentAt && Date.now() - row.inviteSentAt.getTime() < INVITE_RESEND_MS) {
    throw new StoreError('We just sent it. Wait a minute before sending again.', 429);
  }
  const u = await loadSeller(sellerId);
  const emailed = await sendInvite(u, { fullName: row.fullName, email: row.email, pickupCode: row.pickupCode, idType: row.idType });
  if (!emailed) throw new StoreError("We couldn't send the invite. Try again in a few minutes.", 502);
  await prisma.storeStaff.update({ where: { id: row.id }, data: { inviteSentAt: new Date() } });
  return listStaff(sellerId);
};

/** Take someone off the team. Their sign-in stops working straight away; their code stops too. */
export const removeStaff = async (sellerId: string, staffId: string) => {
  const row = await prisma.storeStaff.findFirst({ where: { id: staffId, sellerId }, select: { id: true, userId: true } });
  if (!row) throw new StoreError('That person is no longer on your list.', 404);
  await prisma.$transaction(async tx => {
    await tx.storeStaff.delete({ where: { id: row.id } });
    // Signed in on a phone: the next refresh fails, and every staff request checks the team first.
    if (row.userId) await tx.refreshToken.deleteMany({ where: { userId: row.userId } });
  });
  return listStaff(sellerId);
};

/* ---------------- Sales insights ---------------- */

const STATUS_LABEL = (a: { status: string | null; endTime: Date; order: { fulfillmentStatus: string | null } | null }) => {
  if (a.order) {
    if (a.order.fulfillmentStatus === 'delivered') return 'Sold';
    if (a.order.fulfillmentStatus === 'cancelled') return 'Not paid';
    return 'Sold · in progress';
  }
  if (a.status === 'active' && a.endTime > new Date()) return 'Live';
  if (a.status === 'scheduled') return 'Scheduled';
  if (a.status === 'cancelled') return 'Ended early';
  return 'Ended';
};

/**
 * Views, bids, items sold and earnings for the last 30 days and all time, plus each listing.
 * Views are a running count per listing, so "last 30 days" counts views on listings that went
 * live in that time. Items sold and earnings count completed orders (earnings = what you were paid).
 */
export const insights = async (sellerId: string) => {
  const since = new Date(Date.now() - 30 * DAY_MS);
  const auctionWhere: Prisma.AuctionWhereInput = { sellerId };

  const [viewsAll, views30, bidsAll, bids30, soldAll, sold30, listings] = await Promise.all([
    prisma.auction.aggregate({ where: auctionWhere, _sum: { viewCount: true } }),
    prisma.auction.aggregate({ where: { ...auctionWhere, startTime: { gte: since } }, _sum: { viewCount: true } }),
    prisma.bid.count({ where: { auction: auctionWhere } }),
    prisma.bid.count({ where: { auction: auctionWhere, bidTime: { gte: since } } }),
    prisma.order.aggregate({ where: { sellerId, ...SOLD }, _count: { _all: true }, _sum: { sellerPayout: true } }),
    prisma.order.aggregate({
      where: {
        sellerId,
        ...SOLD,
        OR: [{ buyerConfirmedAt: { gte: since } }, { buyerConfirmedAt: null, updatedAt: { gte: since } }],
      },
      _count: { _all: true },
      _sum: { sellerPayout: true },
    }),
    prisma.auction.findMany({
      where: auctionWhere,
      orderBy: { startTime: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        startTime: true,
        endTime: true,
        currentPrice: true,
        viewCount: true,
        gadget: { select: { title: true, images: true } },
        order: { select: { fulfillmentStatus: true, sellerPayout: true, totalAmount: true, deliveryFee: true } },
        _count: { select: { bids: true } },
      },
    }),
  ]);

  const money = (d: Prisma.Decimal | null | undefined) => Math.round(Number(d ?? 0));
  return {
    last_30_days: {
      views: views30._sum.viewCount ?? 0,
      bids: bids30,
      sold: sold30._count._all,
      earnings: money(sold30._sum.sellerPayout),
    },
    all_time: {
      views: viewsAll._sum.viewCount ?? 0,
      bids: bidsAll,
      sold: soldAll._count._all,
      earnings: money(soldAll._sum.sellerPayout),
    },
    listings: listings.map(a => {
      const delivered = a.order?.fulfillmentStatus === 'delivered';
      const sold = !!a.order && a.order.fulfillmentStatus !== 'cancelled';
      return {
        auction_id: a.id,
        title: a.gadget?.title ?? 'Listing',
        image: a.gadget?.images?.[0] ?? null,
        status: STATUS_LABEL(a),
        started_at: a.startTime.toISOString(),
        views: a.viewCount,
        bids: a._count.bids,
        /** Winning price (without delivery) once sold, else the current price. */
        price: sold ? money(a.order!.totalAmount) - money(a.order!.deliveryFee) : money(a.currentPrice),
        sold,
        earnings: delivered ? money(a.order!.sellerPayout) : 0,
      };
    }),
  };
};
