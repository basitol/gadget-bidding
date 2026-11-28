import { randomBytes } from 'crypto';
import prisma from '../../config/prisma';
import { Prisma } from '../../generated/prisma';
import logger from '../../utils/logger';
import * as paystackService from '../payment/paystack.service';
import * as walletService from '../wallet/wallet.service';
import { createNotification } from '../notification/notification.service';
import { sellerCode } from '../buyer/sellerSummary.service';
import { sendEmail } from '../notification/email.service';
import { namesMatch } from './payoutAccount.service';
import {
  LAGOS_UTC_OFFSET_HOURS,
  PAYOUT_HOUR,
  sixPmLagos,
  lastPayoutTime,
  nextPayoutTime,
  pausedForSlot,
  pauseOf,
  lagosShortDate,
  lagosDateTime,
} from './payoutSchedule';

/**
 * Sellers are paid once a day at 6:00 pm Lagos. Each run takes every seller's orders that were
 * ready for payout by then (buyer confirmed, or we confirmed for them, and no case open) and
 * makes one SellerPayout ("batch") per seller: one transfer to their saved payout account.
 *
 *   orders:  ready ──6 pm──▶ sending (payout_batch_id set) ──▶ paid
 *                                        └── failed ──▶ ready again (batch cleared), next 6 pm
 *   batches: sending ──▶ paid | failed
 *
 * Payouts live (env SELLER_PAYOUTS_LIVE=true): the run starts a Paystack transfer per batch and
 * the transfer webhooks settle it. Not live: batches wait in admin (Seller payouts) for our team
 * to send by hand, then Mark paid (bank reference) or Mark failed (reason).
 *
 * The run happens on the job tick (every 30 s), so it is safe to run again and again: an order is
 * claimed into a batch only while it's ready with no batch, under one advisory lock. If the server
 * was down at 6 pm the next tick catches up. "Ready by 6 pm" is judged by orders.updated_at, which
 * the DB trigger stamps with NOW() on every update (session time zone), so it's compared in SQL.
 *
 * A seller who changed their payout account is skipped until the pause ends (users.payouts_paused_until,
 * see payoutSchedule); their orders stay ready. Pending charges (SellerCharge, e.g. a return rider)
 * come off the batch, oldest first, each only while something is left to send; the rest wait for the
 * next payout. A failed payout puts its charges back to pending.
 */

const HOUR = 3_600_000;
export { PAYOUT_HOUR, lastPayoutTime, nextPayoutTime };

/** Batch creation runs one at a time across every server. */
const BATCH_LOCK_KEY = 724_001_018;

/** transfer_code while live: queued for the job, being started, else Paystack's TRF_… code. */
const QUEUED = 'queued';
const STARTING = 'starting';
/** A transfer stuck "starting" this long gets checked with Paystack. */
const STUCK_MS = 10 * 60_000;

export class PayoutError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string
  ) {
    super(message);
  }
}

/* ---------------- Time ---------------- */

/** "PO-20261127-7F3A2C" (the Lagos date of the run). Paystack gets it in lower case. */
const newReference = (slot: Date) => {
  const lagos = new Date(slot.getTime() + LAGOS_UTC_OFFSET_HOURS * HOUR);
  const day = lagos.toISOString().slice(0, 10).replace(/-/g, '');
  return `PO-${day}-${randomBytes(3).toString('hex').toUpperCase()}`;
};

/** Payout references (as Paystack echoes them back, any case). Withdrawals use po_… instead. */
export const isPayoutReference = (reference: unknown): reference is string =>
  typeof reference === 'string' && /^po-\d{8}-[0-9a-f]{6,}$/i.test(reference);

/* ---------------- Helpers ---------------- */

const num = (v: unknown): number => (v == null ? 0 : Number(v.toString()));
const round2 = (n: number) => Math.round(n * 100) / 100;
/** ₦802,750 (no kobo). */
const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

/** Orders that can go in a payout now (same rule as the seller's "Ready for payout"). */
const payableSql = Prisma.sql`
  o.payout_status = 'ready'
  AND o.payout_batch_id IS NULL
  AND o.payment_status = 'paid'
  AND o.fulfillment_status = 'delivered'
  AND o.seller_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM disputes d
    WHERE d.order_id = o.id AND (d.status IN ('open', 'investigating') OR d.outcome = 'refund')
  )`;

/** …and were last changed at or before `cutoff` (updated_at is the DB's local NOW(), see top). */
const readyBySql = (cutoff: Date) =>
  Prisma.sql`${payableSql} AND o.updated_at <= (${cutoff.toISOString()}::timestamptz)::timestamp`;

const readyWhere = (sellerId: string): Prisma.OrderWhereInput => ({
  sellerId,
  payoutStatus: 'ready',
  payoutBatchId: null,
  paymentStatus: 'paid',
  fulfillmentStatus: 'delivered',
  disputes: { none: { OR: [{ status: { in: ['open', 'investigating'] } }, { outcome: 'refund' }] } },
});

type SavedAccount = { bankCode: string; bankName: string; accountNumber: string; accountName: string };

const accountOf = (u: {
  payoutBankCode: string | null;
  payoutBankName: string | null;
  payoutAccountNumber: string | null;
  payoutAccountName: string | null;
}): SavedAccount | null =>
  u.payoutBankCode && u.payoutAccountNumber && u.payoutAccountName
    ? {
        bankCode: u.payoutBankCode,
        bankName: u.payoutBankName || u.payoutBankCode,
        accountNumber: u.payoutAccountNumber,
        accountName: u.payoutAccountName,
      }
    : null;

