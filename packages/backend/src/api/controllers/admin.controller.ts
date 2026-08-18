import { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma';
import { BID_DEFAULT_PENALTY_AMOUNT } from '@gadget-bidding/shared';
import prisma from '../../config/prisma';
import { sendSuccess, sendError, sendPaginated } from '../../utils/response';
import logger from '../../utils/logger';
import * as gadgetService from '../../services/gadget/gadget.service';
import * as orderService from '../../services/order/order.service';
import * as auctionService from '../../services/auction/auction.service';
import * as supportService from '../../services/support/support.service';
import * as riskService from '../../services/risk/risk.service';

const toNumber = (value: unknown): number => {
  if (value == null) return 0;
  return parseFloat(String(value));
};

const parsePage = (req: Request) => {
  const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20,
  };
};

const audit = async (
  req: Request,
  action: string,
  resourceType: string,
  resourceId: string,
  changes?: Record<string, unknown>
) => {
  await prisma.auditLog
    .create({
      data: {
        userId: req.user!.user_id,
        action,
        resourceType,
        resourceId,
        changes: changes as any,
        userAgent: req.get('user-agent') || undefined,
      },
    })
    .catch(() => undefined);
};

/**
 * GET /api/v1/admin/stats
 */
export const getAdminStats = async (_req: Request, res: Response) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [
      pendingGadgets,
      approvedGadgets,
      rejectedGadgets,
      totalUsers,
      buyers,
      sellers,
      admins,
      activeUsers,
      totalOrders,
      pendingPaymentOrders,
      processingOrders,
      shippedOrders,
      deliveredOrders,
      paidAggregate,
      activeAuctions,
      scheduledAuctions,
      endedAuctions,
      openDisputes,
      missingShipping,
      recentUsers,
      paymentsSuccess,
      paymentsPending,
    ] = await Promise.all([
      prisma.gadget.count({ where: { status: 'pending' } }),
      prisma.gadget.count({ where: { status: 'approved' } }),
      prisma.gadget.count({ where: { status: 'rejected' } }),
      prisma.user.count(),
      prisma.user.count({ where: { role: 'bidder' } }),
      prisma.user.count({ where: { role: 'seller' } }),
      prisma.user.count({ where: { role: 'admin' } }),
      prisma.user.count({ where: { isActive: true } }),
      prisma.order.count(),
      prisma.order.count({ where: { paymentStatus: 'pending' } }),
      prisma.order.count({ where: { fulfillmentStatus: 'processing' } }),
      prisma.order.count({ where: { fulfillmentStatus: 'shipped' } }),
      prisma.order.count({ where: { fulfillmentStatus: 'delivered' } }),
      prisma.order.aggregate({
        where: { paymentStatus: 'paid' },
        _sum: { totalAmount: true, platformFee: true, sellerPayout: true },
        _count: true,
      }),
      prisma.auction.count({ where: { status: 'active' } }),
      prisma.auction.count({ where: { status: 'scheduled' } }),
      prisma.auction.count({ where: { status: 'ended' } }),
      prisma.dispute.count({ where: { status: 'open' } }),
      prisma.order.count({
        where: {
          paymentStatus: 'pending',
          shippingAddress: { equals: Prisma.DbNull },
        },
      }),
      prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.paymentTransaction.count({ where: { status: 'success' } }),
      prisma.paymentTransaction.count({ where: { status: 'pending' } }),
    ]);

    sendSuccess(res, {
      pending_gadgets: pendingGadgets,
      approved_gadgets: approvedGadgets,
      rejected_gadgets: rejectedGadgets,
      total_users: totalUsers,
      buyers,
      sellers,
      admins,
      active_users: activeUsers,
      new_users_7d: recentUsers,
      total_orders: totalOrders,
      pending_payment_orders: pendingPaymentOrders,
      processing_orders: processingOrders,
      shipped_orders: shippedOrders,
      delivered_orders: deliveredOrders,
      paid_orders: paidAggregate._count,
      gmv: toNumber(paidAggregate._sum.totalAmount),
      platform_fees: toNumber(paidAggregate._sum.platformFee),
      seller_payouts: toNumber(paidAggregate._sum.sellerPayout),
      active_auctions: activeAuctions,
      scheduled_auctions: scheduledAuctions,
      ended_auctions: endedAuctions,
      open_disputes: openDisputes,
      missing_shipping: missingShipping,
      payments_success: paymentsSuccess,
      payments_pending: paymentsPending,
    });
  } catch (error: any) {
    logger.error('Admin stats error:', error);
    sendError(res, error.message || 'Failed to load admin stats', 500);
  }
};

/**
 * GET /api/v1/admin/activity
 * Paginated mixed feed (supports infinite scroll on the dashboard).
 */
