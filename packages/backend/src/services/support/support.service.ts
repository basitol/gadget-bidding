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

const mapThread = (t: any) => ({
  id: t.id,
  seller_id: t.sellerId,
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
        phone_number: t.seller.phoneNumber,
      }
    : undefined,
});

/** Seller: get open thread or create one */
export const getOrCreateSellerThread = async (sellerId: string) => {
  let thread = await prisma.supportThread.findFirst({
    where: { sellerId, status: 'open' },
    include: {
      seller: {
        select: { id: true, fullName: true, phoneNumber: true },
      },
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
        seller: {
          select: { id: true, fullName: true, phoneNumber: true },
        },
      },
    });
  }

  return mapThread(thread);
};

export const listSellerThreads = async (sellerId: string) => {
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

export const assertSellerOwnsThread = async (
  threadId: string,
  sellerId: string
) => {
  const thread = await prisma.supportThread.findFirst({
    where: { id: threadId, sellerId },
  });
  if (!thread) throw new Error('Thread not found');
  return thread;
};

export const sendSellerMessage = async (
  threadId: string,
  sellerId: string,
  body: string
) => {
  const text = body.trim();
  if (!text) throw new Error('Message cannot be empty');
  if (text.length > 2000) throw new Error('Message is too long');

  await assertSellerOwnsThread(threadId, sellerId);

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
      payload.sender?.full_name || 'A seller',
      preview(text)
    )
    .catch(error => {
      logger.error('Failed to notify backoffice about support message:', error);
    });

  logger.info(`Support message from seller ${sellerId} on thread ${threadId}`);
  return payload;
};

export const markSellerThreadRead = async (
  threadId: string,
  sellerId: string
) => {
  await assertSellerOwnsThread(threadId, sellerId);
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
      ],
    };
  }

  const [threads, total] = await Promise.all([
    prisma.supportThread.findMany({
      where,
      include: {
        seller: {
          select: { id: true, fullName: true, phoneNumber: true },
        },
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
      seller: {
        select: { id: true, fullName: true, phoneNumber: true },
      },
    },
  });
  return mapThread(thread);
};