const payoutUserSelect = {
  id: true,
  isActive: true,
  twoFactorEnabled: true,
  businessName: true,
  payoutBankCode: true,
  payoutBankName: true,
  payoutAccountNumber: true,
  payoutAccountName: true,
  payoutsPausedUntil: true,
  sellerApplication: { select: { status: true, businessName: true } },
} as const;

type BlockedCode = 'PAYOUT_ACCOUNT_REQUIRED' | 'TWO_STEP_REQUIRED' | 'PAYOUTS_PAUSED';
export type PayoutBlock = { code: BlockedCode; message: string; resumes_at?: string };

/** Why this seller can't be paid at the next run, or null. */
export const blockedOf = (
  u: { twoFactorEnabled: boolean; payoutsPausedUntil: Date | null } & Parameters<typeof accountOf>[0],
  now = new Date()
): PayoutBlock | null => {
  if (!accountOf(u)) {
    return { code: 'PAYOUT_ACCOUNT_REQUIRED', message: 'Add your payout account so we can pay you. Your money waits here until then.' };
  }
  if (!u.twoFactorEnabled) {
    return { code: 'TWO_STEP_REQUIRED', message: 'Turn on 2-step sign-in so we can pay you. Your money waits here until then.' };
  }
  const pause = pauseOf(u.payoutsPausedUntil, now);
  if (pause) {
    return {
      code: 'PAYOUTS_PAUSED',
      message: `Payouts resume on ${lagosShortDate(pause.resumesAt)} — your payout account changed recently.`,
      resumes_at: pause.resumesAt.toISOString(),
    };
  }
  return null;
};

/** For one seller (the order screen): why they can't be paid yet, or null. */
export const payoutBlockFor = async (sellerId: string, now = new Date()): Promise<PayoutBlock | null> => {
  const u = await prisma.user.findUnique({ where: { id: sellerId }, select: payoutUserSelect });
  return u ? blockedOf(u, now) : null;
};

/* ---------------- The 6 pm run ---------------- */

