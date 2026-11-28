import prisma from '../../config/prisma';
import { SELLER_POLICY } from '@gadget-bidding/shared';
import * as notificationService from '../notification/notification.service';
import { PAUSE_REASONS, type PauseReason } from '../admin/people.service';
import { failedSales, whyCantList, type FailedSale } from './listingGate.service';

/**
 * "New listings are paused" (seller app › Account). Two ways in:
 *  - automatic: SELLER_POLICY.failedSaleLimit failed sales in SELLER_POLICY.failedSaleWindowDays days. A failed
 *    sale is an item that failed the hub check and was refunded, or a case decided as a refund;
 *  - our team paused the seller's listings (Users › Pause listings).
 * The seller sees which sales counted and can ask our team to review it. Our team can lift the
 * automatic pause (users.listing_pause_cleared_at): failures up to that time stop counting.
 */

const DAY = 86_400_000;

export class ListingPauseError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

/** "3 items failed hub inspection in 90 days", worded for what actually happened. */
export const pausedSummary = (sales: FailedSale[]) => {
  const n = sales.length;
  const days = SELLER_POLICY.failedSaleWindowDays;
  const items = n === 1 ? 'item' : 'items';
  const hub = sales.filter(s => s.kind === 'hub_check').length;
  if (hub === n) return `${n} ${items} failed hub inspection in ${days} days`;
  if (hub === 0) return `${n} ${n === 1 ? 'sale was' : 'sales were'} refunded in ${days} days`;
  return `${n} ${items} failed hub inspection or were refunded in ${days} days`;
};

export type ListingPauseView = {
  paused: boolean;
  /** LISTINGS_PAUSED (failed sales) · PAUSED_BY_TEAM · null when listings aren't paused. */
  code: 'LISTINGS_PAUSED' | 'PAUSED_BY_TEAM' | null;
  /** The line under the title. */
  message: string | null;
  /** The sales that counted (automatic pause only). */
  failed: FailedSale[];
  limit: number;
  window_days: number;
  /** Team pause: why, and until when (null: until it's fixed). */
  team: { reason: string; until: string | null } | null;
  review_requested_at: string | null;
};

export const getListingPause = async (sellerId: string): Promise<ListingPauseView> => {
  const [block, user] = await Promise.all([
    whyCantList(sellerId),
    prisma.user.findUnique({ where: { id: sellerId }, select: { listingReviewRequestedAt: true } }),
  ]);
  const base = {
    limit: SELLER_POLICY.failedSaleLimit,
    window_days: SELLER_POLICY.failedSaleWindowDays,
    review_requested_at: user?.listingReviewRequestedAt?.toISOString() ?? null,
  };

  if (block?.code === 'PAUSED_BY_TEAM') {
    const r = await prisma.accountRestriction.findFirst({
      where: { userId: sellerId, kind: 'pause_listings', status: 'active' },
      select: { reason: true, until: true },
      orderBy: { createdAt: 'desc' },
    });
    const reason = r?.reason ? PAUSE_REASONS[r.reason as PauseReason]?.email ?? r.reason : null;
    const failed = r?.reason === 'failed_inspections' ? await failedSales(sellerId) : [];
    return {
      ...base,
      paused: true,
      code: 'PAUSED_BY_TEAM',
      message: reason
        ? `Our team paused new listings while we review your account. ${reason}`
        : 'Our team paused new listings while we review your account.',
      failed,
      team: { reason: reason ?? 'Paused by our team', until: r?.until?.toISOString() ?? null },
    };
  }

  if (block?.code === 'LISTINGS_PAUSED') {
    const failed = await failedSales(sellerId);
    return {
      ...base,
      paused: true,
      code: 'LISTINGS_PAUSED',
      message: `${pausedSummary(failed)}, so we’ve paused new listings while our team reviews your account.`,
      failed,
      team: null,
    };
  }

  return { ...base, paused: false, code: null, message: null, failed: [], team: null };
};

/** "Request a review": tells our team once a day at most; the time shows on the screen. */
export const requestListingReview = async (sellerId: string) => {
  const view = await getListingPause(sellerId);
  if (!view.paused) throw new ListingPauseError('Your listings aren’t paused.');
  const last = view.review_requested_at ? new Date(view.review_requested_at).getTime() : 0;
  if (Date.now() - last < DAY) return view;

  const now = new Date();
  const user = await prisma.user.update({
    where: { id: sellerId },
    data: { listingReviewRequestedAt: now },
    select: { businessName: true, fullName: true },
  });
  const name = user.businessName || user.fullName || 'A seller';
  notificationService
    .notifyAdmins(
      'system',
      `${name} asked for a listing review`,
      view.code === 'PAUSED_BY_TEAM'
        ? 'Their new listings are paused by our team. Look at the pause and restore them if it’s fixed.'
        : `${pausedSummary(view.failed)}. Look at what failed and lift the pause if it’s fair.`,
      { sellerId, route: `/sellers/${sellerId}` }
    )
    .catch(() => {});
  return { ...view, review_requested_at: now.toISOString() };
};

/** Our team lifts the automatic pause: the failures so far stop counting. */
export const liftAutomaticPause = async (sellerId: string) => {
  const u = await prisma.user.findUnique({ where: { id: sellerId }, select: { role: true } });
  if (!u || u.role !== 'seller') throw new ListingPauseError('Seller not found', 404);
  const count = (await failedSales(sellerId)).length;
  if (count < SELLER_POLICY.failedSaleLimit) throw new ListingPauseError('Their listings aren’t paused for failed sales.');
  const now = new Date();
  await prisma.user.update({ where: { id: sellerId }, data: { listingPauseClearedAt: now, listingReviewRequestedAt: null } });
  return { cleared_at: now.toISOString(), failed_cleared: count };
};
