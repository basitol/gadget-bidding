import prisma from '../../config/prisma';
import { SELLER_POLICY } from '@gadget-bidding/shared';

/**
 * Can this seller send a new listing for review right now? One place for every rule
 * (seller agreement): verified, store not closed, not away, fewer than 3 refunded sales in
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

/** Refunded cases on this seller's sales in the last 90 days (each is a "failed sale"). */
export const failedSalesCount = (sellerId: string, now = new Date()) =>
  prisma.dispute.count({
    where: {
      outcome: 'refund',
      decidedAt: { gte: new Date(now.getTime() - SELLER_POLICY.failedSaleWindowDays * DAY) },
      order: { sellerId },
    },
  });

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
      message: `New listings are paused: ${failed} sales were refunded in the last ${SELLER_POLICY.failedSaleWindowDays} days. Our team will be in touch.`,
    };
  }
  return null;
};
