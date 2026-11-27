import { isSellerRole } from '@gadget-bidding/shared';
import prisma from '../../config/prisma';
import { emitToUser, emitToSupportThread } from '../socket/socket.service';
import logger from '../../utils/logger';
import * as notificationService from '../notification/notification.service';

/**
 * Support chat between one user and the admin team. Buyers and sellers each get one open
 * thread (keyed by user + role); a buyer's thread can also point at the order they last
 * wrote about. Buyers only ever see the order number and gadget, never the seller.
 */

export type OwnerRole = 'buyer' | 'seller';
export const ownerRoleFor = (role?: string | null): OwnerRole =>
  isSellerRole(role) ? 'seller' : 'buyer';

type Owner = { userId: string; role: string };

const preview = (body: string) =>
  body.length > 120 ? `${body.slice(0, 117)}...` : body;

const iso = (d: any) => d?.toISOString?.() || d || null;

const orderSelect = {
  id: true,
  orderNumber: true,
  buyerId: true,
  sellerId: true,
  auction: { select: { gadget: { select: { title: true } } } },
} as const;

const mapOrder = (o: any) =>
  o
    ? {
        id: o.id,
        order_number: o.orderNumber,
        title: o.auction?.gadget?.title ?? null,
      }
    : null;

const mapMessage = (m: any) => ({
  id: m.id,
  thread_id: m.threadId,
  sender_id: m.senderId,
  body: m.body,
  created_at: iso(m.createdAt),
  sender: m.sender
    ? {
        id: m.sender.id,
        full_name: m.sender.fullName,
        role: m.sender.role,
      }
    : undefined,
});

/** What the thread's owner sees in the app. */
const mapThreadForOwner = (t: any) => ({
  id: t.id,
  owner_role: t.ownerRole,
  status: t.status,
  subject: t.subject,
  last_message_at: iso(t.lastMessageAt),
  last_message_preview: t.lastMessagePreview,
  unread_count: t.ownerUnreadCount,
  created_at: iso(t.createdAt),
  order: mapOrder(t.order),
});

/** What admins see in the Support inbox. */
const mapThreadForAdmin = (t: any) => ({
  id: t.id,
  user_id: t.userId,
  owner_role: t.ownerRole,
  status: t.status,
  subject: t.subject,
  last_message_at: iso(t.lastMessageAt),
  last_message_preview: t.lastMessagePreview,
  owner_unread_count: t.ownerUnreadCount,
  admin_unread_count: t.adminUnreadCount,
  created_at: iso(t.createdAt),
  user: t.user
    ? {
        id: t.user.id,
        full_name: t.user.fullName,
        // Email sign-ups get a placeholder +9… number; staff should see the email instead.
        phone_number: String(t.user.phoneNumber || '').startsWith('+9') ? null : t.user.phoneNumber,
        email: t.user.email ?? null,
        business_name: t.user.businessName,
      }
    : undefined,
  order: mapOrder(t.order),
});

const adminInclude = {
  user: {
    select: {
      id: true,
      fullName: true,
      phoneNumber: true,
      email: true,
      businessName: true,
    },
  },
  order: { select: orderSelect },
} as const;

/** The order, if this user is its buyer or seller. */
const findOwnOrder = async (orderId: string, userId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: orderSelect,
  });
  if (!order || (order.buyerId !== userId && order.sellerId !== userId)) {
    throw new Error('Order not found');
  }
  return order;
};

/**
 * The user's open thread, created on first use. With `orderId`, the returned `order` is that
 * order (checked to be theirs) so the app can show what the chat is about; the thread is only
 * linked to it once they send a message about it.
 */
export const getOrCreateThread = async (
  owner: Owner,
  opts: { orderId?: string } = {}
) => {
  const ownerRole = ownerRoleFor(owner.role);
  const askedOrder = opts.orderId
    ? await findOwnOrder(opts.orderId, owner.userId)
    : null;

  let thread = await prisma.supportThread.findFirst({
    where: { userId: owner.userId, ownerRole, status: 'open' },
    include: { order: { select: orderSelect } },
    orderBy: { lastMessageAt: 'desc' },
  });

  if (!thread) {
    thread = await prisma.supportThread.create({
      data: {
        userId: owner.userId,
        ownerRole,
        subject: 'Support',
        status: 'open',
      },
      include: { order: { select: orderSelect } },
    });
  }

  const mapped = mapThreadForOwner(thread);
  return askedOrder ? { ...mapped, order: mapOrder(askedOrder) } : mapped;
};

