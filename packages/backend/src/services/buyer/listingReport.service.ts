import prisma from '../../config/prisma';
import logger from '../../utils/logger';
import * as notificationService from '../notification/notification.service';
import { recordAuditEventSafe } from '../audit/audit.service';
import { sellerCode } from './sellerSummary.service';

/**
 * Buyers flag a listing they think is stolen, fake or wrong. Reports are private: sellers
 * never learn who reported them. Our team reviews them from the admin "Listing reports" queue.
 */
export const REASONS = {
  stolen: 'It might be stolen',
  fake: 'It looks fake or copied',
  wrong_details: 'Details are wrong',
  other: 'Something else',
} as const;
export type ReportReason = keyof typeof REASONS;

export const reportListing = async (userId: string, auctionId: string, reason: string, details?: string | null) => {
  if (!(reason in REASONS)) throw new Error("Choose what's wrong");
  const a = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { id: true, sellerId: true, gadgetId: true, gadget: { select: { title: true } } },
  });
  if (!a) throw new Error('Listing not found');
  if (a.sellerId === userId) throw new Error("You can't report your own listing");

  let report;
  try {
    report = await prisma.listingReport.create({
      data: {
        auctionId,
        gadgetId: a.gadgetId,
        reporterId: userId,
        reason,
        details: details?.trim().slice(0, 1000) || null,
      },
    });
  } catch (e: any) {
    if (e?.code === 'P2002') throw new Error("You've already reported this listing. Our team is looking at it.");
    throw e;
  }

  recordAuditEventSafe({ userId, action: 'listing_reported', resourceType: 'auction', resourceId: auctionId, changes: { reason } });
  notificationService
    .notifyAdmins(
      'listing_reported',
      `Listing reported: ${REASONS[reason as ReportReason]}`,
      `${a.gadget?.title ?? 'A listing'} · seller ${a.sellerId ? sellerCode(a.sellerId) : 'unknown'}`,
      { auctionId, reportId: report.id, route: '/reports' }
    )
    .catch(err => logger.error('Listing report alert failed:', err));

  return { id: report.id, status: report.status };
};

/* ---------------- Our team ---------------- */

export const listReports = async (status: 'open' | 'actioned' | 'dismissed' | 'all' = 'open', page = 1, limit = 50) => {
  const where = status === 'all' ? {} : { status };
  const [rows, total] = await Promise.all([
    prisma.listingReport.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.listingReport.count({ where }),
  ]);
  const auctionIds = [...new Set(rows.map(r => r.auctionId))];
  const userIds = [...new Set(rows.flatMap(r => [r.reporterId, r.reviewedBy].filter(Boolean) as string[]))];
  const [auctions, users, counts] = await Promise.all([
    prisma.auction.findMany({
      where: { id: { in: auctionIds } },
      select: {
        id: true,
        status: true,
        currentPrice: true,
        endTime: true,
        sellerId: true,
        seller: { select: { fullName: true, email: true } },
        gadget: { select: { title: true, images: true } },
      },
    }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true } }),
    prisma.listingReport.groupBy({ by: ['auctionId'], where: { auctionId: { in: auctionIds } }, _count: true }),
  ]);
  const A = new Map(auctions.map(a => [a.id, a]));
  const U = new Map(users.map(u => [u.id, u]));
  const C = new Map(counts.map(c => [c.auctionId, c._count]));
  return {
    total,
    items: rows.map(r => {
      const a = A.get(r.auctionId);
      return {
        id: r.id,
        reason: r.reason,
        reason_label: REASONS[r.reason as ReportReason] ?? r.reason,
        details: r.details,
        status: r.status,
        resolution_note: r.resolutionNote,
        created_at: r.createdAt.toISOString(),
        reviewed_at: r.reviewedAt?.toISOString() ?? null,
        reviewed_by: r.reviewedBy ? U.get(r.reviewedBy)?.fullName ?? null : null,
        reports_on_listing: C.get(r.auctionId) ?? 1,
        reporter: { id: r.reporterId, name: U.get(r.reporterId)?.fullName ?? null, email: U.get(r.reporterId)?.email ?? null },
        auction: a
          ? {
              id: a.id,
              status: a.status,
              title: a.gadget?.title ?? 'Listing',
              image: a.gadget?.images?.[0] ?? null,
              current_price: Number(String(a.currentPrice)),
              end_time: a.endTime.toISOString(),
              seller: { id: a.sellerId, name: a.seller?.fullName ?? null, code: a.sellerId ? sellerCode(a.sellerId) : null },
            }
          : null,
      };
    }),
  };
};

export const resolveReport = async (adminId: string, reportId: string, status: 'actioned' | 'dismissed', note: string) => {
  if (status !== 'actioned' && status !== 'dismissed') throw new Error('Choose actioned or dismissed');
  const text = note.trim();
  if (text.length < 5) throw new Error('Add a short note about what you did (5 characters or more).');
  const updated = await prisma.listingReport.updateMany({
    where: { id: reportId, status: 'open' },
    data: { status, resolutionNote: text.slice(0, 1000), reviewedBy: adminId, reviewedAt: new Date() },
  });
  if (!updated.count) throw new Error('This report was already handled.');
  return prisma.listingReport.findUnique({ where: { id: reportId } });
};

export const openCount = () => prisma.listingReport.count({ where: { status: 'open' } });