/** One seller's batch for the run at `slot`, or null when nothing was due. */
const batchSeller = async (sellerId: string, slot: Date, live: boolean) => {
  const seller = await prisma.user.findUnique({ where: { id: sellerId }, select: payoutUserSelect });
  if (!seller || seller.isActive === false) return { skipped: 'inactive' as const };
  const account = accountOf(seller);
  if (!account) return { skipped: 'no_account' as const };
  if (!seller.twoFactorEnabled) return { skipped: 'no_two_step' as const };
  if (pausedForSlot(seller.payoutsPausedUntil, slot)) return { skipped: 'paused' as const };
  // Our team paused this seller's listings: payouts wait until they're restored.
  const held = await prisma.accountRestriction.findFirst({
    where: { userId: sellerId, kind: 'pause_listings', status: 'active' },
    select: { id: true },
  });
  if (held) return { skipped: 'held' as const };

  const batch = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${BATCH_LOCK_KEY})`);
    const orders = await tx.$queryRaw<Array<{ id: string; order_number: string; seller_payout: unknown }>>`
      SELECT o.id, o.order_number, o.seller_payout FROM orders o
      WHERE o.seller_id = ${sellerId}::uuid AND ${readyBySql(slot)}
      ORDER BY o.created_at
      FOR UPDATE OF o`;
    if (!orders.length) return null;
    const gross = round2(orders.reduce((sum, o) => sum + num(o.seller_payout), 0));
    if (gross <= 0) return null;

    // Charges come off, oldest first, each only while something is left to send. The rest carry.
    const pending = await tx.sellerCharge.findMany({
      where: { sellerId, status: 'pending', payoutId: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, amount: true },
    });
    let amount = gross;
    const taken: string[] = [];
    for (const c of pending) {
      const charge = round2(num(c.amount));
      if (charge > 0 && charge < amount) {
        amount = round2(amount - charge);
        taken.push(c.id);
      }
    }

    const created = await tx.sellerPayout.create({
      data: {
        sellerId,
        amount,
        chargesTotal: round2(gross - amount),
        orderCount: orders.length,
        status: 'sending',
        scheduledFor: slot,
        reference: newReference(slot),
        transferCode: live ? QUEUED : null,
        bankName: account.bankName,
        accountLast4: account.accountNumber.slice(-4),
        accountName: account.accountName,
        createdAt: new Date(),
      },
    });
    const claimed = await tx.order.updateMany({
      where: { id: { in: orders.map(o => o.id) }, payoutStatus: 'ready', payoutBatchId: null },
      data: { payoutStatus: 'sending', payoutBatchId: created.id },
    });
    if (claimed.count !== orders.length) throw new Error(`Orders changed while making payout for ${sellerId}`);
    if (taken.length) {
      const applied = await tx.sellerCharge.updateMany({
        where: { id: { in: taken }, status: 'pending', payoutId: null },
        data: { status: 'applied', payoutId: created.id, appliedAt: new Date() },
      });
      if (applied.count !== taken.length) throw new Error(`Charges changed while making payout for ${sellerId}`);
    }
    return created;
  });
  if (!batch) return { skipped: 'nothing_due' as const };
  logger.info(
    `Payout ${batch.reference}: ${naira(num(batch.amount))} for ${batch.orderCount} order(s) to ${batch.bankName} ••••${batch.accountLast4} (${live ? 'Paystack' : 'by hand'})`
  );
  return { batch };
};

let running = false;

export type PayoutRunResult = {
  slot: string;
  created: Array<{ id: string; reference: string; seller_id: string; amount: number; order_count: number }>;
  skipped: Record<string, number>;
  sent: number;
};

/**
 * The 6 pm run (job, every tick). `now` can be injected to test it. Makes the batches that are
 * due, then (payouts live) starts their transfers and checks on ones that got stuck.
 */
export const runDuePayouts = async (
  now = new Date(),
  /** Testing: only these sellers. */
  only?: { sellerIds: string[] }
): Promise<PayoutRunResult | null> => {
  if (running) return null;
  running = true;
  try {
    const slot = lastPayoutTime(now);
    const live = walletService.sellerPayoutsLive();
    const result: PayoutRunResult = { slot: slot.toISOString(), created: [], skipped: {}, sent: 0 };

    // Sellers with something due. Those who can't be paid yet are counted, not looked up each tick.
    const sellers = await prisma.$queryRaw<
      Array<{ seller_id: string; active: boolean; has_account: boolean; two_step: boolean; paused: boolean; held: boolean }>
    >`
      SELECT DISTINCT o.seller_id,
        COALESCE(u.is_active, true) AS active,
        (u.payout_bank_code IS NOT NULL AND u.payout_account_number IS NOT NULL AND u.payout_account_name IS NOT NULL) AS has_account,
        COALESCE(u.two_factor_enabled, false) AS two_step,
        COALESCE(u.payouts_paused_until > (${slot.toISOString()}::timestamptz AT TIME ZONE 'UTC'), false) AS paused,
        EXISTS (SELECT 1 FROM account_restrictions ar WHERE ar.user_id = u.id AND ar.kind = 'pause_listings' AND ar.status = 'active') AS held
      FROM orders o JOIN users u ON u.id = o.seller_id
      WHERE ${readyBySql(slot)}
      ${only ? Prisma.sql`AND o.seller_id = ANY(${only.sellerIds}::uuid[])` : Prisma.empty}`;
    for (const { seller_id, active, has_account, two_step, paused, held } of sellers) {
      const skip = !active
        ? 'inactive'
        : held
          ? 'held'
          : !has_account
            ? 'no_account'
            : !two_step
              ? 'no_two_step'
              : paused
                ? 'paused'
                : null;
      if (skip) {
        result.skipped[skip] = (result.skipped[skip] ?? 0) + 1;
        continue;
      }
      try {
        const r = await batchSeller(seller_id, slot, live);
        if ('batch' in r && r.batch) {
          result.created.push({
            id: r.batch.id,
            reference: r.batch.reference,
            seller_id,
            amount: num(r.batch.amount),
            order_count: r.batch.orderCount,
          });
        } else if ('skipped' in r) {
          result.skipped[r.skipped] = (result.skipped[r.skipped] ?? 0) + 1;
        }
      } catch (error) {
        logger.error(`Payout run failed for seller ${seller_id}:`, error);
      }
    }

    if (live) result.sent = await sendQueuedTransfers(now);
    return result;
  } finally {
    running = false;
  }
};

/* ---------------- Sending (payouts live) ---------------- */

/** Start the Paystack transfers for queued batches, and check on stuck ones. */
const sendQueuedTransfers = async (now: Date): Promise<number> => {
  const queued = await prisma.sellerPayout.findMany({
    where: { status: 'sending', transferCode: QUEUED },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });
  let sent = 0;
  for (const b of queued) {
    if (await sendTransfer(b.id).catch(e => (logger.error(`Payout transfer ${b.id} failed to start:`, e), false))) sent += 1;
  }

  const stuck = await prisma.sellerPayout.findMany({
    where: { status: 'sending', transferCode: STARTING, updatedAt: { lt: new Date(now.getTime() - STUCK_MS) } },
    select: { id: true, reference: true },
    take: 20,
  });
  for (const b of stuck) {
    const state = await walletService.lookUpTransfer(b.reference.toLowerCase());
    if (state === null) {
      // Paystack never got it: send it again on the next tick.
      await prisma.sellerPayout.updateMany({ where: { id: b.id, transferCode: STARTING }, data: { transferCode: QUEUED } });
    } else if (state === 'success') {
      await settlePayout(b.reference, 'paid');
    } else if (state === 'failed' || state === 'reversed') {
      await settlePayout(b.reference, 'failed', { reason: `Paystack says the transfer ${state}.` });
    }
  }
  return sent;
};

/** One batch → one Paystack transfer to the seller's saved account. true when Paystack took it. */
const sendTransfer = async (batchId: string): Promise<boolean> => {
  // Claim it so only one sender (and no "Mark paid by hand") can have it.
  const claimed = await prisma.sellerPayout.updateMany({
    where: { id: batchId, status: 'sending', transferCode: QUEUED },
    data: { transferCode: STARTING },
  });
  if (claimed.count !== 1) return false;

  const batch = await prisma.sellerPayout.findUniqueOrThrow({
    where: { id: batchId },
    include: { seller: { select: payoutUserSelect } },
  });
  const account = accountOf(batch.seller);
  if (!account || !batch.seller.twoFactorEnabled) {
    await settlePayout(batch.reference, 'failed', {
      reason: !account ? 'No payout account to send to.' : '2-step sign-in is off.',
    });
    return false;
  }
  const changed = account.accountNumber.slice(-4) !== batch.accountLast4 || account.bankName !== batch.bankName;
  // Changed since 6 pm and payouts are paused for it: don't send to the new account yet.
  if (changed && pauseOf(batch.seller.payoutsPausedUntil)) {
    await settlePayout(batch.reference, 'failed', {
      reason: 'The payout account changed after this payout was made. Payouts are paused for safety.',
    });
    return false;
  }
  // The seller changed their account since 6 pm: send to the one saved now, and say so.
  if (changed) {
    await prisma.sellerPayout.update({
      where: { id: batchId },
      data: { bankName: account.bankName, accountLast4: account.accountNumber.slice(-4), accountName: account.accountName },
    });
  }

  const amount = round2(num(batch.amount));
  try {
    const { recipient_code } = await paystackService.createTransferRecipient(
      account.accountName,
      account.accountNumber,
      account.bankCode
    );
    const transfer = await paystackService.initiateTransfer(
      recipient_code,
      amount,
      batch.reference.toLowerCase(),
      `Gadgets Bidding payout ${batch.reference}`
    );
    await prisma.sellerPayout.updateMany({
      where: { id: batchId, status: 'sending', transferCode: STARTING },
      data: { transferCode: transfer.transfer_code || STARTING },
    });
    logger.info(`Payout ${batch.reference} sent to Paystack (${transfer.transfer_code})`);
    return true;
  } catch (error) {
    const message = (error as Error).message || 'Paystack refused the transfer';
    logger.error(`Payout ${batch.reference} not started: ${message}`);
    const state = await walletService.lookUpTransfer(batch.reference.toLowerCase());
    if (state === null || state === 'failed' || state === 'reversed') {
      await settlePayout(batch.reference, 'failed', { reason: message });
    }
    // Otherwise Paystack has it (or we can't tell): leave it "starting" for the webhook or the stuck check.
    return false;
  }
};

/* ---------------- Settling ---------------- */

type SettleInfo = {
  reason?: string;
  transferCode?: string;
  /** Our team marked it by hand. */
  markedById?: string;
  /** transfer.reversed can arrive after transfer.success: the money came back. */
  reversed?: boolean;
};

/**
 * Finish a payout: paid (orders paid) or failed (orders back to ready for the next 6 pm).
 * Safe to call again: only the first call for a payout that's still sending (or, for a reversal,
 * paid) does anything. Tells the seller.
 */
export const settlePayout = async (
  reference: string,
  outcome: 'paid' | 'failed',
  info: SettleInfo = {}
): Promise<{ settled: boolean; payout_id: string | null }> => {
  const ref = reference.toUpperCase();
  const result = await prisma.$transaction(async tx => {
    const batch = await tx.sellerPayout.findUnique({ where: { reference: ref } });
    if (!batch) return null;
    const at = new Date();

    if (outcome === 'paid') {
      const claimed = await tx.sellerPayout.updateMany({
        where: { id: batch.id, status: 'sending' },
        data: {
          status: 'paid',
          paidAt: at,
          failureReason: null,
          ...(info.transferCode ? { transferCode: info.transferCode } : {}),
          ...(info.markedById ? { markedById: info.markedById } : {}),
        },
      });
      if (claimed.count !== 1) return { batch, settled: false };
      // Every order in it is paid, whatever happened to it since 6 pm (the money went).
      await tx.order.updateMany({
        where: { payoutBatchId: batch.id },
        data: { payoutStatus: 'paid', payoutPaidAt: at, payoutReference: batch.reference },
      });
      return { batch, settled: true };
    }

    const claimed = await tx.sellerPayout.updateMany({
      where: { id: batch.id, status: { in: info.reversed ? ['sending', 'paid'] : ['sending'] } },
      data: {
        status: 'failed',
        failureReason: (info.reason || "The bank didn't accept the transfer.").slice(0, 500),
        paidAt: null,
        ...(info.markedById ? { markedById: info.markedById } : {}),
      },
    });
    if (claimed.count !== 1) return { batch, settled: false };
    // Back to ready (held ones stay held) and out of the batch, so the next 6 pm run takes them.
    await tx.order.updateMany({
      where: { payoutBatchId: batch.id, payoutStatus: { not: 'held' } },
      data: { payoutStatus: 'ready', payoutBatchId: null, payoutPaidAt: null, payoutReference: null },
    });
    await tx.order.updateMany({ where: { payoutBatchId: batch.id }, data: { payoutBatchId: null } });
    // The charges weren't collected: they come off the next payout instead.
    await tx.sellerCharge.updateMany({
      where: { payoutId: batch.id, status: 'applied' },
      data: { status: 'pending', payoutId: null, appliedAt: null },
    });
    return { batch, settled: true };
  });

  if (!result) {
    logger.warn(`Payout ${ref} not found to settle (${outcome})`);
    return { settled: false, payout_id: null };
  }
  if (!result.settled) return { settled: false, payout_id: result.batch.id };

  const b = result.batch;
  const where = `${b.bankName ?? 'your bank'} ••••${b.accountLast4 ?? ''}`.trim();
  const amount = naira(num(b.amount));
  logger.info(`Payout ${b.reference} settled: ${outcome}${info.reason ? ` (${info.reason})` : ''}`);
  createNotification(
    b.sellerId,
    'system',
    outcome === 'paid' ? `Payout sent: ${amount}` : "Payout didn't go through",
    outcome === 'paid'
      ? `${b.orderCount} order${b.orderCount === 1 ? '' : 's'} · to your ${b.bankName ?? 'bank'} account ending ${b.accountLast4 ?? ''}.`
      : `We couldn't send ${amount} to ${where}. We'll try again at 6:00 pm tomorrow. Check your payout account is right.`,
    {
      kind: 'payout',
      payout_id: b.id,
      reference: b.reference,
      status: outcome,
      amount: num(b.amount),
      order_count: b.orderCount,
    },
    ['push', 'email']
  ).catch(e => logger.error(`Payout ${b.reference} notification failed:`, e));

  return { settled: true, payout_id: b.id };
};

/** Paystack transfer.success / transfer.failed / transfer.reversed for a payout (PO-… reference). */
export const settleFromTransferEvent = async (
  event: 'transfer.success' | 'transfer.failed' | 'transfer.reversed',
  data: Record<string, unknown>
) => {
  const reference = String(data.reference || '');
  const transferCode = typeof data.transfer_code === 'string' ? data.transfer_code : undefined;
  if (event === 'transfer.success') {
    const batch = await prisma.sellerPayout.findUnique({ where: { reference: reference.toUpperCase() }, select: { amount: true } });
    const paid = num(data.amount) / 100;
    if (batch && Math.abs(paid - num(batch.amount)) > 0.01) {
      logger.error(`Payout ${reference}: Paystack paid ₦${paid}, payout is ₦${num(batch.amount)}`);
    }
    return settlePayout(reference, 'paid', { transferCode });
  }
  const detail = [data.gateway_response, data.message].find(v => typeof v === 'string' && v.trim()) as string | undefined;
  return settlePayout(reference, 'failed', {
    reason: event === 'transfer.reversed' ? `The bank sent it back.${detail ? ` ${detail}` : ''}` : detail || "The bank didn't accept the transfer.",
    reversed: event === 'transfer.reversed',
  });
};

/* ---------------- Seller: GET /seller/payouts ---------------- */

export type PayoutHistoryRow = {
  id: string | null;
  at: string;
  order_count: number;
  first_order_number: string | null;
  amount: number;
  status: 'scheduled' | 'sending' | 'paid' | 'failed';
};

export type SellerPayoutSummary = {
  ready: number;
  ready_orders: number;
  in_escrow: number;
  next_payout_at: string | null;
  automatic: boolean;
  blocked: PayoutBlock | null;
  payout_account: null | {
    bank_name: string;
    account_number_last4: string;
    account_name: string;
    matches_business_name: boolean;
  };
  history: PayoutHistoryRow[];
  legacy_balance: number;
};

const HISTORY_LIMIT = 30;

/** The name the payout account has to be in: the approved application's, else the account's. */
const businessNameOf = (u: { businessName: string | null; sellerApplication: { status: string; businessName: string | null } | null }) =>
  (u.sellerApplication?.status === 'approved' ? u.sellerApplication.businessName?.trim() : null) ||
  u.businessName?.trim() ||
  u.sellerApplication?.businessName?.trim() ||
  null;

export const getSellerSummary = async (sellerId: string, now = new Date()): Promise<SellerPayoutSummary> => {
  const seller = await prisma.user.findUnique({ where: { id: sellerId }, select: payoutUserSelect });
  if (!seller) throw new PayoutError('Account not found', 404);

  const todayRun = sixPmLagos(now);
  const [ready, escrow, firstReady, dueNow, batches, legacy] = await Promise.all([
    prisma.order.aggregate({ where: readyWhere(sellerId), _sum: { sellerPayout: true }, _count: true }),
    prisma.order.aggregate({
      where: {
        sellerId,
        paymentStatus: 'paid',
        fulfillmentStatus: { not: 'cancelled' },
        payoutStatus: { in: ['pending', 'held'] },
      },
      _sum: { sellerPayout: true },
    }),
    prisma.order.findFirst({ where: readyWhere(sellerId), orderBy: { createdAt: 'asc' }, select: { orderNumber: true } }),
    // After 6 pm, orders that were ready by 6 pm but aren't in a payout yet go within a minute.
    now >= todayRun
      ? prisma.$queryRaw<Array<{ n: number }>>`
          SELECT COUNT(*)::int AS n FROM orders o WHERE o.seller_id = ${sellerId}::uuid AND ${readyBySql(todayRun)}`
      : Promise.resolve([{ n: 0 }]),
    prisma.sellerPayout.findMany({
      where: { sellerId },
      orderBy: [{ scheduledFor: 'desc' }, { createdAt: 'desc' }],
      take: HISTORY_LIMIT,
      include: { orders: { select: { orderNumber: true }, orderBy: { createdAt: 'asc' }, take: 1 } },
    }),
    walletService.getAvailableBalance(sellerId).catch(() => 0),
  ]);

  const readyAmount = round2(num(ready._sum.sellerPayout));
  const blocked = blockedOf(seller, now);
  const account = accountOf(seller);
  const business = businessNameOf(seller);
  // Paused after an account change: it goes at the first 6 pm after the pause.
  const nextAt =
    readyAmount > 0 && !blocked
      ? now >= todayRun && (dueNow[0]?.n ?? 0) > 0
        ? todayRun
        : nextPayoutTime(now)
      : readyAmount > 0 && blocked?.code === 'PAYOUTS_PAUSED' && blocked.resumes_at
        ? new Date(blocked.resumes_at)
        : null;

  const history: PayoutHistoryRow[] = [];
  if (nextAt) {
    history.push({
      id: null,
      at: nextAt.toISOString(),
      order_count: ready._count,
      first_order_number: firstReady?.orderNumber ?? null,
      amount: readyAmount,
      status: 'scheduled',
    });
  }
  for (const b of batches) {
    history.push({
      id: b.id,
      at: (b.status === 'paid' && b.paidAt ? b.paidAt : b.scheduledFor).toISOString(),
      order_count: b.orderCount,
      first_order_number: b.orders[0]?.orderNumber ?? null,
      amount: round2(num(b.amount)),
      status: b.status as PayoutHistoryRow['status'],
    });
  }

  return {
    ready: readyAmount,
    ready_orders: ready._count,
    in_escrow: round2(num(escrow._sum.sellerPayout)),
    next_payout_at: nextAt?.toISOString() ?? null,
    automatic: walletService.sellerPayoutsLive(),
    blocked,
    payout_account: account
      ? {
          bank_name: account.bankName,
          account_number_last4: account.accountNumber.slice(-4),
          account_name: account.accountName,
          matches_business_name: business ? namesMatch(account.accountName, business) : false,
        }
      : null,
    history,
    legacy_balance: Math.max(0, round2(legacy)),
  };
};

/* ---------------- Seller: GET /seller/payouts/:id ---------------- */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Paystack's TRF_… code, or the bank reference our team typed when they marked it paid. */
const bankReferenceOf = (code: string | null) => (code && code !== QUEUED && code !== STARTING ? code : null);

export type SellerPayoutDetail = {
  id: string;
  reference: string;
  status: 'sending' | 'paid' | 'failed';
  amount: number;
  /** When the money went (paid only). */
  sent_at: string | null;
  /** The 6 pm run it was made in. */
  scheduled_for: string;
  /** true: Paystack sends it. false: our team sends it by hand. */
  automatic: boolean;
  failure_reason: string | null;
  to: { bank_name: string | null; account_last4: string | null; account_name: string | null };
  bank_reference: string | null;
  order_count: number;
  orders: Array<{
    id: string;
    order_number: string;
    title: string;
    image: string | null;
    sold_for: number;
    platform_fee: number;
    payout: number;
  }>;
  charges: Array<{ id: string; reason: string; amount: number; order_number: string | null }>;
  totals: { sales: number; platform_fees: number; charges: number; paid_to_you: number };
};

const loadSellerPayout = async (sellerId: string, id: string) => {
  if (!UUID.test(id)) throw new PayoutError('Payout not found', 404);
  const b = await prisma.sellerPayout.findFirst({
    where: { id, sellerId },
    include: {
      orders: {
        select: {
          id: true,
          orderNumber: true,
          totalAmount: true,
          deliveryFee: true,
          platformFee: true,
          sellerPayout: true,
          auction: { select: { gadget: { select: { title: true, images: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      },
      charges: {
        where: { status: 'applied' },
        select: { id: true, amount: true, reason: true, order: { select: { orderNumber: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!b) throw new PayoutError('Payout not found', 404);
  return b;
};

export const getSellerPayout = async (sellerId: string, id: string): Promise<SellerPayoutDetail> => {
  const b = await loadSellerPayout(sellerId, id);
  const orders = b.orders.map(o => ({
    id: o.id,
    order_number: o.orderNumber,
    title: o.auction?.gadget?.title ?? 'Gadget',
    image: o.auction?.gadget?.images?.[0] ?? null,
    sold_for: round2(num(o.totalAmount) - num(o.deliveryFee)),
    platform_fee: round2(num(o.platformFee)),
    payout: round2(num(o.sellerPayout)),
  }));
  const charges = b.charges.map(c => ({
    id: c.id,
    reason: c.reason,
    amount: round2(num(c.amount)),
    order_number: c.order?.orderNumber ?? null,
  }));
  const status = b.status as SellerPayoutDetail['status'];
  return {
    id: b.id,
    reference: b.reference,
    status,
    amount: round2(num(b.amount)),
    sent_at: status === 'paid' && b.paidAt ? b.paidAt.toISOString() : null,
    scheduled_for: b.scheduledFor.toISOString(),
    automatic: b.transferCode !== null && !b.markedById,
    failure_reason: status === 'failed' ? b.failureReason : null,
    to: { bank_name: b.bankName, account_last4: b.accountLast4, account_name: b.accountName },
    bank_reference: status === 'paid' ? bankReferenceOf(b.transferCode) : null,
    order_count: b.orderCount,
    orders,
    charges,
    totals: {
      sales: round2(orders.reduce((sum, o) => sum + o.sold_for, 0)),
      platform_fees: round2(orders.reduce((sum, o) => sum + o.platform_fee, 0)),
      charges: round2(num(b.chargesTotal)),
      paid_to_you: round2(num(b.amount)),
    },
  };
};

/* ---------------- Seller: POST /seller/payouts/:id/statement ---------------- */

/** One statement email per payout a minute (it goes to the account's own email only). */
const STATEMENT_GAP_MS = 60_000;
const lastStatement = new Map<string, number>();

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

/** "s•••@example.com" */
const maskEmail = (email: string) => {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 1)}•••@${domain ?? ''}`;
};

