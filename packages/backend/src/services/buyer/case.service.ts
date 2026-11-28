import { randomBytes } from 'crypto';
import fs from 'fs';
import { v2 as cloudinary } from 'cloudinary';
import config from '../../config';
import prisma from '../../config/prisma';
import { Prisma } from '../../generated/prisma';
import logger from '../../utils/logger';
import { isCloudinaryEnabled } from '../media/cloudinary.service';
import {
  buildUploadPath,
  CASE_VIDEO_MAX_SECONDS,
  videoDurationSeconds,
} from '../../api/middlewares/upload.middleware';
import { SELLER_POLICY } from '@gadget-bidding/shared';
import * as notificationService from '../notification/notification.service';
import { cardPaymentFor, creditBuyerWallet, startCardRefund } from '../order/buyerRefund.service';
import { paymentMethodLabel } from '../order/order.service';
import { nextPayoutTime } from '../seller/payouts.service';
import { failedSalesCount } from '../seller/listingGate.service';

/**
 * Problem reports as "cases" (D-119): what the buyer reported, a thread between buyer,
 * seller and our team, the decision (refund or not upheld) and, for refunds, the return.
 *
 * The seller's side: within 48 hours they reply with their position and files (or accept the
 * return and refund). After a refund decision they can ask for one second review and choose how
 * to get the item back (collect from the hub, free for 7 days, or a rider to their shop for a fee
 * taken off their next payout).
 */

export const RETURN_WINDOW_DAYS = 5;
const DAY = 24 * 3_600_000;
const HOUR = 3_600_000;

const toNumber = (v: unknown) => (v == null ? 0 : Number(String(v)));
export const caseLabel = (n: number) => `D-${n}`;
/** ₦580,500 */
const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

/** The one charge a "rider to your shop" return makes (seller_charges, unique per case). */
export const RETURN_DELIVERY_REASON = 'Rider to your shop for a returned item';
export const SELLER_FILE_MAX = 6;
const SELLER_VIDEO_MAX = 1;
export const SELLER_FILE_MAX_MB = 10;
const POSITION_LABEL: Record<string, string> = { matched: 'It matched my listing', partly: 'Partly right' };

const PROBLEM_LABEL: Record<string, string> = {
  item_not_as_described: 'Not as described',
  not_working: "It doesn't work properly",
  missing_parts: 'Missing parts',
  wrong_item: 'Wrong item',
  item_damaged: 'Damaged in delivery',
  item_not_received: "It hasn't arrived",
  fraud: 'Something seems wrong',
  other: 'Something else',
};

const OPEN = ['open', 'investigating'];

type Viewer = 'buyer' | 'seller' | 'team';
/** A file the seller added to their reply: a photo, a short video or a PDF receipt. */
export type SellerFile = { url: string; kind: 'photo' | 'video' | 'pdf'; name: string; seconds?: number; added_at: string };
/**
 * disputes.evidence: photos from the report, plus one short video (with its length), the seller's
 * files, and the seller's return choice until the buyer's return exists (then it moves there).
 */
type Evidence = {
  photos?: string[];
  videos?: string[];
  video_seconds?: Record<string, number>;
  seller_files?: SellerFile[];
  seller_return?: { method: 'collect' | 'deliver'; chosen_at: string };
};
const MAX_CASE_VIDEOS = 1;
/** disputes.hub_findings: rows our team writes ("Battery health at hub" · "71%"). */
type HubRow = { label: string; value: string };
const hubRowsOf = (v: unknown): HubRow[] =>
  Array.isArray(v)
    ? v
        .filter(r => r && typeof r.label === 'string' && typeof r.value === 'string')
        .map(r => ({ label: String(r.label), value: String(r.value) }))
    : [];

const loadCase = (disputeId: string) =>
  prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      order: { include: { auction: { include: { gadget: true } } } },
      messages: { orderBy: { createdAt: 'asc' } },
      return: true,
      charges: { where: { reason: RETURN_DELIVERY_REASON } },
    },
  });
type LoadedCase = NonNullable<Awaited<ReturnType<typeof loadCase>>>;

/** The case, if this user is the order's buyer or seller. */
const caseFor = async (userId: string, disputeId: string) => {
  const d = await loadCase(disputeId);
  if (!d?.order) throw new Error('Case not found');
  const viewer: Viewer | null =
    d.order.buyerId === userId ? 'buyer' : d.order.sellerId === userId ? 'seller' : null;
  if (!viewer) throw new Error('Case not found');
  return { d, viewer };
};

