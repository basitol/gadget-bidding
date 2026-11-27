import prisma from '../../config/prisma';
import { emitToUser, emitToSupportThread } from '../socket/socket.service';
import logger from '../../utils/logger';
import * as notificationService from '../notification/notification.service';

const preview = (body: string) =>
  body.length > 120 ? `${body.slice(0, 117)}...` : body;

const mapMessage = (m: any) => ({
  id: m.id,
  thread_id: m.threadId,
  sender_id: m.senderId,
  body: m.body,
  created_at: m.createdAt?.toISOString?.() || m.createdAt,
  sender: m.sender
    ? {
        id: m.sender.id,
        full_name: m.sender.fullName,
        role: m.sender.role,
      }
    : undefined,
});

/** Buyers are 'bidder' accounts; support calls them buyers. */
const ownerRole = (role?: string | null) => (role === 'seller' ? 'seller' : 'buyer');

const OWNER_SELECT = { id: true, fullName: true, phoneNumber: true, email: true, role: true } as const;

/**
 * A support thread belongs to one person (buyer or seller). The column is still called
 * seller_id from when only sellers could message us; it holds the owner's user id.
 */
const mapThread = (t: any) => ({
  id: t.id,
  seller_id: t.sellerId,
  owner_role: t.seller ? ownerRole(t.seller.role) : undefined,
  status: t.status,
  subject: t.subject,
  last_message_at: t.lastMessageAt?.toISOString?.() || t.lastMessageAt,
  last_message_preview: t.lastMessagePreview,
  seller_unread_count: t.sellerUnreadCount,
  admin_unread_count: t.adminUnreadCount,
  created_at: t.createdAt?.toISOString?.() || t.createdAt,
  seller: t.seller
    ? {
        id: t.seller.id,
        full_name: t.seller.fullName,
        // Email sign-ups get a placeholder +9… number; staff should see the email instead.
        phone_number: String(t.seller.phoneNumber || '').startsWith('+9') ? null : t.seller.phoneNumber,
        email: t.seller.email ?? null,
        role: ownerRole(t.seller.role),
      }
    : undefined,
});

/** Buyer or seller: their open thread, or a new one. One open thread per person. */
export const getOrCreateOwnThread = async (sellerId: string) => {
  let thread = await prisma.supportThread.findFirst({
    where: { sellerId, status: 'open' },
    include: {
      seller: { select: OWNER_SELECT },
    },
    orderBy: { lastMessageAt: 'desc' },
  });

  if (!thread) {
    thread = await prisma.supportThread.create({
      data: {
        sellerId,
        subject: 'Support',
        status: 'open',
      },
      include: {
        seller: { select: OWNER_SELECT },
      },
    });
  }

  return mapThread(thread);
};

