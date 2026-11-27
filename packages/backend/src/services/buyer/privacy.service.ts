import { Request } from 'express';
import prisma from '../../config/prisma';
import logger from '../../utils/logger';
import * as notificationService from '../notification/notification.service';
import { recordAuditEventSafe } from '../audit/audit.service';

/**
 * Profile › Privacy & your data: the three "What we use" switches, "Download my data"
 * requests, and "Was this helpful?" answers from Help.
 */

/** "We email a link to … within 7 days." */
export const DATA_REQUEST_DAYS = 7;
const DAY = 24 * 3_600_000;

/** "Dec 4, 2026" in Lagos time. */
const shortDate = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Africa/Lagos' });

type DataRequestRow = {
  id: string;
  status: string;
  email: string;
  requestedAt: Date;
  dueAt: Date;
  completedAt: Date | null;
};

const mapRequest = (r: DataRequestRow | null) =>
  r
    ? {
        id: r.id,
        status: r.status,
        email: r.email,
        requested_at: r.requestedAt.toISOString(),
        due_at: r.dueAt.toISOString(),
        completed_at: r.completedAt?.toISOString() ?? null,
      }
    : null;

export const getPrivacy = async (userId: string) => {
  const [user, prefs, open] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, personalisedPicks: true, usageStats: true, deletedAt: true },
    }),
    notificationService.getPreferences(userId),
    prisma.dataRequest.findFirst({ where: { userId, status: 'open' }, orderBy: { requestedAt: 'desc' } }),
  ]);
  if (!user || user.deletedAt) throw new Error('Account not found');
  return {
    /** Same switch as Notifications › Offers and news (notification_prefs.marketing). */
    marketing_emails: prefs.marketing,
    personalised_picks: user.personalisedPicks,
    usage_stats: user.usageStats,
    email: user.email,
    data_request_days: DATA_REQUEST_DAYS,
    data_request: mapRequest(open),
  };
};

export const updatePrivacy = async (
  userId: string,
  changes: { marketing_emails?: unknown; personalised_picks?: unknown; usage_stats?: unknown }
) => {
  if (typeof changes.marketing_emails === 'boolean') {
    await notificationService.updatePreferences(userId, { marketing: changes.marketing_emails });
  }
  const data: { personalisedPicks?: boolean; usageStats?: boolean } = {};
  if (typeof changes.personalised_picks === 'boolean') data.personalisedPicks = changes.personalised_picks;
  if (typeof changes.usage_stats === 'boolean') data.usageStats = changes.usage_stats;
  if (Object.keys(data).length) {
    await prisma.user.update({ where: { id: userId }, data: { ...data, updatedAt: new Date() } });
  }
  return getPrivacy(userId);
};

/**
 * "Request my data": records the request (one open at a time) for our team to send within
 * DATA_REQUEST_DAYS. Asking again while one is open returns that one.
 */
export const requestData = async (userId: string, req?: Request) => {
  const result = await prisma.$transaction(async tx => {
    // Lock the person's row so a double tap can't open two requests.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { email: true, fullName: true, deletedAt: true },
    });
    if (!user || user.deletedAt) throw new Error('Account not found');
    if (!user.email) {
      throw new Error('Add an email address in Personal details first, so we have somewhere to send it.');
    }
    const open = await tx.dataRequest.findFirst({ where: { userId, status: 'open' }, orderBy: { requestedAt: 'desc' } });
    if (open) return { request: open, created: false, name: user.fullName };
    const now = new Date();
    const request = await tx.dataRequest.create({
      data: { userId, email: user.email, status: 'open', requestedAt: now, dueAt: new Date(now.getTime() + DATA_REQUEST_DAYS * DAY) },
    });
    return { request, created: true, name: user.fullName };
  });

  const { request, created } = result;
  if (created) {
    recordAuditEventSafe({
      req,
      userId,
      action: 'data_export_requested',
      resourceType: 'data_request',
      resourceId: request.id,
      changes: { due_at: request.dueAt.toISOString() },
    });
    notificationService
      .notifyAdmins(
        'system',
        'Data request',
        `${result.name} asked for a copy of their data. Email it to ${request.email} by ${shortDate(request.dueAt)}.`,
        { dataRequestId: request.id, route: '/audit' }
      )
      .catch(error => logger.error('Failed to notify admins about data request:', error));
  }

  return {
    ...mapRequest(request)!,
    already_requested: !created,
    message: created
      ? `Done. We'll email a link to ${request.email} by ${shortDate(request.dueAt)}.`
      : `You've already asked. We'll email a link to ${request.email} by ${shortDate(request.dueAt)}.`,
  };
};

/** Staff: open requests (oldest due first) and marking one as sent. */
export const listDataRequests = async (status = 'open') => {
  const rows = await prisma.dataRequest.findMany({
    where: status === 'all' ? {} : { status },
    orderBy: { dueAt: 'asc' },
    take: 100,
    include: { user: { select: { id: true, fullName: true, role: true } } },
  });
  return rows.map(r => ({
    ...mapRequest(r)!,
    user: { id: r.user.id, full_name: r.user.fullName, role: r.user.role },
  }));
};

export const markDataRequestSent = async (id: string, adminId: string, req?: Request) => {
  const row = await prisma.dataRequest.findUnique({ where: { id } });
  if (!row) throw new Error('Request not found');
  if (row.status !== 'open') throw new Error('This request is already closed.');
  const updated = await prisma.dataRequest.update({
    where: { id },
    data: { status: 'sent', completedAt: new Date() },
  });
  recordAuditEventSafe({
    req,
    userId: adminId,
    action: 'data_export_sent',
    resourceType: 'data_request',
    resourceId: id,
    changes: { owner_id: row.userId },
  });
  return mapRequest(updated);
};

/* ---------------- Help: "Was this helpful?" ---------------- */

export const recordHelpFeedback = async (userId: string, article: string, helpful: boolean) => {
  const slug = String(article || '').trim();
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) throw new Error('Unknown article');
  await prisma.helpFeedback.upsert({
    where: { userId_article: { userId, article: slug } },
    create: { userId, article: slug, helpful },
    update: { helpful, updatedAt: new Date() },
  });
  return { article: slug, helpful };
};