/** The seller's side, for the seller and our team. The buyer never gets this block. */
const sellerSide = async (d: LoadedCase, viewer: 'seller' | 'team') => {
  const o = d.order!;
  const evidence = (d.evidence ?? {}) as Evidence;
  const files = evidence.seller_files ?? [];
  const isSeller = viewer === 'seller';
  const open = OPEN.includes(d.status || '');
  const refundDecided = d.outcome === 'refund' && d.status === 'resolved';
  const r = d.return;
  const refundStarted = r?.status === 'refunded' || !!r?.refundReference;
  const replyMsg = d.sellerRepliedAt
    ? d.messages.find(m => m.authorRole === 'seller' && m.createdAt.getTime() === d.sellerRepliedAt!.getTime()) ??
      d.messages.find(m => m.authorRole === 'seller' && m.createdAt >= d.sellerRepliedAt!)
    : undefined;
  const respondBy = new Date((d.createdAt ?? new Date()).getTime() + SELLER_POLICY.caseReplyHours * HOUR);

  let account: { bank_name: string; account_last4: string } | null = null;
  let blocked: 'PAYOUT_ACCOUNT_REQUIRED' | 'TWO_STEP_REQUIRED' | null = null;
  let failed: number | null = null;
  if (isSeller && o.sellerId) {
    const [u, count] = await Promise.all([
      prisma.user.findUnique({
        where: { id: o.sellerId },
        select: {
          payoutBankCode: true,
          payoutBankName: true,
          payoutAccountNumber: true,
          payoutAccountName: true,
          twoFactorEnabled: true,
        },
      }),
      failedSalesCount(o.sellerId),
    ]);
    if (u?.payoutBankCode && u.payoutAccountNumber && u.payoutAccountName) {
      account = { bank_name: u.payoutBankName || u.payoutBankCode, account_last4: u.payoutAccountNumber.slice(-4) };
    }
    blocked = !account ? 'PAYOUT_ACCOUNT_REQUIRED' : !u?.twoFactorEnabled ? 'TWO_STEP_REQUIRED' : null;
    failed = count;
  }

  const method = r?.sellerReturnMethod ?? evidence.seller_return?.method ?? null;
  const chosenAt = r?.sellerReturnChosenAt?.toISOString() ?? evidence.seller_return?.chosen_at ?? null;
  const atHub = r && ['received', 'refunded'].includes(r.status) ? (r.receivedAt ?? r.refundedAt ?? null) : null;
  const charge = d.charges[0];

  return {
    /** Reply by: 48 hours from when the case opened. */
    respond_by: respondBy.toISOString(),
    replied_at: d.sellerRepliedAt?.toISOString() ?? null,
    position: d.sellerPosition as 'matched' | 'partly' | null,
    position_label: d.sellerPosition ? POSITION_LABEL[d.sellerPosition] ?? null : null,
    reply: replyMsg?.body ?? null,
    reply_message_id: replyMsg?.id ?? null,
    files,
    accepted_at: d.sellerAcceptedAt?.toISOString() ?? null,
    second_review_requested_at: d.sellerSecondReviewRequestedAt?.toISOString() ?? null,
    can_reply: isSeller && open && !d.sellerRepliedAt && !d.sellerAcceptedAt,
    can_add_files: isSeller && open && !d.sellerRepliedAt && !d.sellerAcceptedAt && files.length < SELLER_FILE_MAX,
    can_accept: isSeller && open && !d.sellerAcceptedAt && d.outcome !== 'refund',
    can_ask_second_review:
      isSeller && refundDecided && !d.sellerSecondReviewRequestedAt && !d.sellerAcceptedAt && !refundStarted,
    payout: {
      amount: toNumber(o.sellerPayout),
      /** pending | held | ready | sending | paid */
      status: o.payoutStatus,
      paid_at: o.payoutPaidAt?.toISOString() ?? null,
      /** The next 6 pm Lagos payout run. */
      next_run_at: nextPayoutTime().toISOString(),
      account,
      blocked,
    },
    failed_sales: isSeller
      ? {
          count: failed ?? 0,
          limit: SELLER_POLICY.failedSaleLimit,
          window_days: SELLER_POLICY.failedSaleWindowDays,
        }
      : null,
    /** Getting the item back after a refund decision. */
    item_return:
      d.outcome === 'refund'
        ? {
            method: method as 'collect' | 'deliver' | null,
            chosen_at: chosenAt,
            /** The seller shows the order number at the hub. */
            code: o.orderNumber,
            delivery_fee: SELLER_POLICY.returnDeliveryFee,
            free_days: SELLER_POLICY.freeCollectionDays,
            storage_fee_per_day: SELLER_POLICY.storageFeePerDay,
            /** The buyer's return: null (not started) | started | received | refunded */
            buyer_return_status: r?.status ?? null,
            buyer_return_due_at: r?.dueAt.toISOString() ?? null,
            at_hub_since: atHub?.toISOString() ?? null,
            free_until: atHub ? new Date(atHub.getTime() + SELLER_POLICY.freeCollectionDays * DAY).toISOString() : null,
            returned_at: r?.returnedToSellerAt?.toISOString() ?? null,
            charge: charge ? { amount: toNumber(charge.amount), status: charge.status } : null,
            can_choose: isSeller && refundDecided && !r?.returnedToSellerAt,
          }
        : null,
  };
};

export type SellerCaseSide = Awaited<ReturnType<typeof sellerSide>>;

const format = async (d: LoadedCase, viewer: Viewer, viewerId?: string) => {
  const o = d.order!;
  const g = o.auction?.gadget;
  const evidence = (d.evidence ?? {}) as Evidence;
  const specs = (g?.specifications ?? {}) as { warranty?: string; warranty_until?: string };
  const firstSeller = d.messages.find(m => m.authorRole === 'seller');
  const firstTeam = d.messages.find(m => m.authorRole === 'team');
  const nameFor = (role: string) =>
    role === 'team' ? 'Gadgets Bidding team' : role === viewer ? 'You' : role === 'seller' ? 'The seller' : 'The buyer';
  const r = d.return;
  return {
    id: d.id,
    case_number: caseLabel(d.caseNumber),
    status: d.status,
    in_review: OPEN.includes(d.status || ''),
    outcome: d.outcome,
    findings: d.findings,
    next_step: d.nextStep ?? null,
    decided_at: d.decidedAt?.toISOString() ?? null,
    second_review_requested_at: d.secondReviewRequestedAt?.toISOString() ?? null,
    can_ask_second_review:
      viewer === 'buyer' && d.outcome === 'not_upheld' && !d.secondReviewRequestedAt && d.status === 'resolved',
    problem: { type: d.disputeType, label: PROBLEM_LABEL[d.disputeType] ?? 'Problem', description: d.description },
    photos: evidence.photos ?? [],
    videos: evidence.videos ?? [],
    /** Seconds for each video, same order as videos (null for older ones). */
    video_lengths: (evidence.videos ?? []).map(v => evidence.video_seconds?.[v] ?? null),
    /** What the hub found: [{ label, value }]. Empty until our team adds rows. */
    hub_findings: hubRowsOf(d.hubFindings),
    created_at: d.createdAt?.toISOString() ?? null,
    timeline: {
      reported_at: d.createdAt?.toISOString() ?? null,
      seller_replied_at: firstSeller?.createdAt.toISOString() ?? null,
      team_review_at: firstTeam?.createdAt.toISOString() ?? (d.status === 'investigating' ? d.updatedAt?.toISOString() : null) ?? null,
      decided_at: d.decidedAt?.toISOString() ?? null,
    },
    order: {
      id: o.id,
      order_number: o.orderNumber,
      total_amount: toNumber(o.totalAmount),
      delivery_fee: toNumber(o.deliveryFee),
      item_amount: toNumber(o.totalAmount) - toNumber(o.deliveryFee),
      payment_status: o.paymentStatus,
      delivery_method: o.deliveryMethod,
      shipping_address: viewer === 'seller' ? undefined : o.shippingAddress,
      paid_with: viewer === 'buyer' ? await paymentMethodLabel(o.id, o.orderNumber) : undefined,
      gadget: g
        ? {
            title: g.title,
            images: g.images,
            condition: g.condition,
            brand: g.brand,
            // From the listing: 'none' | 'seller' | 'manufacturer' | 'applecare'
            warranty: specs.warranty ?? null,
            // YYYY-MM-DD, only for a seller or manufacturer warranty
            warranty_until:
              (specs.warranty === 'seller' || specs.warranty === 'manufacturer') &&
              typeof specs.warranty_until === 'string' &&
              /^\d{4}-\d{2}-\d{2}$/.test(specs.warranty_until)
                ? specs.warranty_until
                : null,
          }
        : null,
    },
    messages: d.messages.map(m => ({
      id: m.id,
      role: m.authorRole,
      author: nameFor(m.authorRole),
      mine: viewer !== 'team' && m.authorId === viewerId,
      body: m.body,
      at: m.createdAt.toISOString(),
    })),
    return: r
      ? {
          method: r.method,
          code: r.returnCode,
          status: r.status,
          due_at: r.dueAt.toISOString(),
          started_at: r.startedAt.toISOString(),
          received_at: r.receivedAt?.toISOString() ?? null,
          refunded_at: r.refundedAt?.toISOString() ?? null,
          refund_destination: r.refundDestination,
          ...(viewer === 'buyer'
            ? {}
            : {
                seller_return_method: r.sellerReturnMethod,
                seller_return_chosen_at: r.sellerReturnChosenAt?.toISOString() ?? null,
                returned_to_seller_at: r.returnedToSellerAt?.toISOString() ?? null,
              }),
        }
      : null,
    seller: viewer === 'buyer' ? undefined : await sellerSide(d, viewer),
  };
};

