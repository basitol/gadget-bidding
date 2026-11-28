import prisma from '../../config/prisma';
import logger from '../../utils/logger';
import { hashPassword } from '../../utils/password';
import { isOTPExpired } from '../../utils/otp';
import { SELLER_POLICY } from '@gadget-bidding/shared';
import {
  USER_SELECT,
  issueSignupCode,
  issueTokensForUser,
  makeSyntheticPhone,
  toPublicUser,
} from '../auth/auth.service';
import { updateFulfillmentStatus } from '../order/order.service';
import { sellerPasswordProblem } from './sellerApplication.service';
import { getDropoffCodes, getSellerOrders } from './sellerTabs.service';
import { STAFF_ID_PHRASE, StaffIdType, staffIdLabel, storeNameFor } from './store.service';

/**
 * Store staff accounts. The owner adds someone by email (store.service addStaff); they join from
 * the seller log in ("I was added to a store team"): their email → emailed code → password. After
 * that they log in like any seller, with that email and password.
 *
 * A staff account (role "staff") sees only its store's hub work: what to drop off, what to collect,
 * and what's on its way. Never payouts, money, buyers or store settings.
 */

export class StaffError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

const DAY_MS = 86_400_000;
const NOT_ON_TEAM = "You're no longer on a store team. Ask the store owner to add you again.";

/* ---------------- Joining from the invite ---------------- */

const findInvite = (email: string) =>
  prisma.storeStaff.findUnique({
    where: { email },
    select: { id: true, userId: true, fullName: true, seller: { select: { storeClosedAt: true } } },
  });

/** Step 1: the email the owner added. We email a 6-digit code to prove it's theirs. */
export const startStaffJoin = async (rawEmail: string) => {
  const email = rawEmail.trim().toLowerCase();
  const invite = await findInvite(email);
  if (!invite) {
    throw new StaffError("We can't find an invite for this email. Ask the store owner to add you with this exact email.");
  }
  if (invite.userId) throw new StaffError("You've already set up your sign-in. Log in with this email instead.");
  if (invite.seller.storeClosedAt) throw new StaffError('This store is closed, so it can’t add staff.');
  return { ...(await issueSignupCode(email)), full_name: invite.fullName };
};

/** Step 3 (after the code): choose a password. Makes the staff account and signs them in. */
export const completeStaffJoin = async (data: { verification_id: string; password: string }) => {
  const problem = sellerPasswordProblem(data.password);
  if (problem) throw new StaffError(problem);
  const passwordHash = await hashPassword(data.password);
  const phoneNumber = await makeSyntheticPhone();

  return prisma.$transaction(async tx => {
    const v = await tx.userVerification.findFirst({
      where: { id: data.verification_id, verificationType: 'email', userId: null },
    });
    if (!v || !v.target || !v.isVerified) throw new StaffError('Confirm your email first.');
    if (!v.expiresAt || isOTPExpired(v.expiresAt)) throw new StaffError('This has expired. Start again.');
    const email = v.target;

    const invite = await tx.storeStaff.findUnique({ where: { email } });
    if (!invite) throw new StaffError('Your invite was cancelled. Ask the store owner to add you again.');
    if (invite.userId) throw new StaffError("You've already set up your sign-in. Log in with this email instead.");

    // One email, one account. A staff account from a team they were removed from rejoins here.
    const existing = await tx.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, role: true, isActive: true, staffOf: { select: { id: true } } },
    });
    if (existing && existing.role !== 'staff') {
      throw new StaffError('This email already has a Gadgets Bidding account. Ask the store owner to use a different email.');
    }
    if (existing?.staffOf) throw new StaffError("This email is already on another store's team.");
    if (existing && existing.isActive === false) throw new StaffError('This account is suspended. Contact support.');

    const user = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: { passwordHash, fullName: invite.fullName, isVerified: true, updatedAt: new Date() },
          select: USER_SELECT,
        })
      : await tx.user.create({
          data: {
            // Staff accounts sign in with email; the phone on the invite stays on the staff row.
            phoneNumber,
            email,
            fullName: invite.fullName,
            passwordHash,
            role: 'staff',
            isVerified: true,
          },
          select: USER_SELECT,
        });

    await tx.storeStaff.update({ where: { id: invite.id }, data: { userId: user.id, joinedAt: new Date() } });
    await tx.userVerification.delete({ where: { id: v.id } });

    const { access_token, refresh_token } = await issueTokensForUser(user, tx);
    logger.info(`Store staff joined: ${user.id} (store ${invite.sellerId})`);
    return { access_token, refresh_token, user: toPublicUser(user) };
  });
};

