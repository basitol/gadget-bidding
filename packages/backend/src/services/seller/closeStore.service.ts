import { Request } from 'express';
import prisma from '../../config/prisma';
import { Prisma } from '../../generated/prisma';
import { comparePassword } from '../../utils/password';
import logger from '../../utils/logger';
import { caseLabel } from '../buyer/case.service';
import { sendEmail } from '../notification/email.service';
import { recordAuditEventSafe } from '../audit/audit.service';

/**
 * A seller closing their store (Store › Close my store). Everything in progress has to finish
 * first: live auctions, orders that haven't reached the buyer's confirmation, and open cases.
 * Money already earned is still paid at the 6 pm payout: the account stays active (is_active), only
 * users.store_closed_at is set, which stops new listings and logging in. Our team can reopen it.
 */

export class CloseStoreError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

type Row = {
  key: 'auctions' | 'orders' | 'disputes' | 'payouts';
  title: string;
  ok: boolean;
  sub: string;
  count: number;
  /** Where the link next to the row goes in the app. */
  action: { label: string; target: 'listings' | 'orders' | 'case'; dispute_id?: string } | null;
};

/** Orders still on their way: unpaid, paid but not yet confirmed by the buyer. Paid-out ones are done. */
const inProgressOrders = (sellerId: string): Prisma.OrderWhereInput => ({
  sellerId,
  AND: [
    { OR: [{ payoutStatus: null }, { payoutStatus: { notIn: ['ready', 'sending', 'paid'] } }] },
    {
      OR: [
        { paymentStatus: 'pending', fulfillmentStatus: { not: 'cancelled' } },
        { paymentStatus: 'paid', fulfillmentStatus: { not: 'cancelled' }, buyerConfirmedAt: null },
      ],
    },
  ],
});

const OPEN_CASE = ['open', 'investigating'];

const orderPhrase = (o: {
  paymentStatus: string | null;
  fulfillmentStatus: string | null;
  deliveryMethod: string;
  disputes: { id: string }[];
}) => {
  if (o.paymentStatus !== 'paid') return 'waiting for the buyer to pay';
  // A case ended in a refund: the item is coming back before the buyer's money is returned.
  if (o.disputes.length) return 'being returned after a refund';
  switch (o.fulfillmentStatus) {
    case 'sent_to_backoffice':
    case 'received_by_backoffice':
      return 'at the hub';
    case 'shipped':
      return o.deliveryMethod === 'pickup' ? 'ready for pickup' : 'on its way to the buyer';
    case 'delivered':
      return 'waiting for the buyer to confirm';
    default:
      return 'to drop at the hub';
  }
};

const andMore = (first: string, count: number) => (count > 1 ? `${first} and ${count - 1} more` : first);