/* ---------------- Buyer / seller ---------------- */

export const getCase = async (userId: string, disputeId: string) => {
  const { d, viewer } = await caseFor(userId, disputeId);
  return format(d, viewer, userId);
};

export const postMessage = async (userId: string, disputeId: string, raw: string) => {
  const body = raw.trim();
  if (body.length < 2) throw new Error('Write a message first.');
  if (body.length > 2000) throw new Error('Keep it under 2,000 characters.');
  const { d, viewer } = await caseFor(userId, disputeId);
  if (!OPEN.includes(d.status || '')) throw new Error('This case is closed, so messages are off.');
  await prisma.dispute.update({ where: { id: d.id }, data: { updatedAt: new Date() } });
  await prisma.disputeMessage.create({ data: { disputeId: d.id, authorId: userId, authorRole: viewer, body } });

  const label = caseLabel(d.caseNumber);
  const other = viewer === 'buyer' ? d.order!.sellerId : d.order!.buyerId;
  if (other) {
    notificationService
      .createNotification(
        other,
        'dispute_updated',
        `New message on case ${label}`,
        `${viewer === 'buyer' ? 'The buyer' : 'The seller'}: ${body.slice(0, 120)}`,
        // The seller app opens its own case screen for kind 'case'.
        viewer === 'buyer' ? { kind: 'case', disputeId: d.id, orderId: d.orderId } : { disputeId: d.id, orderId: d.orderId },
        ['push']
      )
      .catch(() => {});
  }
  notificationService
    .notifyAdmins('dispute_updated', `Case ${label}: new ${viewer} message`, body.slice(0, 160), {
      disputeId: d.id,
      route: '/disputes',
    })
    .catch(() => {});
  return getCase(userId, disputeId);
};

/** Short, readable return code (no 0/O/1/I): RT-7K3QX */
const newReturnCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(5);
  return `RT-${Array.from(bytes, b => alphabet[b % alphabet.length]).join('')}`;
};

export const startReturn = async (userId: string, disputeId: string, method: 'dropoff' | 'pickup') => {
  if (!['dropoff', 'pickup'].includes(method)) throw new Error('Choose drop-off or pickup.');
  const { d, viewer } = await caseFor(userId, disputeId);
  if (viewer !== 'buyer') throw new Error('Only the buyer can start the return.');
  if (d.outcome !== 'refund') throw new Error("This case wasn't decided as a refund.");
  if (d.return) return getCase(userId, disputeId);
  // Only while the seller's second review is open (a refund is otherwise always decided).
  if (OPEN.includes(d.status || '')) {
    throw new Error('Our team is taking another look at this case. You can start the return once they decide.');
  }
  const address = d.order!.shippingAddress;
  if (method === 'pickup' && !address) throw new Error('Add a delivery address to book a pickup, or drop it at the hub.');

  // The seller may already have chosen how to get it back (kept on the case until now).
  const sellerChoice = ((d.evidence ?? {}) as Evidence).seller_return;
  await prisma.disputeReturn.create({
    data: {
      disputeId: d.id,
      method,
      returnCode: newReturnCode(),
      pickupAddress: method === 'pickup' ? (address as any) : undefined,
      dueAt: new Date(Date.now() + RETURN_WINDOW_DAYS * DAY),
      ...(sellerChoice
        ? { sellerReturnMethod: sellerChoice.method, sellerReturnChosenAt: new Date(sellerChoice.chosen_at) }
        : {}),
    },
  });
  notificationService
    .notifyAdmins(
      'dispute_updated',
      `Return started for case ${caseLabel(d.caseNumber)}`,
      method === 'pickup' ? 'Book a rider to collect it from the buyer.' : 'The buyer will drop it at the hub.',
      { disputeId: d.id, route: '/disputes' }
    )
    .catch(() => {});
  logger.info(`Return started for case ${caseLabel(d.caseNumber)} (${method})`);
  return getCase(userId, disputeId);
};

export const askSecondReview = async (userId: string, disputeId: string) => {
  const { d, viewer } = await caseFor(userId, disputeId);
  if (viewer !== 'buyer') throw new Error('Only the buyer can ask for a second review.');
  if (d.outcome !== 'not_upheld' || d.secondReviewRequestedAt) {
    throw new Error("You've already used your second review for this case.");
  }
  await prisma.$transaction(async tx => {
    await tx.dispute.update({
      where: { id: d.id },
      data: { status: 'investigating', secondReviewRequestedAt: new Date(), updatedAt: new Date() },
    });
    // Hold the seller's money again while we look, unless it has already been paid out.
    await tx.order.updateMany({
      where: { id: d.orderId!, payoutStatus: { in: ['pending', 'ready'] } },
      data: { payoutStatus: 'held', updatedAt: new Date() },
    });
  });
  notificationService
    .notifyAdmins('dispute_updated', `Second review asked for case ${caseLabel(d.caseNumber)}`, d.description.slice(0, 160), {
      disputeId: d.id,
      route: '/disputes',
    })
    .catch(() => {});
  return getCase(userId, disputeId);
};