const STATUS_WORD: Record<SellerPayoutDetail['status'], string> = {
  paid: 'Paid',
  sending: 'Sending',
  failed: "Didn't go through",
};

/** A plain statement: design guide emails (680 wide, one heading, plain money tables, no glass). */
const statementHtml = (d: SellerPayoutDetail, business: string | null) => {
  const INK = '#1C1F2A';
  const SLATE = '#5C6273';
  const MUTED = '#7C8293';
  const LINE = '#EDEFF4';
  const row = (label: string, value: string, opts: { strong?: boolean; sub?: string } = {}) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid ${LINE};color:${opts.strong ? INK : SLATE};font-size:14px;">
        ${label}${opts.sub ? `<div style="color:${MUTED};font-size:12px;margin-top:2px;">${opts.sub}</div>` : ''}
      </td>
      <td style="padding:12px 0;border-bottom:1px solid ${LINE};color:${INK};font-size:${opts.strong ? 16 : 14}px;font-weight:${opts.strong ? 600 : 500};text-align:right;white-space:nowrap;">${value}</td>
    </tr>`;
  const table = (rows: string) =>
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 20px;">${rows}</table>`;
  const to = [d.to.bank_name, d.to.account_last4 ? `••••${d.to.account_last4}` : null].filter(Boolean).join(' · ');
  const when = d.sent_at ? `Sent ${lagosDateTime(new Date(d.sent_at))}` : `Made ${lagosDateTime(new Date(d.scheduled_for))}`;

  const facts = table(
    [
      row('Status', STATUS_WORD[d.status]),
      to ? row('To', escapeHtml(to)) : '',
      d.to.account_name ? row('Account name', escapeHtml(d.to.account_name)) : '',
      row('Reference', escapeHtml(d.reference)),
      d.bank_reference ? row('Bank reference', escapeHtml(d.bank_reference)) : '',
    ].join('')
  );
  const orders = d.orders.length
    ? `<div style="color:${MUTED};font-size:12px;letter-spacing:.04em;text-transform:uppercase;margin:8px 0 4px;">Orders in this payout</div>` +
      table(
        d.orders
          .map(o =>
            row(
              escapeHtml(o.title),
              naira(o.payout),
              { sub: `${escapeHtml(o.order_number)} · Sold ${naira(o.sold_for)} · fee −${naira(o.platform_fee)}` }
            )
          )
          .join('')
      )
    : '';
  const charges = d.charges.length
    ? `<div style="color:${MUTED};font-size:12px;letter-spacing:.04em;text-transform:uppercase;margin:8px 0 4px;">Charges</div>` +
      table(d.charges.map(c => row(escapeHtml(c.reason), `−${naira(c.amount)}`, { sub: c.order_number ? escapeHtml(c.order_number) : undefined })).join(''))
    : '';
  const totals = table(
    [
      d.orders.length ? row('Sales', naira(d.totals.sales)) : '',
      d.orders.length ? row('Platform fees', `−${naira(d.totals.platform_fees)}`) : '',
      d.totals.charges > 0 ? row('Charges', `−${naira(d.totals.charges)}`) : '',
      row(d.status === 'paid' ? 'Paid to you' : 'Amount', naira(d.totals.paid_to_you), { strong: true }),
    ].join('')
  );

  return `
  <div style="background:#F6F7FA;padding:32px 0;">
    <div style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;max-width:680px;margin:0 auto;background:#FFFFFF;border-radius:18px;padding:32px;">
      <div style="font-size:17px;font-weight:600;color:${INK};margin-bottom:24px;">Gadgets Bidding</div>
      <h1 style="font-size:22px;font-weight:600;color:${INK};margin:0 0 8px;">Payout ${escapeHtml(d.reference)}: ${naira(d.amount)}</h1>
      <p style="color:${SLATE};font-size:15px;line-height:1.6;margin:0 0 20px;">${when}${business ? ` · ${escapeHtml(business)}` : ''}</p>
      ${facts}${orders}${charges}${totals}
      <p style="color:${SLATE};font-size:14px;line-height:1.6;margin:0;">Not showing in your bank after 24 hours? Give your bank the reference above.</p>
      <p style="color:${MUTED};font-size:12px;line-height:1.6;margin:28px 0 0;border-top:1px solid ${LINE};padding-top:16px;">
        You're getting this because you asked for a statement of this payout in the Gadgets Bidding seller app. We'll never ask for your password or PIN by email.
      </p>
    </div>
  </div>`;
};