export const getCloseChecklist = async (sellerId: string) => {
  const [user, live, orders, cases] = await Promise.all([
    prisma.user.findUnique({ where: { id: sellerId }, select: { storeClosedAt: true } }),
    prisma.auction.count({ where: { sellerId, status: 'active' } }),
    prisma.order.findMany({
      where: inProgressOrders(sellerId),
      select: {
        orderNumber: true,
        paymentStatus: true,
        fulfillmentStatus: true,
        deliveryMethod: true,
        disputes: { where: { outcome: 'refund' }, select: { id: true }, take: 1 },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.dispute.findMany({
      where: { status: { in: OPEN_CASE }, order: { sellerId } },
      select: { id: true, caseNumber: true, sellerRepliedAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  if (!user) throw new CloseStoreError('Account not found.', 404);

  const first = orders[0];
  const firstCase = cases[0];
  const items: Row[] = [
    {
      key: 'auctions',
      title: 'Live auctions',
      ok: live === 0,
      count: live,
      sub: live === 0 ? 'None running' : live === 1 ? '1 running · end it or wait for it' : `${live} running · end or wait for them`,
      action: live ? { label: 'My listings', target: 'listings' } : null,
    },
    {
      key: 'orders',
      title: 'Orders in progress',
      ok: orders.length === 0,
      count: orders.length,
      sub: first ? andMore(`${first.orderNumber} ${orderPhrase(first)}`, orders.length) : 'Nothing in progress',
      action: first ? { label: 'Orders', target: 'orders' } : null,
    },
    {
      key: 'disputes',
      title: 'Open disputes',
      ok: cases.length === 0,
      count: cases.length,
      sub: firstCase
        ? andMore(
            `${caseLabel(firstCase.caseNumber)} ${firstCase.sellerRepliedAt ? 'waiting for a decision' : 'waiting for your side'}`,
            cases.length
          )
        : 'None open',
      action: firstCase ? { label: 'View', target: 'case', dispute_id: firstCase.id } : null,
    },
    {
      key: 'payouts',
      title: 'Payouts',
      ok: true,
      count: 0,
      sub: 'We’ll pay what’s due before closing',
      action: null,
    },
  ];
  return {
    closed_at: user.storeClosedAt?.toISOString() ?? null,
    can_close: !user.storeClosedAt && items.every(i => i.ok),
    items,
  };
};

const page = (title: string, body: string[]) => `
  <div style="background:#F6F7FA;padding:32px 0;">
    <div style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;max-width:680px;margin:0 auto;background:#FFFFFF;border-radius:18px;padding:32px;">
      <div style="font-size:17px;font-weight:600;color:#1C1F2A;margin-bottom:24px;">Gadgets Bidding</div>
      <h1 style="font-size:22px;font-weight:600;color:#1C1F2A;margin:0 0 12px;">${title}</h1>
      ${body.map(p => `<p style="color:#5C6273;font-size:15px;line-height:1.6;margin:0 0 12px;">${p}</p>`).join('')}
      <p style="color:#7C8293;font-size:12px;line-height:1.6;margin:28px 0 0;border-top:1px solid #EDEFF4;padding-top:16px;">
        You're getting this because of a change to your seller account. We'll never ask for your password or PIN by email.
      </p>
    </div>
  </div>`;

/** Close the store: the password confirms it's them; refused while anything is still in progress. */
export const closeStore = async (sellerId: string, password: string, req?: Request) => {
  const user = await prisma.user.findUnique({
    where: { id: sellerId },
    select: { passwordHash: true, email: true, storeClosedAt: true },
  });
  if (!user) throw new CloseStoreError('Account not found.', 404);
  if (user.storeClosedAt) throw new CloseStoreError('Your store is already closed.');
  if (!password || !(await comparePassword(password, user.passwordHash))) {
    throw new CloseStoreError('That password didn’t match. Try again.');
  }
  const check = await getCloseChecklist(sellerId);
  if (!check.can_close) {
    const waiting = check.items.filter(i => !i.ok).map(i => i.title.toLowerCase());
    throw new CloseStoreError(`Your store can’t close yet: ${waiting.join(', ')} still need to finish.`, 409);
  }

  const now = new Date();
  const result = await prisma.$transaction(async tx => {
    // Listings that haven't started yet stop here (none can have bids).
    const scheduled = await tx.auction.findMany({
      where: { sellerId, status: 'scheduled', totalBids: 0 },
      select: { id: true, gadgetId: true },
    });
    if (scheduled.length) {
      await tx.auction.updateMany({ where: { id: { in: scheduled.map(a => a.id) } }, data: { status: 'cancelled', updatedAt: now } });
      const gadgetIds = scheduled.map(a => a.gadgetId).filter((g): g is string => !!g);
      if (gadgetIds.length) await tx.gadget.updateMany({ where: { id: { in: gadgetIds } }, data: { status: 'approved', updatedAt: now } });
    }
    // Listings waiting for our team won't go live. If the store reopens, they're under "Needs changes"
    // with this note and can be sent again.
    const withdrawn = await tx.gadget.updateMany({
      where: { sellerId, status: 'pending' },
      data: { status: 'rejected', rejectionReason: 'Your store closed before we checked this listing. Send it again to list it.', updatedAt: now },
    });
    // Check again inside the transaction: an auction may have started a moment ago.
    if (await tx.auction.count({ where: { sellerId, status: 'active' } })) {
      throw new CloseStoreError('An auction just went live. End it or wait for it to finish, then try again.', 409);
    }
    await tx.user.update({ where: { id: sellerId }, data: { storeClosedAt: now, updatedAt: now } });
    const signedOut = await tx.refreshToken.updateMany({ where: { userId: sellerId, isRevoked: false }, data: { isRevoked: true } });
    return { scheduled: scheduled.length, withdrawn: withdrawn.count, signedOut: signedOut.count };
  });

  recordAuditEventSafe({
    req,
    userId: sellerId,
    action: 'seller_store_closed',
    resourceType: 'user',
    resourceId: sellerId,
    changes: {
      store_closed_at: now.toISOString(),
      scheduled_auctions_ended: result.scheduled,
      listings_withdrawn: result.withdrawn,
      sessions_signed_out: result.signedOut,
    },
  });
  logger.info(`Seller ${sellerId} closed their store`);

  if (user.email) {
    void sendEmail({
      to: user.email,
      subject: 'Your store is closed',
      html: page('Your store is closed', [
        'Your listings have stopped and you can no longer log in to sell.',
        'Money you’re owed is still paid to your payout account at the 6 pm payout.',
        'Want to sell again? Reply to this email or contact us and we’ll reopen it.',
      ]),
    }).catch(err => logger.error('Store closed email failed:', err));
  }
  return { closed_at: now.toISOString() };
};

/* ---------------- Our team's side ---------------- */

export const getStoreStatusForTeam = async (sellerId: string) => {
  const user = await prisma.user.findUnique({ where: { id: sellerId }, select: { storeClosedAt: true, role: true } });
  if (!user) throw new CloseStoreError('Seller not found.', 404);
  return { closed_at: user.storeClosedAt?.toISOString() ?? null };
};

/** "Reopen store": they can log in and list again (listings stopped on closing are sent again by the seller). */
export const reopenStore = async (sellerId: string, req?: Request) => {
  const user = await prisma.user.findUnique({ where: { id: sellerId }, select: { storeClosedAt: true, email: true } });
  if (!user) throw new CloseStoreError('Seller not found.', 404);
  if (!user.storeClosedAt) throw new CloseStoreError('This store is open.');
  await prisma.user.update({ where: { id: sellerId }, data: { storeClosedAt: null, updatedAt: new Date() } });
  recordAuditEventSafe({
    req,
    action: 'seller_store_reopened',
    resourceType: 'user',
    resourceId: sellerId,
    changes: { store_closed_at: user.storeClosedAt.toISOString() },
  });
  if (user.email) {
    void sendEmail({
      to: user.email,
      subject: 'Your store is open again',
      html: page('Your store is open again', [
        'You can log in to the seller app and list gadgets again.',
        'Listings that were waiting for our check when you closed are under Needs changes. Send them again to list them.',
      ]),
    }).catch(err => logger.error('Store reopened email failed:', err));
  }
  return { closed_at: null };
};