/* ---------------- Video evidence ---------------- */

const removeQuietly = (filePath: string) => {
  fs.promises.unlink(filePath).catch(() => logger.warn(`Could not delete upload: ${filePath}`));
};

/** Checked before the upload starts too: only the buyer, while the case is open, one video per case. */
export const checkCanAddVideo = async (userId: string, disputeId: string) => {
  const { d, viewer } = await caseFor(userId, disputeId);
  if (viewer !== 'buyer') throw new Error('Only the buyer can add a video.');
  if (!OPEN.includes(d.status || '')) throw new Error("This case is closed, so you can't add a video now.");
  if ((((d.evidence ?? {}) as Evidence).videos ?? []).length >= MAX_CASE_VIDEOS) {
    throw new Error("You've already added a video to this report.");
  }
  return d;
};

/** Case files go to Cloudinary when it's set up (PDFs as "raw" so they always download). */
const uploadToCloudinary = async (localPath: string, resourceType: 'video' | 'image' | 'raw' = 'video') => {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  });
  try {
    const result = await cloudinary.uploader.upload(localPath, {
      folder: 'gadget-bidding/cases',
      resource_type: resourceType,
    });
    logger.info(`Cloudinary ${resourceType} upload: ${result.public_id}`);
    return result.secure_url;
  } finally {
    removeQuietly(localPath);
  }
};
const uploadVideoToCloudinary = (localPath: string) => uploadToCloudinary(localPath, 'video');

/**
 * The buyer's video for their report (mp4/mov, up to 60 seconds). Stored like listing photos:
 * Cloudinary when it's set up, otherwise /uploads. Saved to evidence.videos.
 */
export const addVideo = async (userId: string, disputeId: string, file: Express.Multer.File) => {
  let d: Awaited<ReturnType<typeof checkCanAddVideo>>;
  let seconds: number | null;
  try {
    d = await checkCanAddVideo(userId, disputeId);
    seconds = videoDurationSeconds(file.path);
    if (seconds == null) throw new Error("We couldn't read that video. Try an MP4 or MOV file.");
    if (seconds > CASE_VIDEO_MAX_SECONDS + 1) {
      throw new Error(`That video is ${Math.round(seconds)} seconds. Trim it to ${CASE_VIDEO_MAX_SECONDS} seconds or less.`);
    }
  } catch (error) {
    removeQuietly(file.path);
    throw error;
  }

  const url = isCloudinaryEnabled() ? await uploadVideoToCloudinary(file.path) : buildUploadPath(file.filename);

  // Read again: another upload may have finished while this one was storing.
  const fresh = await prisma.dispute.findUnique({ where: { id: d.id }, select: { evidence: true } });
  const evidence = (fresh?.evidence ?? {}) as Evidence;
  const videos = evidence.videos ?? [];
  if (videos.length >= MAX_CASE_VIDEOS) {
    if (url.startsWith('/uploads/')) removeQuietly(file.path);
    throw new Error("You've already added a video to this report.");
  }
  await prisma.dispute.update({
    where: { id: d.id },
    data: {
      evidence: {
        ...evidence,
        videos: [...videos, url],
        // Its length, for "Video · 0:24" on the seller's side.
        video_seconds: { ...(evidence.video_seconds ?? {}), [url]: Math.round(seconds!) },
      },
      updatedAt: new Date(),
    },
  });

  // A video sent with the report arrives seconds after it; only tell the team about later ones.
  if (d.createdAt && Date.now() - d.createdAt.getTime() > 5 * 60_000) {
    notificationService
      .notifyAdmins('dispute_updated', `Case ${caseLabel(d.caseNumber)}: the buyer added a video`, 'Watch it in the case.', {
        disputeId: d.id,
        route: '/disputes',
      })
      .catch(() => {});
  }
  logger.info(`Video added to case ${caseLabel(d.caseNumber)}`);
  return getCase(userId, disputeId);
};

/* ---------------- Our team (admin) ---------------- */

export const getCaseForTeam = async (disputeId: string) => {
  const d = await loadCase(disputeId);
  if (!d?.order) throw new Error('Case not found');
  return format(d, 'team');
};

export const postTeamMessage = async (adminId: string, disputeId: string, raw: string) => {
  const body = raw.trim();
  if (!body) throw new Error('Write a message first.');
  const d = await loadCase(disputeId);
  if (!d?.order) throw new Error('Case not found');
  await prisma.$transaction([
    prisma.disputeMessage.create({ data: { disputeId, authorId: adminId, authorRole: 'team', body } }),
    // Our first reply means the team is on it.
    prisma.dispute.update({
      where: { id: disputeId },
      data: { status: d.status === 'open' ? 'investigating' : d.status, updatedAt: new Date() },
    }),
  ]);
  for (const uid of [d.order.buyerId, d.order.sellerId].filter(Boolean) as string[]) {
    notificationService
      .createNotification(
        uid,
        'dispute_updated',
        `Update on case ${caseLabel(d.caseNumber)}`,
        body.slice(0, 140),
        uid === d.order.sellerId ? { kind: 'case', disputeId, orderId: d.orderId } : { disputeId, orderId: d.orderId },
        ['push']
      )
      .catch(() => {});
  }
  return getCaseForTeam(disputeId);
};

/** The one-line "what happens next" the buyer sees under Team review. Empty clears it. */
export const setNextStep = async (disputeId: string, raw: string) => {
  const text = raw.trim().slice(0, 120);
  const d = await prisma.dispute.findUnique({ where: { id: disputeId }, select: { status: true } });
  if (!d) throw new Error('Case not found');
  if (!OPEN.includes(d.status || '')) throw new Error('This case is already decided.');
  await prisma.dispute.update({ where: { id: disputeId }, data: { nextStep: text || null, updatedAt: new Date() } });
  return getCaseForTeam(disputeId);
};