/** Email the seller a plain statement of one payout, to their account email. */
export const emailStatement = async (sellerId: string, id: string): Promise<{ sent_to: string }> => {
  const detail = await getSellerPayout(sellerId, id);
  const user = await prisma.user.findUnique({
    where: { id: sellerId },
    select: { email: true, businessName: true, sellerApplication: { select: { businessName: true } } },
  });
  const to = user?.email?.trim();
  if (!to) throw new PayoutError('Add an email address to your account first, then try again.', 409, 'EMAIL_REQUIRED');

  const key = `${sellerId}:${id}`;
  const last = lastStatement.get(key) ?? 0;
  if (Date.now() - last < STATEMENT_GAP_MS) {
    throw new PayoutError(`We just sent it to ${maskEmail(to)}. Check your inbox and spam folder.`, 429, 'STATEMENT_JUST_SENT');
  }
  lastStatement.set(key, Date.now());

  const business = user?.sellerApplication?.businessName?.trim() || user?.businessName?.trim() || null;
  const ok = await sendEmail({
    to,
    subject: `Payout ${detail.reference} statement: ${naira(detail.amount)}`,
    html: statementHtml(detail, business),
  });
  if (!ok) {
    lastStatement.delete(key);
    throw new PayoutError("We couldn't send the email just now. Try again in a few minutes.", 502, 'EMAIL_FAILED');
  }
  return { sent_to: maskEmail(to) };
};