export const getActivity = async (req: Request, res: Response) => {
  try {
    const { page, limit } = parsePage(req);
    const skip = (page - 1) * limit;
    // Over-fetch enough from each stream to fill the requested window.
    const perSource = Math.min(80, skip + limit);

    const [
      orders,
      gadgets,
      auctions,
      disputes,
      payments,
      orderCount,
      gadgetCount,
      auctionCount,
      disputeCount,
      paymentCount,
    ] = await Promise.all([
      prisma.order.findMany({
        take: perSource,
        orderBy: { createdAt: 'desc' },
        include: {
          auction: { include: { gadget: { select: { title: true } } } },
          buyer: { select: { fullName: true } },
        },
      }),
      prisma.gadget.findMany({
        take: perSource,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          seller: { select: { fullName: true } },
        },
      }),
      prisma.auction.findMany({
        take: perSource,
        orderBy: { createdAt: 'desc' },
        include: {
          gadget: { select: { title: true } },
          seller: { select: { fullName: true } },
        },
      }),
      prisma.dispute.findMany({
        take: perSource,
        orderBy: { createdAt: 'desc' },
        include: {
          order: { select: { orderNumber: true } },
          raiser: { select: { fullName: true } },
        },
      }),
      prisma.paymentTransaction.findMany({
        take: perSource,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { fullName: true, phoneNumber: true } } },
      }),
      prisma.order.count(),
      prisma.gadget.count(),
      prisma.auction.count(),
      prisma.dispute.count(),
      prisma.paymentTransaction.count(),
    ]);

    const feed = [
      ...orders.map(o => ({
        id: `order-${o.id}`,
        type: 'order',
        title: `Order ${o.orderNumber}`,
        subtitle: o.auction?.gadget?.title || 'Gadget',
        meta: o.buyer?.fullName || '',
        status: o.paymentStatus,
        amount: toNumber(o.totalAmount),
        at: o.createdAt?.toISOString(),
      })),
      ...gadgets.map(g => ({
        id: `gadget-${g.id}`,
        type: 'gadget',
        title: g.title,
        subtitle: `Listing · ${g.status}`,
        meta: g.seller?.fullName || '',
        status: g.status,
        at: g.createdAt?.toISOString(),
      })),
      ...auctions.map(a => ({
        id: `auction-${a.id}`,
        type: 'auction',
        title: a.gadget?.title || 'Auction',
        subtitle: `Auction · ${a.status}`,
        meta: a.seller?.fullName || '',
        status: a.status,
        amount: toNumber(a.currentPrice),
        at: a.createdAt?.toISOString(),
      })),
      ...disputes.map(d => ({
        id: `dispute-${d.id}`,
        type: 'dispute',
        title: `Dispute on ${d.order?.orderNumber || 'order'}`,
        subtitle: d.disputeType,
        meta: d.raiser?.fullName || '',
        status: d.status,
        at: d.createdAt?.toISOString(),
      })),
      ...payments.map(p => ({
        id: `payment-${p.id}`,
        type: 'payment',
        title: `${p.paymentGateway} · ${p.status}`,
        subtitle: p.user?.fullName || p.user?.phoneNumber || 'User',
        meta: p.gatewayReference || '',
        status: p.status,
        amount: toNumber(p.amount),
        at: p.createdAt?.toISOString(),
      })),
    ].sort((a, b) => String(b.at).localeCompare(String(a.at)));

    const total = Math.min(
      orderCount + gadgetCount + auctionCount + disputeCount + paymentCount,
      feed.length + skip // lower bound when over-fetch is truncated
    );
    // Prefer true combined count for pagination controls.
    const combinedTotal =
      orderCount + gadgetCount + auctionCount + disputeCount + paymentCount;
    const pageItems = feed.slice(skip, skip + limit);

    sendPaginated(res, pageItems, page, limit, combinedTotal || total);
  } catch (error: any) {
    logger.error('Admin activity error:', error);
    sendError(res, error.message || 'Failed to load activity', 500);
  }
};

/**
 * GET /api/v1/admin/gadgets
 */
export const getGadgets = async (req: Request, res: Response) => {
  try {
    const { page, limit } = parsePage(req);
    const skip = (page - 1) * limit;
    const status = req.query.status as string | undefined;
    const search = (req.query.search as string | undefined)?.trim();

    const where: Prisma.GadgetWhereInput = {};
    if (status && status !== 'all') where.status = status;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        {
          seller: {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { phoneNumber: { contains: search } },
            ],
          },
        },
      ];
    }

    const [gadgets, total] = await Promise.all([
      prisma.gadget.findMany({
        where,
        include: {
          category: { select: { name: true, slug: true } },
          seller: {
            select: { id: true, fullName: true, phoneNumber: true },
          },
          auction: {
            select: { id: true, status: true, currentPrice: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.gadget.count({ where }),
    ]);

    sendPaginated(
      res,
      gadgets.map(g => ({
        id: g.id,
        title: g.title,
        description: g.description,
        brand: g.brand,
        model: g.model,
        condition: g.condition,
        images: g.images,
        status: g.status,
        rejection_reason: g.rejectionReason,
        created_at: g.createdAt?.toISOString(),
        updated_at: g.updatedAt?.toISOString(),
        category_name: g.category?.name,
        seller: g.seller
          ? {
              id: g.seller.id,
              full_name: g.seller.fullName,
              phone_number: g.seller.phoneNumber,
            }
          : null,
        auction: g.auction
          ? {
              id: g.auction.id,
              status: g.auction.status,
              current_price: toNumber(g.auction.currentPrice),
            }
          : null,
      })),
      page,
      limit,
      total
    );
  } catch (error: any) {
    logger.error('Admin gadgets error:', error);
    sendError(res, error.message || 'Failed to load gadgets', 500);
  }
};

/** @deprecated prefer getGadgets?status=pending */
export const getPendingGadgets = async (req: Request, res: Response) => {
  req.query.status = 'pending';
  return getGadgets(req, res);
};

export const approveGadget = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const gadget = await gadgetService.approveGadget(id);
    await audit(req, 'gadget_approve', 'gadget', id, {
      title: (gadget as any).title,
    });
    sendSuccess(res, gadget, 'Gadget approved');
  } catch (error: any) {
    logger.error('Admin approve gadget error:', error);
    sendError(res, error.message || 'Failed to approve gadget', 400);
  }
};

export const rejectGadget = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const reason = (req.body?.reason as string) || 'Does not meet guidelines';
    const gadget = await gadgetService.rejectGadget(id, reason);
    await audit(req, 'gadget_reject', 'gadget', id, { reason });
    sendSuccess(res, gadget, 'Gadget rejected');
  } catch (error: any) {
    logger.error('Admin reject gadget error:', error);
    sendError(res, error.message || 'Failed to reject gadget', 400);
  }
};