export const listOwnThreads = async (sellerId: string) => {
  const threads = await prisma.supportThread.findMany({
    where: { sellerId },
    orderBy: { lastMessageAt: 'desc' },
    take: 20,
  });
  return threads.map(mapThread);
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

export const assertOwnsThread = async (
  threadId: string,
  sellerId: string
) => {
  const thread = await prisma.supportThread.findFirst({
    where: { id: threadId, sellerId },
  });
  if (!thread) throw new Error('Thread not found');
  return thread;
};

/** A message from the thread's owner (buyer or seller) to our team. */
export const sendOwnerMessage = async (
  threadId: string,
  sellerId: string,
  body: string,
  subject?: string
) => {
  const text = body.trim();
  if (!text) throw new Error('Write a message first.');
  if (text.length > 2000) throw new Error('Keep it under 2,000 characters.');

  await assertOwnsThread(threadId, sellerId);

  const message = await prisma.$transaction(async tx => {
    const msg = await tx.supportMessage.create({
      data: {
        threadId,
        senderId: sellerId,
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
        sellerUnreadCount: 0,
        status: 'open',
        ...(subject ? { subject: subject.slice(0, 255) } : {}),
        updatedAt: new Date(),
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

  notificationService
    .notifyBackofficeSupportMessage(
      threadId,
      payload.sender?.full_name || 'Someone',
      preview(text)
    )
    .catch(error => {
      logger.error('Failed to notify backoffice about support message:', error);
    });

  logger.info(`Support message from user ${sellerId} on thread ${threadId}`);
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
 * person's own support thread with the topic and order on top, so staff see them first.
 */
export const contactSupport = async (
  userId: string,
  input: { topic: string; order_id?: string | null; body: string }
) => {
  const topic = input.topic as ContactTopic;
  if (!CONTACT_TOPICS[topic]) throw new Error("Choose what it's about.");
  const text = String(input.body || '').trim();
  if (text.length < CONTACT_MIN_LENGTH) {
    throw new Error(`Tell us a bit more (at least ${CONTACT_MIN_LENGTH} characters).`);
  }
  if (text.length > 1800) throw new Error('Keep it under 1,800 characters.');

  let orderLabel: string | null = null;
  let orderId: string | null = null;
  if (input.order_id) {
    const order = await prisma.order.findFirst({
      where: { id: input.order_id, OR: [{ buyerId: userId }, { sellerId: userId }] },
      select: { id: true, orderNumber: true, auction: { select: { gadget: { select: { title: true } } } } },
    });
    if (!order) throw new Error("We couldn't find that order on your account. Choose another or leave it empty.");
    orderId = order.id;
    orderLabel = [order.orderNumber, order.auction?.gadget?.title].filter(Boolean).join(' · ');
  }

  const subject = [CONTACT_TOPICS[topic], orderLabel].filter(Boolean).join(' · ');
  const thread = await getOrCreateOwnThread(userId);
  const message = await sendOwnerMessage(thread.id, userId, `Topic: ${subject}\n\n${text}`, subject);

  return {
    thread_id: thread.id,
    message,
    topic,
    order_id: orderId,
    reply_within: REPLY_WITHIN,
  };
};

export const markOwnerThreadRead = async (
  threadId: string,
  sellerId: string
) => {
  await assertOwnsThread(threadId, sellerId);
  await prisma.supportThread.update({
    where: { id: threadId },
    data: { sellerUnreadCount: 0 },
  });
};

/** Admin */
export const listThreadsForAdmin = async (opts: {
  status?: string;
  page?: number;
  limit?: number;
  search?: string;
}) => {
  const page = opts.page && opts.page > 0 ? opts.page : 1;
  const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 100) : 20;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (opts.status && opts.status !== 'all') where.status = opts.status;
  if (opts.search) {
    where.seller = {
      OR: [
        { fullName: { contains: opts.search, mode: 'insensitive' } },
        { phoneNumber: { contains: opts.search } },
        { email: { contains: opts.search, mode: 'insensitive' } },
      ],
    };
  }

  const [threads, total] = await Promise.all([
    prisma.supportThread.findMany({
      where,
      include: {
        seller: { select: OWNER_SELECT },
      },
      orderBy: { lastMessageAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.supportThread.count({ where }),
  ]);

  return {
    data: threads.map(mapThread),
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
        sellerUnreadCount: { increment: 1 },
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
  emitToUser(thread.sellerId, 'support:message', event);

  // Buyers have no chat screen: the reply reaches them in Notifications, on the phone and by email.
  const owner = await prisma.user.findUnique({ where: { id: thread.sellerId }, select: { role: true } });
  if (owner && ownerRole(owner.role) === 'buyer') {
    notificationService
      .createNotification(thread.sellerId, 'support_message', 'Support replied', text, { threadId }, ['push', 'email'])
      .catch(error => logger.error('Failed to notify buyer about support reply:', error));
  }

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
    include: {
      seller: { select: OWNER_SELECT },
    },
  });
  return mapThread(thread);
};