/** Our decision: refund (the item comes back first) or not upheld (the seller is paid). */
export const decide = async (adminId: string, disputeId: string, outcome: 'refund' | 'not_upheld', findings: string) => {
  if (!['refund', 'not_upheld'].includes(outcome)) throw new Error('Choose refund or not upheld.');
  if (findings.trim().length < 10) throw new Error('Tell the buyer what our team found (10 characters or more).');
  const d = await loadCase(disputeId);
  if (!d?.order) throw new Error('Case not found');
  if (!OPEN.includes(d.status || '')) throw new Error('This case is already decided.');
  await applyDecision(d, outcome, findings.trim(), { adminId });
  return getCaseForTeam(disputeId);
};

/**
 * Records a decision and tells the buyer and the seller. Our team's decision and the seller
 * accepting the return both come through here, so the buyer's return and refund start the same way.
 */
const applyDecision = async (
  d: LoadedCase,
  outcome: 'refund' | 'not_upheld',
  findings: string,
  by: { adminId: string } | { sellerAccepted: true }
) => {
  const now = new Date();
  const sellerAccepted = 'sellerAccepted' in by;
  await prisma.$transaction(async tx => {
    // Claim it while it's still open, so two decisions can't both land.
    const claimed = await tx.dispute.updateMany({
      where: { id: d.id, status: { in: OPEN } },
      data: {
        status: 'resolved',
        outcome,
        findings,
        resolution:
          outcome === 'refund'
            ? sellerAccepted
              ? 'Refund after return (seller accepted)'
              : 'Refund after return'
            : 'Not upheld: seller paid',
        decidedAt: now,
        resolvedAt: now,
        resolvedBy: 'adminId' in by ? by.adminId : null,
        ...(sellerAccepted ? { sellerAcceptedAt: now } : {}),
        updatedAt: now,
      },
    });
    if (!claimed.count) throw new Error('This case is already decided.');
    if (outcome === 'not_upheld') {
      // The buyer keeps the item and the seller is paid from escrow.
      await tx.order.update({
        where: { id: d.orderId! },
        data: {
          buyerConfirmedAt: d.order!.buyerConfirmedAt ?? now,
          payoutStatus: d.order!.payoutStatus === 'paid' ? 'paid' : 'ready',
          updatedAt: now,
        },
      });
    }
    // Refund: the seller's money stays held until the item is back at the hub.
  });

  const label = caseLabel(d.caseNumber);
  const o = d.order!;
  const title = o.auction?.gadget?.title ?? 'the item';
  if (o.buyerId) {
    notificationService
      .createNotification(
        o.buyerId,
        'dispute_updated',
        outcome === 'refund' ? "You'll get a full refund" : `Our decision on case ${label}`,
        outcome === 'refund'
          ? `Send the item back to the hub within ${RETURN_WINDOW_DAYS} days and we'll refund you as soon as it arrives.`
          : 'Our hub re-tested the item and found it matched the listing. See what we found.',
        { disputeId: d.id, orderId: d.orderId },
        ['push', 'email']
      )
      .catch(() => {});
  }
  // The seller hears the outcome in the words of their Case closed screen (not when they accepted it themselves).
  if (o.sellerId && !sellerAccepted) {
    const payout = toNumber(o.sellerPayout);
    notificationService
      .createNotification(
        o.sellerId,
        'dispute_updated',
        outcome === 'refund' ? `Case ${label} closed: buyer refunded` : `Case ${label} closed: decided in your favour`,
        outcome === 'refund'
          ? `The buyer gets their money back and the ${title} comes back to you. Choose how you'd like to get it back.`
          : o.payoutStatus === 'paid'
            ? `The buyer keeps the ${title}. Your payout for order ${o.orderNumber} was already sent.`
            : `Your ${naira(payout)} payout for order ${o.orderNumber} is released. It goes out in the next payout run.`,
        { kind: 'case', disputeId: d.id, orderId: d.orderId },
        ['push', 'email']
      )
      .catch(() => {});
  }
  if (sellerAccepted) {
    notificationService
      .notifyAdmins('dispute_updated', `Case ${label}: the seller accepted the return`, 'The buyer gets a full refund once the item is back at the hub.', {
        disputeId: d.id,
        route: '/disputes',
      })
      .catch(() => {});
  }
  logger.info(`Case ${label} decided: ${outcome}${sellerAccepted ? ' (seller accepted)' : ''}`);
};

/**
 * The returned item reached the hub: refund the buyer in full. Back to the card/bank through
 * Paystack when they paid that way, otherwise to their wallet. Runs once.
 */
export const markReturnReceived = async (disputeId: string) => {
  const d = await loadCase(disputeId);
  if (!d?.order || !d.return) throw new Error('No return has been started for this case.');
  if (d.return.status === 'refunded') return getCaseForTeam(disputeId);
  if (d.sellerSecondReviewRequestedAt && OPEN.includes(d.status || '')) {
    throw new Error('The seller asked for a second review. Decide it before refunding the buyer.');
  }
  const order = d.order;
  const amount = toNumber(order.totalAmount);

  // Record that it arrived before any money moves, so a retry never refunds twice.
  if (d.return.status === 'received' && d.return.refundReference) {
    throw new Error('A refund was already started for this case. Check it in Paystack before trying again.');
  }
  if (d.return.status === 'started') {
    // Only one caller can move it from started to received, so two clicks can't both refund.
    const claimed = await prisma.disputeReturn.updateMany({
      where: { disputeId, status: 'started' },
      data: { status: 'received', receivedAt: new Date() },
    });
    if (!claimed.count) throw new Error('This return is already being processed. Refresh the case.');
  }

  const cardTx = await cardPaymentFor(order.id);

  let destination: 'card' | 'wallet' = 'wallet';
  let reference = `RF-${order.orderNumber}`;
  if (cardTx?.gatewayReference) {
    reference = await startCardRefund(cardTx.gatewayReference);
    destination = 'card';
    await prisma.disputeReturn.update({ where: { disputeId }, data: { refundReference: reference, refundDestination: 'card' } });
  }

  await prisma.$transaction(async tx => {
    await tx.disputeReturn.update({
      where: { disputeId },
      data: {
        status: 'refunded',
        receivedAt: d.return!.receivedAt ?? new Date(),
        refundedAt: new Date(),
        refundDestination: destination,
        refundReference: reference,
      },
    });
    if (destination === 'wallet' && order.buyerId) {
      await creditBuyerWallet(
        tx,
        order.buyerId,
        amount,
        order.orderNumber,
        `Refund for case ${caseLabel(d.caseNumber)} (order ${order.orderNumber})`
      );
    }
    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'refunded', payoutStatus: 'held', updatedAt: new Date() },
    });
  });

  if (order.buyerId) {
    notificationService
      .createNotification(
        order.buyerId,
        'dispute_updated',
        'Your refund is on its way',
        destination === 'card'
          ? `We got the item back. ₦${amount.toLocaleString()} is going back to your card; banks usually take 3–5 working days.`
          : `We got the item back. ₦${amount.toLocaleString()} is in your wallet now.`,
        { disputeId, orderId: order.id },
        ['push', 'email']
      )
      .catch(() => {});
  }
  logger.info(`Case ${caseLabel(d.caseNumber)} refunded to ${destination}`);
  return getCaseForTeam(disputeId);
};