/**
 * GET /api/v1/admin/auctions
 */
export const getAuctions = async (req: Request, res: Response) => {
  try {
    const { page, limit } = parsePage(req);
    const skip = (page - 1) * limit;
    const status = req.query.status as string | undefined;
    const search = (req.query.search as string | undefined)?.trim();

    const where: Prisma.AuctionWhereInput = {};
    if (status && status !== 'all') where.status = status;
    if (search) {
      where.OR = [
        {
          gadget: { title: { contains: search, mode: 'insensitive' } },
        },
        {
          seller: {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { phoneNumber: { contains: search } },
            ],
          },
        },
      ];
    }

    const [auctions, total] = await Promise.all([
      prisma.auction.findMany({
        where,
        include: {
          gadget: {
            select: { id: true, title: true, images: true, condition: true },
          },
          seller: {
            select: { id: true, fullName: true, phoneNumber: true },
          },
          winner: {
            select: { id: true, fullName: true, phoneNumber: true },
          },
          order: {
            select: { id: true, orderNumber: true, paymentStatus: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auction.count({ where }),
    ]);

    sendPaginated(
      res,
      auctions.map(a => ({
        id: a.id,
        status: a.status,
        starting_price: toNumber(a.startingPrice),
        current_price: toNumber(a.currentPrice),
        reserve_price: toNumber(a.reservePrice),
        buy_now_price: a.buyNowPrice ? toNumber(a.buyNowPrice) : null,
        total_bids: a.totalBids || 0,
        start_time: a.startTime?.toISOString(),
        end_time: a.endTime?.toISOString(),
        created_at: a.createdAt?.toISOString(),
        gadget: a.gadget
          ? {
              id: a.gadget.id,
              title: a.gadget.title,
              image: a.gadget.images?.[0],
              condition: a.gadget.condition,
            }
          : null,
        seller: a.seller
          ? {
              id: a.seller.id,
              full_name: a.seller.fullName,
              phone_number: a.seller.phoneNumber,
            }
          : null,
        winner: a.winner
          ? {
              id: a.winner.id,
              full_name: a.winner.fullName,
              phone_number: a.winner.phoneNumber,
            }
          : null,
        order: a.order
          ? {
              id: a.order.id,
              order_number: a.order.orderNumber,
              payment_status: a.order.paymentStatus,
            }
          : null,
      })),
      page,
      limit,
      total
    );
  } catch (error: any) {
    logger.error('Admin auctions error:', error);
    sendError(res, error.message || 'Failed to load auctions', 500);
  }
};

/**
 * GET /api/v1/admin/orders
 */
export const getAllOrders = async (req: Request, res: Response) => {
  try {
    const { page, limit } = parsePage(req);
    const skip = (page - 1) * limit;
    const paymentStatus = req.query.payment_status as string | undefined;
    const payoutStatus = req.query.payout_status as string | undefined;
    const fulfillmentStatus = req.query.fulfillment_status as
      | string
      | undefined;
    const search = (req.query.search as string | undefined)?.trim();
    const missingShipping = req.query.missing_shipping === 'true';

    const where: Prisma.OrderWhereInput = {};
    if (paymentStatus && paymentStatus !== 'all') {
      where.paymentStatus = paymentStatus;
    }
    if (payoutStatus && payoutStatus !== 'all') {
      where.payoutStatus = payoutStatus;
    }
    if (fulfillmentStatus && fulfillmentStatus !== 'all') {
      where.fulfillmentStatus = fulfillmentStatus;
    }
    if (missingShipping) {
      where.shippingAddress = { equals: Prisma.DbNull };
    }
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        {
          buyer: {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { phoneNumber: { contains: search } },
            ],
          },
        },
        {
          seller: {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { phoneNumber: { contains: search } },
            ],
          },
        },
        {
          auction: {
            gadget: { title: { contains: search, mode: 'insensitive' } },
          },
        },
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          buyer: {
            select: { id: true, fullName: true, phoneNumber: true },
          },
          seller: {
            select: { id: true, fullName: true, phoneNumber: true },
          },
          auction: {
            include: {
              gadget: {
                select: { id: true, title: true, images: true },
              },
            },
          },
          disputes: {
            select: { id: true, status: true, disputeType: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    sendPaginated(
      res,
      orders.map(o => ({
        id: o.id,
        order_number: o.orderNumber,
        total_amount: toNumber(o.totalAmount),
        platform_fee: toNumber(o.platformFee),
        seller_payout: toNumber(o.sellerPayout),
        payout_status: o.payoutStatus,
        payout_paid_at: o.payoutPaidAt?.toISOString(),
        payout_reference: o.payoutReference,
        payment_status: o.paymentStatus,
        fulfillment_status: o.fulfillmentStatus,
        shipping_address: o.shippingAddress,
        tracking_number: o.trackingNumber,
        created_at: o.createdAt?.toISOString(),
        updated_at: o.updatedAt?.toISOString(),
        gadget_title: o.auction?.gadget?.title,
        gadget_image: o.auction?.gadget?.images?.[0],
        has_shipping: Boolean(o.shippingAddress),
        dispute_count: o.disputes.length,
        open_dispute: o.disputes.some(d => d.status === 'open'),
        buyer: {
          id: o.buyer?.id,
          full_name: o.buyer?.fullName,
          phone_number: o.buyer?.phoneNumber,
        },
        seller: {
          id: o.seller?.id,
          full_name: o.seller?.fullName,
          phone_number: o.seller?.phoneNumber,
        },
      })),
      page,
      limit,
      total
    );
  } catch (error: any) {
    logger.error('Admin orders error:', error);
    sendError(res, error.message || 'Failed to load orders', 500);
  }
};

/**
 * PATCH /api/v1/admin/orders/:id
 * Admin can set payment status, fulfillment status, and tracking.
 */
export const updateOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      payment_status,
      fulfillment_status,
      tracking_number,
      payout_status,
      payout_reference,
    } = req.body as {
      payment_status?: string;
      fulfillment_status?: string;
      tracking_number?: string | null;
      payout_status?: string;
      payout_reference?: string | null;
    };

    if (
      payment_status === undefined &&
      fulfillment_status === undefined &&
      tracking_number === undefined &&
      payout_status === undefined &&
      payout_reference === undefined
    ) {
      return sendError(res, 'No updates provided', 400);
    }

    const order = await orderService.adminUpdateOrder(id, {
      payment_status,
      fulfillment_status,
      tracking_number,
      payout_status,
      payout_reference,
    });

    await audit(req, 'order_update', 'order', id, {
      payment_status,
      fulfillment_status,
      tracking_number,
      payout_status,
      payout_reference,
    });

    sendSuccess(res, order, 'Order updated');
  } catch (error: any) {
    logger.error('Admin update order error:', error);
    sendError(res, error.message || 'Failed to update order', 400);
  }
};

/**
 * POST /api/v1/admin/auctions/:id/cancel
 */
export const cancelAuction = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const force = Boolean((req.body as { force?: boolean })?.force);

    await auctionService.cancelAuction(id, req.user!.user_id, {
      asAdmin: true,
      force,
    });

    await audit(req, 'auction_cancel', 'auction', id, { force });

    sendSuccess(res, null, 'Auction cancelled');
  } catch (error: any) {
    logger.error('Admin cancel auction error:', error);
    sendError(res, error.message || 'Failed to cancel auction', 400);
  }
};

