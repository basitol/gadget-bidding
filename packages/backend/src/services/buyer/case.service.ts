import { randomBytes } from 'crypto';
import prisma from '../../config/prisma';
import logger from '../../utils/logger';
import { applyBalanceDelta } from '../../utils/wallet-balance';
import * as notificationService from '../notification/notification.service';
import * as paystackService from '../payment/paystack.service';
import { paymentMethodLabel } from '../order/order.service';

/**
 * Problem reports as "cases" (D-119): what the buyer reported, a thread between buyer,
 * seller and our team, the decision (refund or not upheld) and, for refunds, the return.
 */

export const RETURN_WINDOW_DAYS = 5;
const DAY = 24 * 3_600_000;

const toNumber = (v: unknown) => (v == null ? 0 : Number(String(v)));
export const caseLabel = (n: number) => `D-${n}`;

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

const loadCase = (disputeId: string) =>
  prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      order: { include: { auction: { include: { gadget: true } } } },
      messages: { orderBy: { createdAt: 'asc' } },
      return: true,
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

const format = async (d: LoadedCase, viewer: Viewer, viewerId?: string) => {
  const o = d.order!;
  const g = o.auction?.gadget;
  const evidence = (d.evidence ?? {}) as { photos?: string[] };
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
            warranty: ((g.specifications ?? {}) as { warranty?: string }).warranty ?? null,
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
        }
      : null,
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
        { disputeId: d.id, orderId: d.orderId },
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
  const address = d.order!.shippingAddress;
  if (method === 'pickup' && !address) throw new Error('Add a delivery address to book a pickup, or drop it at the hub.');

  await prisma.disputeReturn.create({
    data: {
      disputeId: d.id,
      method,
      returnCode: newReturnCode(),
      pickupAddress: method === 'pickup' ? (address as any) : undefined,
      dueAt: new Date(Date.now() + RETURN_WINDOW_DAYS * DAY),
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
        { disputeId, orderId: d.orderId },
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

  await prisma.$transaction(async tx => {
    await tx.dispute.update({
      where: { id: disputeId },
      data: {
        status: 'resolved',
        outcome,
        findings: findings.trim(),
        resolution: outcome === 'refund' ? 'Refund after return' : 'Not upheld: seller paid',
        decidedAt: new Date(),
        resolvedAt: new Date(),
        resolvedBy: adminId,
        updatedAt: new Date(),
      },
    });
    if (outcome === 'not_upheld') {
      // The buyer keeps the item and the seller is paid from escrow.
      await tx.order.update({
        where: { id: d.orderId! },
        data: {
          buyerConfirmedAt: d.order!.buyerConfirmedAt ?? new Date(),
          payoutStatus: d.order!.payoutStatus === 'paid' ? 'paid' : 'ready',
          updatedAt: new Date(),
        },
      });
    }
    // Refund: the seller's money stays held until the item is back at the hub.
  });

  const label = caseLabel(d.caseNumber);
  if (d.order.buyerId) {
    notificationService
      .createNotification(
        d.order.buyerId,
        'dispute_updated',
        outcome === 'refund' ? "You'll get a full refund" : `Our decision on case ${label}`,
        outcome === 'refund'
          ? `Send the item back to the hub within ${RETURN_WINDOW_DAYS} days and we'll refund you as soon as it arrives.`
          : 'Our hub re-tested the item and found it matched the listing. See what we found.',
        { disputeId, orderId: d.orderId },
        ['push', 'email']
      )
      .catch(() => {});
  }
  logger.info(`Case ${label} decided: ${outcome}`);
  return getCaseForTeam(disputeId);
};

/**
 * The returned item reached the hub: refund the buyer in full. Back to the card/bank through
 * Paystack when they paid that way, otherwise to their wallet. Runs once.
 */
export const markReturnReceived = async (disputeId: string) => {
  const d = await loadCase(disputeId);
  if (!d?.order || !d.return) throw new Error('No return has been started for this case.');
  if (d.return.status === 'refunded') return getCaseForTeam(disputeId);
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

  const cardTx = await prisma.paymentTransaction.findFirst({
    where: { status: 'success', paymentGateway: 'paystack', metadata: { path: ['order_id'], equals: order.id } },
    orderBy: { updatedAt: 'desc' },
  });

  let destination: 'card' | 'wallet' = 'wallet';
  let reference = `RF-${order.orderNumber}`;
  if (cardTx?.gatewayReference) {
    const refund = await paystackService.refundTransaction(cardTx.gatewayReference);
    destination = 'card';
    reference = refund.id ? `PSR-${refund.id}` : `PSR-${cardTx.gatewayReference}`;
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
      const wallet = await tx.wallet.findUnique({ where: { userId: order.buyerId } });
      if (!wallet) throw new Error('Buyer wallet not found');
      const { balanceBefore, balanceAfter } = await applyBalanceDelta(tx, wallet.id, amount);
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          transactionType: 'refund',
          amount,
          balanceBefore,
          balanceAfter,
          reference: order.orderNumber,
          description: `Refund for case ${caseLabel(d.caseNumber)} (order ${order.orderNumber})`,
          status: 'completed',
        },
      });
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
