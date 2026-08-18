import { Request, Response } from 'express';
import { query } from '../../config/database';
import { sendSuccess, sendError } from '../../utils/response';
import logger from '../../utils/logger';
import prisma from '../../config/prisma';

export const getDashboard = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const sellerId = req.user.user_id;

    const [
      gadgetStatsResult,
      auctionStatsResult,
      salesStatsResult,
      pendingGadgets,
      readyGadgets,
      rejectedGadgets,
    ] = await Promise.all([
      query(
        `SELECT
           COUNT(*)::int AS total_gadgets,
           COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_gadgets,
           COUNT(*) FILTER (
             WHERE status = 'approved'
               AND NOT EXISTS (
                 SELECT 1 FROM auctions a WHERE a.gadget_id = g.id
               )
           )::int AS ready_gadgets
         FROM gadgets g
         WHERE seller_id = $1`,
        [sellerId]
      ),
      query(
        `SELECT
           COUNT(*)::int AS total_auctions,
           COUNT(*) FILTER (WHERE status IN ('active', 'scheduled'))::int AS active_auctions
         FROM auctions
         WHERE seller_id = $1`,
        [sellerId]
      ),
      query(
        `SELECT COUNT(*)::int AS sold_orders
         FROM orders
         WHERE seller_id = $1
           AND (
             fulfillment_status = 'delivered'
             OR payment_status IN ('paid', 'completed')
           )`,
        [sellerId]
      ),
      query(
        `SELECT id, title, status, images, created_at
         FROM gadgets
         WHERE seller_id = $1 AND status = 'pending'
         ORDER BY created_at DESC
         LIMIT 6`,
        [sellerId]
      ),
      query(
        `SELECT g.id, g.title, g.status, g.images, g.created_at
         FROM gadgets g
         WHERE g.seller_id = $1
           AND g.status = 'approved'
           AND NOT EXISTS (
             SELECT 1 FROM auctions a WHERE a.gadget_id = g.id
           )
         ORDER BY g.created_at DESC
         LIMIT 6`,
        [sellerId]
      ),
      query(
        `SELECT id, title, status, images, rejection_reason, created_at
         FROM gadgets
         WHERE seller_id = $1 AND status = 'rejected'
         ORDER BY updated_at DESC
         LIMIT 6`,
        [sellerId]
      ),
    ]);

    sendSuccess(res, {
      stats: {
        total_gadgets: gadgetStatsResult[0]?.total_gadgets || 0,
        pending_gadgets: gadgetStatsResult[0]?.pending_gadgets || 0,
        ready_gadgets: gadgetStatsResult[0]?.ready_gadgets || 0,
        total_auctions: auctionStatsResult[0]?.total_auctions || 0,
        active_auctions: auctionStatsResult[0]?.active_auctions || 0,
        sold_orders: salesStatsResult[0]?.sold_orders || 0,
      },
      pending_gadgets: pendingGadgets,
      ready_gadgets: readyGadgets,
      rejected_gadgets: rejectedGadgets,
    });
  } catch (error: any) {
    logger.error('Get seller dashboard error:', error);
    sendError(res, error.message || 'Failed to get seller dashboard', 500);
  }
};

/**
 * Get the seller's KYB (business identity) status
 * GET /api/v1/seller/kyb
 */
export const getKybStatus = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.user_id },
      select: {
        businessName: true,
        cacNumber: true,
        sellerKybStatus: true,
        sellerKybRejectionReason: true,
      },
    });

    sendSuccess(res, {
      business_name: user?.businessName || null,
      cac_number: user?.cacNumber || null,
      status: user?.sellerKybStatus || 'not_started',
      rejection_reason: user?.sellerKybRejectionReason || null,
    });
  } catch (error: any) {
    logger.error('Get seller KYB status error:', error);
    sendError(res, error.message || 'Failed to get KYB status', 500);
  }
};

/**
 * Submit seller KYB (business identity) details for admin review.
 * This does NOT unlock listing creation by itself — an admin must approve
 * it first (see admin.controller.ts approveSellerKyb/rejectSellerKyb).
 * POST /api/v1/seller/kyb
 */
export const submitKyb = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }

    const { business_name, cac_number } = req.body;

    const user = await prisma.user.update({
      where: { id: req.user.user_id },
      data: {
        businessName: business_name,
        cacNumber: cac_number || null,
        sellerKybStatus: 'pending',
        sellerKybSubmittedAt: new Date(),
        sellerKybReviewedAt: null,
        sellerKybRejectionReason: null,
      },
      select: {
        businessName: true,
        cacNumber: true,
        sellerKybStatus: true,
        sellerKybRejectionReason: true,
      },
    });

    logger.info(`Seller KYB submitted for review: ${req.user.user_id}`);

    sendSuccess(res, {
      business_name: user.businessName,
      cac_number: user.cacNumber,
      status: user.sellerKybStatus,
      rejection_reason: user.sellerKybRejectionReason,
    });
  } catch (error: any) {
    logger.error('Submit seller KYB error:', error);
    sendError(res, error.message || 'Failed to submit KYB details', 500);
  }
};