export const getThreadMessages = async (
  threadId: string,
  opts: { page?: number; limit?: number } = {}
) => {
  const page = opts.page && opts.page > 0 ? opts.page : 1;
  const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 100) : 50;
  const skip = (page - 1) * limit;

  const [messages, total] = await Promise.all([
    prisma.supportMessage.findMany({
      where: { threadId },
      include: {
        sender: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { createdAt: 'asc' },
      skip,
      take: limit,
    }),
    prisma.supportMessage.count({ where: { threadId } }),
  ]);

  return {
    data: messages.map(mapMessage),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

export const assertOwnsThread = async (threadId: string, userId: string) => {
  const thread = await prisma.supportThread.findFirst({
    where: { id: threadId, userId },
  });
  if (!thread) throw new Error('Thread not found');
  return thread;
};

/** Whether this user may watch the thread live (its owner, or any admin). */
export const canWatchThread = async (
  threadId: string,
  user: { user_id: string; role: string }
) => {
  if (user.role === 'admin') return true;
  const thread = await prisma.supportThread.findUnique({
    where: { id: threadId },
    select: { userId: true },
  });
  return thread?.userId === user.user_id;
};

export const sendOwnerMessage = async (
  threadId: string,
  userId: string,
  body: string,
  opts: { orderId?: string; subject?: string } = {}
) => {
  const text = body.trim();
  if (!text) throw new Error('Write a message first.');
  if (text.length > 2000) throw new Error('Keep it under 2,000 characters.');

  const thread = await assertOwnsThread(threadId, userId);
  const order = opts.orderId ? await findOwnOrder(opts.orderId, userId) : null;

  const message = await prisma.$transaction(async tx => {
    const msg = await tx.supportMessage.create({
      data: {
        threadId,
        senderId: userId,
        body: text,
      },
      include: {
        sender: { select: { id: true, fullName: true, role: true } },
      },
    });

    await tx.supportThread.update({
      where: { id: threadId },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: preview(text),
        adminUnreadCount: { increment: 1 },
        ownerUnreadCount: 0,
        status: 'open',
        ...(opts.subject ? { subject: opts.subject.slice(0, 255) } : {}),
        updatedAt: new Date(),
        ...(order ? { orderId: order.id } : {}),
      },
    });

    return msg;
  });

  const payload = mapMessage(message);
  const event = { thread_id: threadId, message: payload };

  // Room + direct emits so both open clients and offline-targeted users get it
  emitToSupportThread(threadId, 'support:message', event);
  const admins = await prisma.user.findMany({
    where: { role: 'admin', isActive: true },
    select: { id: true },
  });
  for (const admin of admins) {
    emitToUser(admin.id, 'support:message', event);
  }

  const who =
    payload.sender?.full_name ||
    (thread.ownerRole === 'buyer' ? 'A buyer' : 'A seller');
  notificationService
    .notifyBackofficeSupportMessage(
      threadId,
      `${who} (${thread.ownerRole})`,
      preview(text)
    )
    .catch(error => {
      logger.error('Failed to notify backoffice about support message:', error);
    });

  logger.info(
    `Support message from ${thread.ownerRole} ${userId} on thread ${threadId}`
  );
  return payload;
};

/* ---------------- Contact support (Help › Contact support) ---------------- */

export const CONTACT_TOPICS = {
  order: 'An order',
  paying: 'Paying',
  account: 'My account',
  other: 'Something else',
} as const;
export type ContactTopic = keyof typeof CONTACT_TOPICS;
export const CONTACT_MIN_LENGTH = 10;
/** What the app promises: "We reply within 1 working day". */
export const REPLY_WITHIN = '1 working day';

/**
 * The Contact support form: a topic, an optional order and a message. It lands in the
 * person's own support thread (the same one as Chat with support) with the topic and
 * order on top, so staff see them first. The order is linked to the thread.
 */
export const contactSupport = async (
  owner: Owner,
  input: { topic: string; order_id?: string | null; body: string }
) => {
  const topic = input.topic as ContactTopic;
  if (!CONTACT_TOPICS[topic]) throw new Error("Choose what it's about.");
  const text = String(input.body || '').trim();
  if (text.length < CONTACT_MIN_LENGTH) {
    throw new Error(`Tell us a bit more (at least ${CONTACT_MIN_LENGTH} characters).`);
  }
  if (text.length > 1800) throw new Error('Keep it under 1,800 characters.');

  let order: Awaited<ReturnType<typeof findOwnOrder>> | null = null;
  if (input.order_id) {
    order = await findOwnOrder(input.order_id, owner.userId).catch(() => {
      throw new Error("We couldn't find that order on your account. Choose another or leave it empty.");
    });
  }
  const orderLabel = order
    ? [order.orderNumber, order.auction?.gadget?.title].filter(Boolean).join(' · ')
    : null;

  const subject = [CONTACT_TOPICS[topic], orderLabel].filter(Boolean).join(' · ');
  const thread = await getOrCreateThread(owner);
  const message = await sendOwnerMessage(thread.id, owner.userId, `Topic: ${subject}\n\n${text}`, {
    subject,
    orderId: order?.id,
  });

  return {
    thread_id: thread.id,
    message,
    topic,
    order_id: order?.id ?? null,
    reply_within: REPLY_WITHIN,
  };
};

export const markOwnerThreadRead = async (threadId: string, userId: string) => {
  await assertOwnsThread(threadId, userId);
  await prisma.supportThread.update({
    where: { id: threadId },
    data: { ownerUnreadCount: 0 },
  });
};

/** Admin */
export const listThreadsForAdmin = async (opts: {
  status?: string;
  role?: string;
  page?: number;
  limit?: number;
  search?: string;
}) => {
  const page = opts.page && opts.page > 0 ? opts.page : 1;
  const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 100) : 20;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (opts.status && opts.status !== 'all') where.status = opts.status;
  if (opts.role === 'buyer' || opts.role === 'seller')
    where.ownerRole = opts.role;
  if (opts.search) {
    where.OR = [
      {
        user: {
          OR: [
            { fullName: { contains: opts.search, mode: 'insensitive' } },
            { businessName: { contains: opts.search, mode: 'insensitive' } },
            { email: { contains: opts.search, mode: 'insensitive' } },
            { phoneNumber: { contains: opts.search } },
          ],
        },
      },
      {
        order: { orderNumber: { contains: opts.search, mode: 'insensitive' } },
      },
    ];
  }

  const [threads, total] = await Promise.all([
    prisma.supportThread.findMany({
      where,
      include: adminInclude,
      orderBy: { lastMessageAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.supportThread.count({ where }),
  ]);

  return {
    data: threads.map(mapThreadForAdmin),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

export const sendAdminMessage = async (
  threadId: string,
  adminId: string,
  body: string
) => {
  const text = body.trim();
  if (!text) throw new Error('Message cannot be empty');
  if (text.length > 2000) throw new Error('Message is too long');

  const thread = await prisma.supportThread.findUnique({
    where: { id: threadId },
  });
  if (!thread) throw new Error('Thread not found');

  const message = await prisma.$transaction(async tx => {
    const msg = await tx.supportMessage.create({
      data: {
        threadId,
        senderId: adminId,
        body: text,
      },
      include: {
        sender: { select: { id: true, fullName: true, role: true } },
      },
    });

    await tx.supportThread.update({
      where: { id: threadId },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: preview(text),
        ownerUnreadCount: { increment: 1 },
        adminUnreadCount: 0,
        status: 'open',
        updatedAt: new Date(),
      },
    });

    return msg;
  });

  const payload = mapMessage(message);
  const event = { thread_id: threadId, message: payload };
  emitToSupportThread(threadId, 'support:message', event);
  emitToUser(thread.userId, 'support:message', event);

  // A phone alert too, so they see the reply with the app closed. Buyers also get it by
  // email: Help › Contact support promises a reply, and they may not open the app for it.
  notificationService
    .createNotification(
      thread.userId,
      'support_message',
      'Support replied',
      preview(text),
      { threadId, route: 'SupportChat' },
      thread.ownerRole === 'buyer' ? ['push', 'email'] : ['push']
    )
    .catch(error => {
      logger.error('Failed to notify user about support reply:', error);
    });

  logger.info(`Support reply from admin ${adminId} on thread ${threadId}`);
  return payload;
};

export const markAdminThreadRead = async (threadId: string) => {
  const thread = await prisma.supportThread.findUnique({
    where: { id: threadId },
  });
  if (!thread) throw new Error('Thread not found');
  await prisma.supportThread.update({
    where: { id: threadId },
    data: { adminUnreadCount: 0 },
  });
};

export const closeThread = async (threadId: string) => {
  const thread = await prisma.supportThread.update({
    where: { id: threadId },
    data: { status: 'closed', updatedAt: new Date() },
    include: adminInclude,
  });
  return mapThreadForAdmin(thread);
};
