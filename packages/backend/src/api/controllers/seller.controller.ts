import { Request, Response } from 'express';
import { query } from '../../config/database';
import { sendSuccess, sendError } from '../../utils/response';
import logger from '../../utils/logger';
import prisma from '../../config/prisma';
import * as payoutAccountService from '../../services/seller/payoutAccount.service';

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
 * The seller's payout account (masked), or null.
 * GET /api/v1/seller/payout-account
 * → { data: { bank_code, bank_name, account_number_last4, account_name, added_at } | null,
 *     meta: { business_name, two_step_enabled, hold_days, change_resumes_at,
 *             payouts_paused_until, payouts_resume_at } }
 */
export const getPayoutAccount = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }
    const { account, ...meta } = await payoutAccountService.getPayoutAccount(req.user.user_id);
    res.status(200).json({ success: true, data: account, meta });
  } catch (error: any) {
    if (error instanceof payoutAccountService.PayoutAccountError) {
      return res.status(error.status).json({ success: false, error: error.message, code: error.code });
    }
    logger.error('Get payout account error:', error);
    sendError(res, "We couldn't load your payout account. Try again.", 500);
  }
};

/**
 * The name the bank has on an account, and whether it matches the business name. Saves nothing.
 * GET /api/v1/seller/payout-account/check?bank_code&account_number
 * → { bank_code, bank_name, account_name, matches, business_name }
 */
export const checkPayoutAccount = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }
    const result = await payoutAccountService.checkPayoutAccount(req.user.user_id, {
      bankCode: String(req.query.bank_code).trim(),
      accountNumber: String(req.query.account_number).trim(),
    });
    sendSuccess(res, result);
  } catch (error: any) {
    if (error instanceof payoutAccountService.PayoutAccountError) {
      return res.status(error.status).json({ success: false, error: error.message, code: error.code });
    }
    logger.error('Check payout account error:', error);
    sendError(res, "We couldn't check that account. Try again.", 500);
  }
};

/**
 * Add or change the payout account. Checks the password, resolves the name with the bank and
 * saves it only when it matches the registered business name. A change (not the first account)
 * pauses payouts for 7 days.
 * PUT /api/v1/seller/payout-account { bank_code, account_number, password }
 * → { bank_code, bank_name, account_number_last4, account_name, added_at, payouts_paused_until, payouts_resume_at }
 */
export const setPayoutAccount = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, 'User not authenticated', 401);
    }
    const account = await payoutAccountService.setPayoutAccount(
      req.user.user_id,
      {
        bankCode: String(req.body.bank_code).trim(),
        accountNumber: String(req.body.account_number).trim(),
        password: String(req.body.password),
      },
      req
    );
    sendSuccess(res, account, 'Payout account saved');
  } catch (error: any) {
    if (error instanceof payoutAccountService.PayoutAccountError) {
      return res.status(error.status).json({ success: false, error: error.message, code: error.code });
    }
    logger.error('Set payout account error:', error);
    sendError(res, "We couldn't save your payout account. Try again.", 500);
  }
};