/* ---------------- The seller's side ---------------- */

/** The case, if this user is the order's seller. */
const sellerCase = async (userId: string, disputeId: string) => {
  const { d, viewer } = await caseFor(userId, disputeId);
  if (viewer !== 'seller') throw new Error('Only the seller can do this.');
  return d;
};

/** Read-modify-write disputes.evidence with the row locked, so two uploads can't overwrite each other. */
const updateEvidence = async (
  disputeId: string,
  change: (ev: Evidence, row: { sellerRepliedAt: Date | null; status: string | null }) => Evidence
) =>
  prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM disputes WHERE id = ${disputeId}::uuid FOR UPDATE`;
    const row = await tx.dispute.findUniqueOrThrow({
      where: { id: disputeId },
      select: { evidence: true, sellerRepliedAt: true, status: true },
    });
    const next = change((row.evidence ?? {}) as Evidence, row);
    await tx.dispute.update({ where: { id: disputeId }, data: { evidence: next as any, updatedAt: new Date() } });
  });

/**
 * The seller's reply: their position ('matched' | 'partly') and what happened (30+ characters).
 * Posted to the thread so the buyer and our team see it. Once per case, while it's open.
 */
export const sellerReply = async (userId: string, disputeId: string, position: string, raw: string) => {
  if (!['matched', 'partly'].includes(position)) throw new Error('Choose whether the item matched your listing.');
  const body = String(raw ?? '').trim();
  if (body.length < 30) throw new Error('Explain what happened in at least 30 characters.');
  if (body.length > 2000) throw new Error('Keep it under 2,000 characters.');
  const d = await sellerCase(userId, disputeId);
  if (!OPEN.includes(d.status || '')) throw new Error('This case is decided, so replies are closed.');
  if (d.sellerAcceptedAt) throw new Error("You've accepted the return for this case.");
  if (d.sellerRepliedAt) throw new Error("You've already replied to this case.");

  const now = new Date();
  await prisma.$transaction(async tx => {
    const claimed = await tx.dispute.updateMany({
      where: { id: d.id, sellerRepliedAt: null, sellerAcceptedAt: null, status: { in: OPEN } },
      data: { sellerPosition: position, sellerRepliedAt: now, updatedAt: now },
    });
    if (!claimed.count) throw new Error("You've already replied to this case.");
    // Same time as seller_replied_at, so the view can find this message as "your reply".
    await tx.disputeMessage.create({ data: { disputeId: d.id, authorId: userId, authorRole: 'seller', body, createdAt: now } });
  });

  const label = caseLabel(d.caseNumber);
  const files = (((d.evidence ?? {}) as Evidence).seller_files ?? []).length;
  notificationService
    .notifyAdmins(
      'dispute_updated',
      `Case ${label}: the seller replied`,
      `${POSITION_LABEL[position]}${files ? ` · ${files} file${files === 1 ? '' : 's'}` : ''}. ${body.slice(0, 120)}`,
      { disputeId: d.id, route: '/disputes' }
    )
    .catch(() => {});
  if (d.order!.buyerId) {
    notificationService
      .createNotification(
        d.order!.buyerId,
        'dispute_updated',
        `New message on case ${label}`,
        `The seller: ${body.slice(0, 120)}`,
        { disputeId: d.id, orderId: d.orderId },
        ['push']
      )
      .catch(() => {});
  }
  logger.info(`Case ${label}: seller replied (${position})`);
  return getCase(userId, disputeId);
};

/** Checked before the upload starts too: the seller, while the case is open and before they reply. */
export const checkCanAddSellerFile = async (userId: string, disputeId: string) => {
  const d = await sellerCase(userId, disputeId);
  if (!OPEN.includes(d.status || '')) throw new Error("This case is decided, so you can't add files now.");
  if (d.sellerAcceptedAt) throw new Error("You've accepted the return for this case.");
  if (d.sellerRepliedAt) throw new Error("You've already sent your reply.");
  if ((((d.evidence ?? {}) as Evidence).seller_files ?? []).length >= SELLER_FILE_MAX) {
    throw new Error(`You can add up to ${SELLER_FILE_MAX} files.`);
  }
  return d;
};

const fileKindOf = (mime: string): SellerFile['kind'] | null =>
  mime === 'application/pdf' ? 'pdf' : mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'photo' : null;

/** Starts with "%PDF-". */
const looksLikePdf = (filePath: string) => {
  const fd = fs.openSync(filePath, 'r');
  try {
    const head = Buffer.alloc(5);
    return fs.readSync(fd, head, 0, 5, 0) === 5 && head.toString('latin1') === '%PDF-';
  } finally {
    fs.closeSync(fd);
  }
};

const cleanFileName = (raw: unknown, kind: SellerFile['kind']) => {
  const base = String(raw ?? '')
    .split(/[\\/]/)
    .pop()!
    .replace(/[^\w .()\-]+/g, '')
    .trim()
    .slice(0, 80);
  return base || (kind === 'pdf' ? 'Receipt.pdf' : kind === 'video' ? 'Video' : 'Photo');
};

/**
 * A photo, a short video (mp4/mov, 60 seconds) or a PDF receipt for the seller's reply.
 * Stored like the buyer's video (Cloudinary when set up, else /uploads) in evidence.seller_files.
 */
export const addSellerFile = async (userId: string, disputeId: string, file: Express.Multer.File, name?: unknown) => {
  let d: Awaited<ReturnType<typeof checkCanAddSellerFile>>;
  let kind: SellerFile['kind'];
  let seconds: number | undefined;
  try {
    d = await checkCanAddSellerFile(userId, disputeId);
    const k = fileKindOf((file.mimetype || '').toLowerCase());
    if (!k) throw new Error('Add a photo, a video or a PDF.');
    kind = k;
    if (kind === 'video') {
      if ((((d.evidence ?? {}) as Evidence).seller_files ?? []).filter(f => f.kind === 'video').length >= SELLER_VIDEO_MAX) {
        throw new Error("You've already added a video. Remove it to add another.");
      }
      const s = videoDurationSeconds(file.path);
      if (s == null) throw new Error("We couldn't read that video. Try an MP4 or MOV file.");
      if (s > CASE_VIDEO_MAX_SECONDS + 1) {
        throw new Error(`That video is ${Math.round(s)} seconds. Trim it to ${CASE_VIDEO_MAX_SECONDS} seconds or less.`);
      }
      seconds = Math.round(s);
    } else {
      if (file.size > SELLER_FILE_MAX_MB * 1024 * 1024) throw new Error(`Photos and PDFs can be up to ${SELLER_FILE_MAX_MB} MB.`);
      if (kind === 'pdf' && !looksLikePdf(file.path)) throw new Error("That file isn't a PDF we can open.");
    }
  } catch (error) {
    removeQuietly(file.path);
    throw error;
  }

  const url = isCloudinaryEnabled()
    ? await uploadToCloudinary(file.path, kind === 'pdf' ? 'raw' : kind === 'video' ? 'video' : 'image')
    : buildUploadPath(file.filename);
  const entry: SellerFile = {
    url,
    kind,
    name: cleanFileName(name || file.originalname, kind),
    ...(seconds != null ? { seconds } : {}),
    added_at: new Date().toISOString(),
  };
  try {
    await updateEvidence(d.id, (ev, row) => {
      const list = ev.seller_files ?? [];
      if (row.sellerRepliedAt) throw new Error("You've already sent your reply.");
      if (list.length >= SELLER_FILE_MAX) throw new Error(`You can add up to ${SELLER_FILE_MAX} files.`);
      if (kind === 'video' && list.filter(f => f.kind === 'video').length >= SELLER_VIDEO_MAX) {
        throw new Error("You've already added a video.");
      }
      return { ...ev, seller_files: [...list, entry] };
    });
  } catch (error) {
    if (url.startsWith('/uploads/')) removeQuietly(file.path);
    throw error;
  }
  logger.info(`Case ${caseLabel(d.caseNumber)}: seller added a ${kind}`);
  return getCase(userId, disputeId);
};

/** Takes a file off the reply before it's sent. */
export const removeSellerFile = async (userId: string, disputeId: string, url: string) => {
  const d = await sellerCase(userId, disputeId);
  if (d.sellerRepliedAt) throw new Error("You've already sent your reply, so its files stay with it.");
  let removed: SellerFile | undefined;
  await updateEvidence(d.id, ev => {
    const list = ev.seller_files ?? [];
    removed = list.find(f => f.url === url);
    return { ...ev, seller_files: list.filter(f => f.url !== url) };
  });
  if (removed?.url.startsWith('/uploads/')) removeQuietly(`${process.cwd()}${removed.url}`);
  else if (removed) deleteFromCloudinary(removed.url);
  return getCase(userId, disputeId);
};

/** Best effort: a case file we stored on Cloudinary (image, video or raw PDF). */
const deleteFromCloudinary = (url: string) => {
  const m = /res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/upload\/(?:v\d+\/)?(.+)$/.exec(url);
  if (!m || !isCloudinaryEnabled()) return;
  const [, type, rest] = m;
  // Raw files keep their extension in the public id.
  const publicId = type === 'raw' ? rest : rest.replace(/\.[a-z0-9]+$/i, '');
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  });
  cloudinary.uploader
    .destroy(publicId, { resource_type: type })
    .then(() => logger.info(`Cloudinary deleted: ${publicId}`))
    .catch(error => logger.warn(`Cloudinary delete failed for ${publicId}: ${error?.message ?? error}`));
};

/**
 * The seller accepts the return and refund: decided as a refund straight away, the same way our
 * team decides one, so the buyer's return and refund start as usual.
 */
export const acceptRefund = async (userId: string, disputeId: string) => {
  const d = await sellerCase(userId, disputeId);
  if (d.sellerAcceptedAt) return getCase(userId, disputeId);
  if (!OPEN.includes(d.status || '')) throw new Error('This case is already decided.');
  if (d.outcome === 'refund') throw new Error('This case is already decided as a refund.');
  await applyDecision(d, 'refund', 'The seller accepted the return.', { sellerAccepted: true });
  return getCase(userId, disputeId);
};

/** Once, after a refund decision and before the buyer's refund goes out: our team looks again. */
export const askSellerSecondReview = async (userId: string, disputeId: string) => {
  const d = await sellerCase(userId, disputeId);
  if (d.outcome !== 'refund' || d.status !== 'resolved') {
    throw new Error('You can ask for a second review after a refund decision.');
  }
  if (d.sellerAcceptedAt) throw new Error('You accepted the return for this case.');
  if (d.sellerSecondReviewRequestedAt) throw new Error("You've already used your second review for this case.");
  if (d.return?.status === 'refunded' || d.return?.refundReference) {
    throw new Error("The buyer's refund has already gone out, so this case can't be reviewed again.");
  }
  const claimed = await prisma.dispute.updateMany({
    where: { id: d.id, status: 'resolved', outcome: 'refund', sellerSecondReviewRequestedAt: null },
    data: { status: 'investigating', sellerSecondReviewRequestedAt: new Date(), updatedAt: new Date() },
  });
  if (!claimed.count) throw new Error("You've already used your second review for this case.");
  notificationService
    .notifyAdmins(
      'dispute_updated',
      `Second review asked for case ${caseLabel(d.caseNumber)}`,
      "The seller disagrees with the refund. Decide again before refunding the buyer.",
      { disputeId: d.id, route: '/disputes' }
    )
    .catch(() => {});
  return getCase(userId, disputeId);
};

/**
 * How the seller gets the item back after a refund: 'collect' from the hub (free for 7 days) or
 * 'deliver' (a rider to their shop; one pending seller charge, taken off the next payout).
 * Switching back to 'collect' before it's handed back waives the charge.
 */
export const chooseSellerReturn = async (userId: string, disputeId: string, method: 'collect' | 'deliver') => {
  if (!['collect', 'deliver'].includes(method)) throw new Error('Choose collect or delivery.');
  const d = await sellerCase(userId, disputeId);
  if (d.outcome !== 'refund' || d.status !== 'resolved') {
    throw new Error('You can choose this once the case is decided as a refund.');
  }
  if (d.return?.returnedToSellerAt) throw new Error('The item is already back with you.');
  const charge = d.charges[0];
  if (method === 'collect' && charge?.status === 'applied') {
    throw new Error('The rider fee was already taken from a payout, so our rider will bring it to your shop.');
  }

  const now = new Date();
  await prisma.$transaction(async tx => {
    if (d.return) {
      await tx.disputeReturn.update({
        where: { disputeId: d.id },
        data: { sellerReturnMethod: method, sellerReturnChosenAt: now },
      });
    } else {
      // The buyer hasn't started their return yet: keep it on the case until they do.
      await tx.$queryRaw`SELECT id FROM disputes WHERE id = ${d.id}::uuid FOR UPDATE`;
      const row = await tx.dispute.findUniqueOrThrow({ where: { id: d.id }, select: { evidence: true } });
      const ev = (row.evidence ?? {}) as Evidence;
      await tx.dispute.update({
        where: { id: d.id },
        data: { evidence: { ...ev, seller_return: { method, chosen_at: now.toISOString() } } as any, updatedAt: now },
      });
    }
    if (method === 'deliver' && (!charge || charge.status === 'waived')) {
      await tx.sellerCharge.upsert({
        where: { disputeId_reason: { disputeId: d.id, reason: RETURN_DELIVERY_REASON } },
        create: {
          sellerId: d.order!.sellerId!,
          amount: SELLER_POLICY.returnDeliveryFee,
          reason: RETURN_DELIVERY_REASON,
          orderId: d.orderId,
          disputeId: d.id,
        },
        update: { status: 'pending', amount: SELLER_POLICY.returnDeliveryFee },
      });
    } else if (method === 'collect' && charge?.status === 'pending') {
      await tx.sellerCharge.update({ where: { id: charge.id }, data: { status: 'waived' } });
    }
  });

  notificationService
    .notifyAdmins(
      'dispute_updated',
      `Case ${caseLabel(d.caseNumber)}: ${method === 'deliver' ? 'rider to the seller' : 'seller will collect'}`,
      method === 'deliver'
        ? `Book a rider to the seller's shop once the item is back at the hub (${naira(SELLER_POLICY.returnDeliveryFee)} off their next payout).`
        : `The seller will collect it from the hub with code ${d.order!.orderNumber}.`,
      { disputeId: d.id, route: '/disputes' }
    )
    .catch(() => {});
  return getCase(userId, disputeId);
};