/**
 * GET /api/v1/admin/users
 */
export const getUsers = async (req: Request, res: Response) => {
  try {
    const { page, limit } = parsePage(req);
    const skip = (page - 1) * limit;
    const role = req.query.role as string | undefined;
    const search = (req.query.search as string | undefined)?.trim();
    const active = req.query.active as string | undefined;

    const where: Prisma.UserWhereInput = {};
    if (role && role !== 'all') where.role = role;
    if (active === 'true') where.isActive = true;
    if (active === 'false') where.isActive = false;
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
          email: true,
          role: true,
          isVerified: true,
          isActive: true,
          businessName: true,
          sellerKybStatus: true,
          createdAt: true,
          wallet: {
            select: {
              balance: true,
              isLocked: true,
              transactions: {
                where: {
                  transactionType: 'fee',
                  status: 'pending',
                  amount: BID_DEFAULT_PENALTY_AMOUNT,
                },
                select: {
                  id: true,
                  amount: true,
                  description: true,
                  createdAt: true,
                },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
          _count: {
            select: {
              gadgets: true,
              sellerAuctions: true,
              buyerOrders: true,
              sellerOrders: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);
    const riskFlagsByUserId = await riskService.getActiveRiskFlagsForUsers(
      users.map(user => user.id)
    );

    sendPaginated(
      res,
      users.map(u => ({
        id: u.id,
        full_name: u.fullName,
        phone_number: u.phoneNumber,
        email: u.email,
        role: u.role,
        is_verified: u.isVerified,
        is_active: u.isActive,
        business_name: u.businessName,
        seller_kyb_status: u.sellerKybStatus,
        created_at: u.createdAt?.toISOString(),
        wallet_balance: toNumber(u.wallet?.balance),
        wallet_locked: Boolean(u.wallet?.isLocked),
        pending_penalty: u.wallet?.transactions?.[0]
          ? {
              id: u.wallet.transactions[0].id,
              amount: toNumber(u.wallet.transactions[0].amount),
              description: u.wallet.transactions[0].description,
              created_at: u.wallet.transactions[0].createdAt?.toISOString(),
            }
          : null,
        risk_flags: riskFlagsByUserId[u.id] || [],
        risk_flag_count: riskFlagsByUserId[u.id]?.length || 0,
        counts: {
          gadgets: u._count.gadgets,
          auctions: u._count.sellerAuctions,
          purchases: u._count.buyerOrders,
          sales: u._count.sellerOrders,
        },
      })),
      page,
      limit,
      total
    );
  } catch (error: any) {
    logger.error('Admin users error:', error);
    sendError(res, error.message || 'Failed to load users', 500);
  }
};

/**
 * GET /api/v1/admin/users/:id/seller-profile
 */
export const getSellerProfile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        phoneNumber: true,
        email: true,
        avatarUrl: true,
        role: true,
        isVerified: true,
        isActive: true,
        businessName: true,
        cacNumber: true,
        sellerKybStatus: true,
        sellerKybSubmittedAt: true,
        sellerKybReviewedAt: true,
        sellerKybRejectionReason: true,
        createdAt: true,
        wallet: { select: { balance: true, currency: true, isLocked: true } },
      },
    });

    if (!user) {
      return sendError(res, 'User not found', 404);
    }

    if (user.role !== 'seller') {
      return sendError(res, 'This user is not a seller', 400);
    }

    const [
      totalGadgets,
      pendingGadgets,
      approvedGadgets,
      rejectedGadgets,
      totalAuctions,
      activeAuctions,
      scheduledAuctions,
      endedAuctions,
      salesCount,
      salesAggregate,
      openDisputes,
      totalDisputes,
      latestGadgets,
      latestAuctions,
      latestSales,
      latestDisputes,
      riskFlags,
    ] = await Promise.all([
      prisma.gadget.count({ where: { sellerId: id } }),
      prisma.gadget.count({ where: { sellerId: id, status: 'pending' } }),
      prisma.gadget.count({ where: { sellerId: id, status: 'approved' } }),
      prisma.gadget.count({ where: { sellerId: id, status: 'rejected' } }),
      prisma.auction.count({ where: { sellerId: id } }),
      prisma.auction.count({ where: { sellerId: id, status: 'active' } }),
      prisma.auction.count({ where: { sellerId: id, status: 'scheduled' } }),
      prisma.auction.count({ where: { sellerId: id, status: 'ended' } }),
      prisma.order.count({ where: { sellerId: id } }),
      prisma.order.aggregate({
        where: { sellerId: id, paymentStatus: 'paid' },
        _sum: { totalAmount: true, sellerPayout: true },
      }),
      prisma.dispute.count({
        where: {
          status: { in: ['open', 'investigating'] },
          order: { sellerId: id },
        },
      }),
      prisma.dispute.count({ where: { order: { sellerId: id } } }),
      prisma.gadget.findMany({
        where: { sellerId: id },
        select: {
          id: true,
          title: true,
          brand: true,
          model: true,
          condition: true,
          status: true,
          images: true,
          createdAt: true,
          category: { select: { name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      prisma.auction.findMany({
        where: { sellerId: id },
        select: {
          id: true,
          status: true,
          startingPrice: true,
          currentPrice: true,
          totalBids: true,
          startTime: true,
          endTime: true,
          gadget: { select: { title: true, images: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      prisma.order.findMany({
        where: { sellerId: id },
        select: {
          id: true,
          orderNumber: true,
          totalAmount: true,
          sellerPayout: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          createdAt: true,
          buyer: { select: { id: true, fullName: true, phoneNumber: true } },
          auction: {
            select: { gadget: { select: { title: true, images: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      prisma.dispute.findMany({
        where: { order: { sellerId: id } },
        select: {
          id: true,
          disputeType: true,
          description: true,
          status: true,
          resolution: true,
          createdAt: true,
          resolvedAt: true,
          raiser: { select: { id: true, fullName: true, phoneNumber: true } },
          resolver: { select: { id: true, fullName: true } },
          order: {
            select: {
              id: true,
              orderNumber: true,
              totalAmount: true,
              paymentStatus: true,
              fulfillmentStatus: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      riskService.getActiveRiskFlagsForUsers([id]),
    ]);

    sendSuccess(res, {
      user: {
        id: user.id,
        full_name: user.fullName,
        phone_number: user.phoneNumber,
        email: user.email,
        avatar_url: user.avatarUrl,
        role: user.role,
        is_verified: user.isVerified,
        is_active: user.isActive,
        business_name: user.businessName,
        cac_number: user.cacNumber,
        seller_kyb_status: user.sellerKybStatus,
        seller_kyb_submitted_at: user.sellerKybSubmittedAt?.toISOString() || null,
        seller_kyb_reviewed_at: user.sellerKybReviewedAt?.toISOString() || null,
        seller_kyb_rejection_reason: user.sellerKybRejectionReason,
        created_at: user.createdAt?.toISOString(),
        wallet: {
          balance: toNumber(user.wallet?.balance),
          currency: user.wallet?.currency || 'NGN',
          is_locked: Boolean(user.wallet?.isLocked),
        },
        risk_flags: riskFlags[id] || [],
      },
      stats: {
        total_gadgets: totalGadgets,
        pending_gadgets: pendingGadgets,
        approved_gadgets: approvedGadgets,
        rejected_gadgets: rejectedGadgets,
        total_auctions: totalAuctions,
        active_auctions: activeAuctions,
        scheduled_auctions: scheduledAuctions,
        ended_auctions: endedAuctions,
        total_sales: salesCount,
        gross_sales: toNumber(salesAggregate._sum.totalAmount),
        seller_payouts: toNumber(salesAggregate._sum.sellerPayout),
        open_disputes: openDisputes,
        total_disputes: totalDisputes,
      },
      latest_gadgets: latestGadgets.map(g => ({
        id: g.id,
        title: g.title,
        brand: g.brand,
        model: g.model,
        condition: g.condition,
        status: g.status,
        image: g.images?.[0] || null,
        created_at: g.createdAt?.toISOString(),
        category: g.category
          ? { name: g.category.name, slug: g.category.slug }
          : null,
      })),
      latest_auctions: latestAuctions.map(a => ({
        id: a.id,
        title: a.gadget?.title || 'Untitled gadget',
        image: a.gadget?.images?.[0] || null,
        status: a.status,
        starting_price: toNumber(a.startingPrice),
        current_price: toNumber(a.currentPrice),
        total_bids: a.totalBids || 0,
        start_time: a.startTime?.toISOString(),
        end_time: a.endTime?.toISOString(),
      })),
      latest_sales: latestSales.map(o => ({
        id: o.id,
        order_number: o.orderNumber,
        title: o.auction?.gadget?.title || 'Auction order',
        image: o.auction?.gadget?.images?.[0] || null,
        total_amount: toNumber(o.totalAmount),
        seller_payout: toNumber(o.sellerPayout),
        payment_status: o.paymentStatus,
        fulfillment_status: o.fulfillmentStatus,
        created_at: o.createdAt?.toISOString(),
        buyer: o.buyer
          ? {
              id: o.buyer.id,
              full_name: o.buyer.fullName,
              phone_number: o.buyer.phoneNumber,
            }
          : null,
      })),
      latest_disputes: latestDisputes.map(d => ({
        id: d.id,
        dispute_type: d.disputeType,
        description: d.description,
        status: d.status,
        resolution: d.resolution,
        created_at: d.createdAt?.toISOString(),
        resolved_at: d.resolvedAt?.toISOString(),
        order: d.order
          ? {
              id: d.order.id,
              order_number: d.order.orderNumber,
              total_amount: toNumber(d.order.totalAmount),
              payment_status: d.order.paymentStatus,
              fulfillment_status: d.order.fulfillmentStatus,
            }
          : null,
        raised_by: d.raiser
          ? {
              id: d.raiser.id,
              full_name: d.raiser.fullName,
              phone_number: d.raiser.phoneNumber,
            }
          : null,
        resolved_by: d.resolver
          ? { id: d.resolver.id, full_name: d.resolver.fullName }
          : null,
      })),
    });
  } catch (error: any) {
    logger.error('Admin seller profile error:', error);
    sendError(res, error.message || 'Failed to load seller profile', 500);
  }
};

/**
 * PATCH /api/v1/admin/users/:id
 */
export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role, is_active, is_verified, wallet_locked } = req.body as {
      role?: string;
      is_active?: boolean;
      is_verified?: boolean;
      wallet_locked?: boolean;
    };

    if (id === req.user!.user_id && is_active === false) {
      return sendError(res, 'You cannot deactivate your own account', 400);
    }

    const data: Prisma.UserUpdateInput = {};
    if (role) {
      if (!['bidder', 'seller', 'admin'].includes(role)) {
        return sendError(res, 'Invalid role', 400);
      }
      data.role = role;
    }
    if (typeof is_active === 'boolean') {
      data.isActive = is_active;
    }
    if (typeof is_verified === 'boolean') {
      data.isVerified = is_verified;
    }
    if (Object.keys(data).length === 0 && typeof wallet_locked !== 'boolean') {
      return sendError(res, 'No updates provided', 400);
    }

    const user = await prisma.$transaction(async tx => {
      const updatedUser =
        Object.keys(data).length > 0
          ? await tx.user.update({
              where: { id },
              data,
              select: {
                id: true,
                fullName: true,
                phoneNumber: true,
                email: true,
                role: true,
                isVerified: true,
                isActive: true,
              },
            })
          : await tx.user.findUniqueOrThrow({
              where: { id },
              select: {
                id: true,
                fullName: true,
                phoneNumber: true,
                email: true,
                role: true,
                isVerified: true,
                isActive: true,
              },
            });

      if (typeof wallet_locked === 'boolean') {
        await tx.wallet.upsert({
          where: { userId: id },
          create: {
            userId: id,
            balance: 0,
            isLocked: wallet_locked,
          },
          update: { isLocked: wallet_locked },
        });
      }

      return updatedUser;
    });

    await audit(req, 'user_update', 'user', id, {
      role,
      is_active,
      is_verified,
      wallet_locked,
    });

    sendSuccess(
      res,
      {
        id: user.id,
        full_name: user.fullName,
        phone_number: user.phoneNumber,
        email: user.email,
        role: user.role,
        is_verified: user.isVerified,
        is_active: user.isActive,
      },
      'User updated'
    );
  } catch (error: any) {
    logger.error('Admin update user error:', error);
    sendError(res, error.message || 'Failed to update user', 400);
  }
};

/**
 * POST /api/v1/admin/users/:id/reactivate
 */
export const reactivateUserAfterPenalty = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params;
    const { reference, note } = req.body as {
      reference?: string;
      note?: string;
    };

    const result = await prisma.$transaction(async tx => {
      const user = await tx.user.findUnique({
        where: { id },
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
          email: true,
          role: true,
          isActive: true,
          wallet: {
            select: {
              id: true,
              isLocked: true,
              transactions: {
                where: {
                  transactionType: 'fee',
                  status: 'pending',
                  amount: BID_DEFAULT_PENALTY_AMOUNT,
                },
                select: { id: true, amount: true },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const penalty = user.wallet?.transactions?.[0];
      if (!penalty) {
        throw new Error('No pending reactivation penalty found');
      }

      await tx.walletTransaction.update({
        where: { id: penalty.id },
        data: {
          status: 'completed',
          reference: reference || `PENALTY-${Date.now()}`,
          metadata: {
            reactivatedBy: req.user!.user_id,
            note: note || null,
          },
        },
      });

      if (user.wallet?.id) {
        await tx.wallet.update({
          where: { id: user.wallet.id },
          data: { isLocked: false },
        });
      }

      const updatedUser = await tx.user.update({
        where: { id },
        data: { isActive: true },
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
          email: true,
          role: true,
          isActive: true,
          isVerified: true,
        },
      });

      return updatedUser;
    });

    await audit(req, 'user_reactivate_after_penalty', 'user', id, {
      penalty_amount: BID_DEFAULT_PENALTY_AMOUNT,
      reference,
      note,
    });

    sendSuccess(
      res,
      {
        id: result.id,
        full_name: result.fullName,
        phone_number: result.phoneNumber,
        email: result.email,
        role: result.role,
        is_active: result.isActive,
        is_verified: result.isVerified,
      },
      'User reactivated after penalty payment'
    );
  } catch (error: any) {
    logger.error('Admin reactivate user error:', error);
    sendError(res, error.message || 'Failed to reactivate user', 400);
  }
};

/**
 * POST /api/v1/admin/orders/:id/second-place-offer
 */
export const createSecondPlaceOffer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await orderService.offerOrderToSecondPlaceBidder(id);

    await audit(req, 'second_place_offer', 'order', id, {
      bidder_id: result.bidder.id,
      amount: result.bidder.amount,
    });

    sendSuccess(res, result, 'Second-place offer sent');
  } catch (error: any) {
    logger.error('Admin second-place offer error:', error);
    sendError(res, error.message || 'Failed to create second-place offer', 400);
  }
};

/**
 * GET /api/v1/admin/disputes
 */
export const getDisputes = async (req: Request, res: Response) => {
  try {
    const { page, limit } = parsePage(req);
    const skip = (page - 1) * limit;
    const status = req.query.status as string | undefined;

    const where: Prisma.DisputeWhereInput = {};
    if (status && status !== 'all') where.status = status;

    const [disputes, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              totalAmount: true,
              paymentStatus: true,
              fulfillmentStatus: true,
            },
          },
          raiser: {
            select: { id: true, fullName: true, phoneNumber: true },
          },
          resolver: {
            select: { id: true, fullName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.dispute.count({ where }),
    ]);

    sendPaginated(
      res,
      disputes.map(d => ({
        id: d.id,
        dispute_type: d.disputeType,
        description: d.description,
        status: d.status,
        resolution: d.resolution,
        evidence: d.evidence,
        created_at: d.createdAt?.toISOString(),
        resolved_at: d.resolvedAt?.toISOString(),
        order: d.order
          ? {
              id: d.order.id,
              order_number: d.order.orderNumber,
              total_amount: toNumber(d.order.totalAmount),
              payment_status: d.order.paymentStatus,
              fulfillment_status: d.order.fulfillmentStatus,
            }
          : null,
        raised_by: d.raiser
          ? {
              id: d.raiser.id,
              full_name: d.raiser.fullName,
              phone_number: d.raiser.phoneNumber,
            }
          : null,
        resolved_by: d.resolver
          ? { id: d.resolver.id, full_name: d.resolver.fullName }
          : null,
      })),
      page,
      limit,
      total
    );
  } catch (error: any) {
    logger.error('Admin disputes error:', error);
    sendError(res, error.message || 'Failed to load disputes', 500);
  }
};

/**
 * PATCH /api/v1/admin/disputes/:id
 */
export const resolveDispute = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, resolution } = req.body as {
      status?: string;
      resolution?: string;
    };

    if (
      !status ||
      !['resolved', 'closed', 'open', 'investigating'].includes(status)
    ) {
      return sendError(res, 'Invalid dispute status', 400);
    }

    const dispute = await prisma.$transaction(async tx => {
      const updated = await tx.dispute.update({
        where: { id },
        data: {
          status,
          resolution: resolution || undefined,
          resolvedBy:
            status === 'resolved' || status === 'closed'
              ? req.user!.user_id
              : undefined,
          resolvedAt:
            status === 'resolved' || status === 'closed'
              ? new Date()
              : undefined,
        },
      });

      if (status === 'resolved' || status === 'closed') {
        const openDisputes = await tx.dispute.count({
          where: {
            orderId: updated.orderId,
            status: { in: ['open', 'investigating'] },
          },
        });

        if (updated.orderId && openDisputes === 0) {
          const order = await tx.order.findUnique({
            where: { id: updated.orderId },
            select: {
              paymentStatus: true,
              fulfillmentStatus: true,
              payoutStatus: true,
            },
          });

          if (
            order?.paymentStatus === 'paid' &&
            order.fulfillmentStatus === 'delivered' &&
            order.payoutStatus === 'held'
          ) {
            await tx.order.update({
              where: { id: updated.orderId },
              data: { payoutStatus: 'ready', updatedAt: new Date() },
            });
          }
        }
      }

      return updated;
    });

    await audit(req, 'dispute_update', 'dispute', id, { status, resolution });

    sendSuccess(res, dispute, 'Dispute updated');
  } catch (error: any) {
    logger.error('Admin resolve dispute error:', error);
    sendError(res, error.message || 'Failed to update dispute', 400);
  }
};

/**
 * GET /api/v1/admin/payments
 */
export const getPayments = async (req: Request, res: Response) => {
  try {
    const { page, limit } = parsePage(req);
    const skip = (page - 1) * limit;
    const status = req.query.status as string | undefined;

    const where: Prisma.PaymentTransactionWhereInput = {};
    if (status && status !== 'all') where.status = status;

    const [payments, total] = await Promise.all([
      prisma.paymentTransaction.findMany({
        where,
        include: {
          user: {
            select: { id: true, fullName: true, phoneNumber: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.paymentTransaction.count({ where }),
    ]);

    sendPaginated(
      res,
      payments.map(p => ({
        id: p.id,
        gateway: p.paymentGateway,
        reference: p.gatewayReference,
        amount: toNumber(p.amount),
        currency: p.currency,
        status: p.status,
        payment_method: p.paymentMethod,
        metadata: p.metadata,
        created_at: p.createdAt?.toISOString(),
        user: p.user
          ? {
              id: p.user.id,
              full_name: p.user.fullName,
              phone_number: p.user.phoneNumber,
            }
          : null,
      })),
      page,
      limit,
      total
    );
  } catch (error: any) {
    logger.error('Admin payments error:', error);
    sendError(res, error.message || 'Failed to load payments', 500);
  }
};

/**
 * GET /api/v1/admin/audit-logs
 */
export const getAuditLogs = async (req: Request, res: Response) => {
  try {
    const { page, limit } = parsePage(req);
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        include: {
          user: {
            select: { id: true, fullName: true, phoneNumber: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count(),
    ]);

    sendPaginated(
      res,
      logs.map(l => ({
        id: l.id,
        action: l.action,
        resource_type: l.resourceType,
        resource_id: l.resourceId,
        changes: l.changes,
        ip_address: l.ipAddress,
        created_at: l.createdAt?.toISOString(),
        actor: l.user
          ? {
              id: l.user.id,
              full_name: l.user.fullName,
              phone_number: l.user.phoneNumber,
            }
          : null,
      })),
      page,
      limit,
      total
    );
  } catch (error: any) {
    logger.error('Admin audit logs error:', error);
    sendError(res, error.message || 'Failed to load audit logs', 500);
  }
};

/**
 * GET /api/v1/admin/support/threads
 */
export const getSupportThreads = async (req: Request, res: Response) => {
  try {
    const { page, limit } = parsePage(req);
    const status = req.query.status as string | undefined;
    const search = (req.query.search as string | undefined)?.trim();
    const result = await supportService.listThreadsForAdmin({
      status,
      page,
      limit,
      search,
    });
    sendPaginated(
      res,
      result.data,
      result.pagination.page,
      result.pagination.limit,
      result.pagination.total
    );
  } catch (error: any) {
    logger.error('Admin support threads error:', error);
    sendError(res, error.message || 'Failed to load support threads', 500);
  }
};

/**
 * GET /api/v1/admin/support/threads/:id/messages
 */
export const getSupportMessages = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const result = await supportService.getThreadMessages(id, { page, limit });
    await supportService.markAdminThreadRead(id);
    sendPaginated(
      res,
      result.data,
      result.pagination.page,
      result.pagination.limit,
      result.pagination.total
    );
  } catch (error: any) {
    logger.error('Admin support messages error:', error);
    sendError(res, error.message || 'Failed to load messages', 400);
  }
};

/**
 * POST /api/v1/admin/support/threads/:id/messages
 */
export const replySupportThread = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { body } = req.body as { body?: string };
    if (!body || !String(body).trim()) {
      return sendError(res, 'Message body is required', 400);
    }
    const message = await supportService.sendAdminMessage(
      id,
      req.user!.user_id,
      body
    );
    await audit(req, 'support_reply', 'support_thread', id, {
      preview: String(body).slice(0, 80),
    });
    sendSuccess(res, message, 'Reply sent');
  } catch (error: any) {
    logger.error('Admin support reply error:', error);
    sendError(res, error.message || 'Failed to send reply', 400);
  }
};

/**
 * POST /api/v1/admin/support/threads/:id/close
 */
export const closeSupportThread = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const thread = await supportService.closeThread(id);
    await audit(req, 'support_close', 'support_thread', id);
    sendSuccess(res, thread, 'Thread closed');
  } catch (error: any) {
    logger.error('Admin support close error:', error);
    sendError(res, error.message || 'Failed to close thread', 400);
  }
};

/**
 * GET /api/v1/admin/sellers/kyb-pending
 * List sellers awaiting KYB review.
 */
export const getPendingSellerKyb = async (req: Request, res: Response) => {
  try {
    const { page, limit } = parsePage(req);
    const skip = (page - 1) * limit;

    const [sellers, total] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'seller', sellerKybStatus: 'pending' },
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
          email: true,
          businessName: true,
          cacNumber: true,
          sellerKybSubmittedAt: true,
          createdAt: true,
        },
        orderBy: { sellerKybSubmittedAt: 'asc' },
        skip,
        take: limit,
      }),
      prisma.user.count({
        where: { role: 'seller', sellerKybStatus: 'pending' },
      }),
    ]);

    sendPaginated(res, sellers, page, limit, total);
  } catch (error: any) {
    logger.error('Get pending seller KYB error:', error);
    sendError(res, error.message || 'Failed to get pending seller KYB', 500);
  }
};

/**
 * POST /api/v1/admin/sellers/:id/kyb/approve
 */
export const approveSellerKyb = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.update({
      where: { id },
      data: {
        sellerKybStatus: 'approved',
        sellerKybReviewedAt: new Date(),
        sellerKybRejectionReason: null,
      },
      select: { id: true, fullName: true, businessName: true },
    });

    await audit(req, 'seller_kyb_approve', 'user', id, {
      business_name: user.businessName,
    });

    sendSuccess(res, user, 'Seller verification approved');
  } catch (error: any) {
    logger.error('Approve seller KYB error:', error);
    sendError(res, error.message || 'Failed to approve seller KYB', 400);
  }
};

/**
 * POST /api/v1/admin/sellers/:id/kyb/reject
 */
export const rejectSellerKyb = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const reason =
      (req.body?.reason as string) || 'Business details could not be verified';

    const user = await prisma.user.update({
      where: { id },
      data: {
        sellerKybStatus: 'rejected',
        sellerKybReviewedAt: new Date(),
        sellerKybRejectionReason: reason,
      },
      select: { id: true, fullName: true, businessName: true },
    });

    await audit(req, 'seller_kyb_reject', 'user', id, { reason });

    sendSuccess(res, user, 'Seller verification rejected');
  } catch (error: any) {
    logger.error('Reject seller KYB error:', error);
    sendError(res, error.message || 'Failed to reject seller KYB', 400);
  }
};