/* ---------------- Our team: /admin/seller-payouts ---------------- */

export type TeamPayoutStatus = 'sending' | 'paid' | 'failed' | 'all';

const teamRow = (b: Prisma.SellerPayoutGetPayload<{ include: typeof teamInclude }>) => {
  const code = b.transferCode;
  const placeholder = code === QUEUED || code === STARTING;
  return {
    id: b.id,
    reference: b.reference,
    status: b.status as 'sending' | 'paid' | 'failed',
    amount: round2(num(b.amount)),
    order_count: b.orderCount,
    scheduled_for: b.scheduledFor.toISOString(),
    created_at: b.createdAt.toISOString(),
    paid_at: b.paidAt?.toISOString() ?? null,
    failure_reason: b.failureReason,
    /** Sent through Paystack (vs by hand). */
    via_paystack: code !== null && !b.markedById,
    /** While sending through Paystack: queued / starting / sent. */
    transfer_state:
      b.status !== 'sending' || code === null ? null : code === QUEUED ? 'queued' : code === STARTING ? 'starting' : 'sent',
    transfer_code: !placeholder && !b.markedById ? code : null,
    bank_reference: b.markedById && !placeholder ? code : null,
    marked_by: b.markedBy ? { id: b.markedBy.id, name: b.markedBy.fullName } : null,
    bank_name: b.bankName,
    account_last4: b.accountLast4,
    account_name: b.accountName,
    seller: {
      id: b.seller.id,
      code: sellerCode(b.seller.id),
      business_name: b.seller.businessName,
      name: b.seller.fullName,
      email: b.seller.email,
      phone: b.seller.phoneNumber?.startsWith('+9') ? null : b.seller.phoneNumber,
    },
    orders: b.orders.map(o => ({
      id: o.id,
      order_number: o.orderNumber,
      amount: round2(num(o.sellerPayout)),
      payout_status: o.payoutStatus,
      title: o.auction?.gadget?.title ?? null,
      open_case: o.disputes.length > 0,
    })),
  };
};