/* ---------------- Signed in as staff ---------------- */

/** The team this staff account is on. Throws (403) once they're removed or the store closes. */
export const staffTeamOf = async (userId: string) => {
  const row = await prisma.storeStaff.findUnique({
    where: { userId },
    select: {
      id: true,
      sellerId: true,
      fullName: true,
      email: true,
      idType: true,
      pickupCode: true,
      seller: { select: { storeClosedAt: true } },
    },
  });
  if (!row) throw new StaffError(NOT_ON_TEAM, 403);
  if (row.seller.storeClosedAt) throw new StaffError('This store is closed, so staff sign-in is off.', 403);
  return row;
};

/** Returned items at the hub waiting for the store to collect them (a refunded case). */
const toCollect = async (sellerId: string) => {
  const rows = await prisma.disputeReturn.findMany({
    where: {
      status: { in: ['received', 'refunded'] },
      returnedToSellerAt: null,
      OR: [{ sellerReturnMethod: null }, { sellerReturnMethod: 'collect' }],
      dispute: { outcome: 'refund', order: { sellerId } },
    },
    select: {
      receivedAt: true,
      refundedAt: true,
      dispute: {
        select: {
          id: true,
          order: { select: { id: true, orderNumber: true, auction: { select: { gadget: { select: { title: true, images: true } } } } } },
        },
      },
    },
  });
  return rows
    .map(r => {
      const atHub = r.receivedAt ?? r.refundedAt;
      const o = r.dispute.order;
      const images = (o?.auction?.gadget?.images ?? []) as unknown;
      return {
        order_id: o?.id ?? null,
        /** Hub staff look it up by the order number, same as a drop-off. */
        code: o?.orderNumber ?? '',
        title: o?.auction?.gadget?.title ?? 'Gadget',
        image: Array.isArray(images) && typeof images[0] === 'string' ? (images[0] as string) : null,
        at_hub_since: atHub?.toISOString() ?? null,
        free_until: atHub ? new Date(atHub.getTime() + SELLER_POLICY.freeCollectionDays * DAY_MS).toISOString() : null,
      };
    })
    .sort((a, b) => (a.free_until ?? '').localeCompare(b.free_until ?? ''));
};

/** GET /staff/home — everything the staff app shows: their hub code, drop-offs, collections, on the way. */
export const getStaffHome = async (userId: string) => {
  const me = await staffTeamOf(userId);
  const [store, dropoff, collect, progress] = await Promise.all([
    storeNameFor(me.sellerId),
    getDropoffCodes(me.sellerId),
    toCollect(me.sellerId),
    getSellerOrders(me.sellerId, 'progress'),
  ]);
  const idType = (me.idType && me.idType in STAFF_ID_PHRASE ? me.idType : null) as StaffIdType | null;
  return {
    store: { name: store },
    me: {
      full_name: me.fullName,
      email: me.email,
      id_label: staffIdLabel(me.idType),
      id_phrase: idType ? STAFF_ID_PHRASE[idType] : 'your ID',
      pickup_code: me.pickupCode,
    },
    hub: { address: SELLER_POLICY.hubAddress },
    dropoff,
    collect,
    // No money: staff see what's moving, not what it sold for.
    on_the_way: progress.items.map(o => ({
      id: o.id,
      order_number: o.order_number,
      title: o.title,
      image: o.image,
      chip: o.chip,
    })),
  };
};

/** POST /staff/orders/:id/dropped-off — the item is with our hub team (same as the owner's "Send to hub"). */
export const markDroppedOff = async (userId: string, orderId: string) => {
  const me = await staffTeamOf(userId);
  const due = await getDropoffCodes(me.sellerId);
  if (!due.some(d => d.order_id === orderId)) throw new StaffError('This item is no longer waiting to be dropped off.', 409);
  await updateFulfillmentStatus(orderId, me.sellerId, 'sent_to_backoffice');
  logger.info(`Staff ${userId} marked order ${orderId} dropped off`);
  return getStaffHome(userId);
};