/* ---------------- Our team: hub findings and handing the item back ---------------- */

/** What the hub found, as rows the seller (and buyer) see. Up to 8; empty clears them. */
export const setHubFindings = async (disputeId: string, raw: unknown) => {
  if (!Array.isArray(raw)) throw new Error('Send the rows as a list.');
  const rows = raw
    .map(r => ({ label: String(r?.label ?? '').trim(), value: String(r?.value ?? '').trim() }))
    .filter(r => r.label || r.value);
  if (rows.length > 8) throw new Error('Keep it to 8 rows or fewer.');
  for (const r of rows) {
    if (!r.label || !r.value) throw new Error('Each row needs a label and a value.');
    if (r.label.length > 40) throw new Error(`Keep "${r.label.slice(0, 20)}…" to 40 characters.`);
    if (r.value.length > 60) throw new Error(`Keep the value for "${r.label}" to 60 characters.`);
  }
  const d = await prisma.dispute.findUnique({ where: { id: disputeId }, select: { id: true } });
  if (!d) throw new Error('Case not found');
  await prisma.dispute.update({
    where: { id: disputeId },
    data: { hubFindings: rows.length ? rows : Prisma.DbNull, updatedAt: new Date() },
  });
  return getCaseForTeam(disputeId);
};

/** The returned item left the hub with the seller (collected, or our rider dropped it at the shop). */
export const markReturnedToSeller = async (disputeId: string) => {
  const d = await loadCase(disputeId);
  if (!d?.order) throw new Error('Case not found');
  if (d.outcome !== 'refund') throw new Error('Only a refunded case has an item to hand back.');
  const r = d.return;
  if (!r || !['received', 'refunded'].includes(r.status)) throw new Error("The item isn't back at the hub yet.");
  if (r.returnedToSellerAt) return getCaseForTeam(disputeId);
  const ev = (d.evidence ?? {}) as Evidence;
  const method = r.sellerReturnMethod ?? ev.seller_return?.method ?? 'collect';
  await prisma.disputeReturn.update({
    where: { disputeId },
    data: {
      returnedToSellerAt: new Date(),
      sellerReturnMethod: method,
      sellerReturnChosenAt: r.sellerReturnChosenAt ?? (ev.seller_return ? new Date(ev.seller_return.chosen_at) : new Date()),
    },
  });
  if (d.order.sellerId) {
    const title = d.order.auction?.gadget?.title ?? 'item';
    notificationService
      .createNotification(
        d.order.sellerId,
        'dispute_updated',
        `Your ${title} is back with you`,
        method === 'deliver'
          ? `Our rider dropped it at your shop. ${naira(SELLER_POLICY.returnDeliveryFee)} comes off your next payout.`
          : `You collected it from the hub. Case ${caseLabel(d.caseNumber)} is closed.`,
        { kind: 'case', disputeId, orderId: d.orderId },
        ['push']
      )
      .catch(() => {});
  }
  logger.info(`Case ${caseLabel(d.caseNumber)}: item handed back to the seller (${method})`);
  return getCaseForTeam(disputeId);
};