const teamInclude = {
  seller: { select: { id: true, fullName: true, businessName: true, email: true, phoneNumber: true } },
  markedBy: { select: { id: true, fullName: true } },
  orders: {
    select: {
      id: true,
      orderNumber: true,
      sellerPayout: true,
      payoutStatus: true,
      auction: { select: { gadget: { select: { title: true } } } },
      disputes: { where: { status: { in: ['open', 'investigating'] } }, select: { id: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.SellerPayoutInclude;

export type TeamPayoutRow = ReturnType<typeof teamRow>;

export const listForTeam = async (params: { status: TeamPayoutStatus; search?: string; page: number; limit: number }) => {
  const search = params.search?.trim();
  const where: Prisma.SellerPayoutWhereInput = {
    ...(params.status !== 'all' ? { status: params.status } : {}),
    ...(search
      ? {
          OR: [
            { reference: { contains: search, mode: 'insensitive' } },
            { accountName: { contains: search, mode: 'insensitive' } },
            { seller: { businessName: { contains: search, mode: 'insensitive' } } },
            { seller: { fullName: { contains: search, mode: 'insensitive' } } },
            { seller: { email: { contains: search, mode: 'insensitive' } } },
            { orders: { some: { orderNumber: { contains: search, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };
  const [rows, total, counts, sending] = await Promise.all([
    prisma.sellerPayout.findMany({
      where,
      include: teamInclude,
      // To send: oldest first. History: newest first.
      orderBy: params.status === 'sending' ? [{ scheduledFor: 'asc' }, { createdAt: 'asc' }] : [{ updatedAt: 'desc' }],
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
    prisma.sellerPayout.count({ where }),
    prisma.sellerPayout.groupBy({ by: ['status'], _count: true }),
    prisma.sellerPayout.aggregate({ where: { status: 'sending' }, _sum: { amount: true } }),
  ]);
  const count = (s: string) => counts.find(c => c.status === s)?._count ?? 0;
  return {
    items: rows.map(teamRow),
    total,
    counts: { sending: count('sending'), paid: count('paid'), failed: count('failed') },
    sending_amount: round2(num(sending._sum.amount)),
    automatic: walletService.sellerPayoutsLive(),
    next_run_at: nextPayoutTime().toISOString(),
  };
};

/**
 * Can our team settle this one by hand? Yes when it was never given to Paystack (payouts not live,
 * or still queued). If Paystack has it, only once Paystack agrees (so it can't be paid twice).
 */
const assertTeamCanSettle = async (id: string, outcome: 'paid' | 'failed') => {
  const batch = await prisma.sellerPayout.findUnique({ where: { id } });
  if (!batch) throw new PayoutError('Payout not found', 404);
  if (batch.status !== 'sending') {
    throw new PayoutError(
      batch.status === 'paid' ? 'This payout is already marked paid.' : 'This payout already failed. Its orders go in the next 6 pm payout.',
      409
    );
  }
  const code = batch.transferCode;
  if (code === null) return batch;
  if (code === QUEUED) {
    // Take it off the queue first, so the job can't start a transfer for it too.
    const taken = await prisma.sellerPayout.updateMany({ where: { id, status: 'sending', transferCode: QUEUED }, data: { transferCode: null } });
    if (taken.count === 1) return { ...batch, transferCode: null };
    throw new PayoutError('Paystack is starting this transfer right now. Check again in a few minutes.', 409);
  }
  if (code === STARTING) {
    throw new PayoutError('Paystack is starting this transfer right now. Check again in a few minutes.', 409);
  }
  const state = await walletService.lookUpTransfer(batch.reference.toLowerCase());
  const ok = outcome === 'paid' ? state === 'success' : state === null || state === 'failed' || state === 'reversed';
  if (!ok) {
    throw new PayoutError(
      `Paystack is handling this transfer (${state ?? 'not found'}). It updates by itself when the bank answers.`,
      409
    );
  }
  return batch;
};

export const markPaidByTeam = async (adminId: string, id: string, bankReference: string) => {
  const ref = bankReference.trim();
  if (ref.length < 4) throw new PayoutError('Enter the bank reference for the transfer you made.');
  const batch = await assertTeamCanSettle(id, 'paid');
  const r = await settlePayout(batch.reference, 'paid', {
    markedById: adminId,
    // Keep Paystack's code when there is one; otherwise record the bank's reference.
    transferCode: batch.transferCode ?? ref.slice(0, 100),
  });
  if (!r.settled) throw new PayoutError('This payout changed while you were looking at it. Refresh and try again.', 409);
  return getForTeam(id);
};

export const markFailedByTeam = async (adminId: string, id: string, reason: string) => {
  const why = reason.trim();
  if (why.length < 5) throw new PayoutError('Say why it didn’t go through (5+ characters).');
  const batch = await assertTeamCanSettle(id, 'failed');
  const r = await settlePayout(batch.reference, 'failed', { markedById: adminId, reason: why });
  if (!r.settled) throw new PayoutError('This payout changed while you were looking at it. Refresh and try again.', 409);
  return getForTeam(id);
};

export const getForTeam = async (id: string) => {
  const b = await prisma.sellerPayout.findUnique({ where: { id }, include: teamInclude });
  if (!b) throw new PayoutError('Payout not found', 404);
  return teamRow(b);
};
