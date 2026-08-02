import { Request } from 'express';
import prisma from '../../config/prisma';
import { Prisma } from '../../generated/prisma';
import logger from '../../utils/logger';

const LOGIN_BURST_THRESHOLD = 5;
const LOGIN_BURST_WINDOW_MINUTES = 15;
const OTP_BURST_THRESHOLD = 5;
const OTP_BURST_WINDOW_MINUTES = 15;

const safeIp = (req?: Request) => {
  const ip = req?.ip || req?.socket?.remoteAddress;
  return ip || undefined;
};

const requestMeta = (req?: Request): Prisma.InputJsonObject => ({
  method: req?.method,
  path: req?.originalUrl || req?.url,
});

export const recordAuditEvent = async ({
  req,
  userId,
  action,
  resourceType,
  resourceId,
  changes,
}: {
  req?: Request;
  userId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string | null;
  changes?: Prisma.InputJsonValue;
}) => {
  await prisma.auditLog.create({
    data: {
      userId: userId || req?.user?.user_id,
      action,
      resourceType,
      resourceId: resourceId || undefined,
      changes,
      ipAddress: safeIp(req),
      userAgent: req?.get('user-agent') || undefined,
    },
  });
};

export const recordAuditEventSafe = (
  params: Parameters<typeof recordAuditEvent>[0]
) => {
  recordAuditEvent(params).catch(error => {
    logger.error('Failed to record audit event:', error);
  });
};

export const recordRateLimitHit = (req: Request, scope: string) => {
  recordAuditEventSafe({
    req,
    action: 'rate_limit_hit',
    resourceType: 'rate_limit',
    changes: {
      ...requestMeta(req),
      scope,
      userId: req.user?.user_id,
    },
  });
};

export const recordFailedOtp = async (
  req: Request,
  verificationId?: string,
  reason?: string
) => {
  await recordAuditEvent({
    req,
    action: 'auth_otp_failed',
    resourceType: 'auth',
    changes: {
      ...requestMeta(req),
      verificationId,
      reason,
    },
  });

  if (!verificationId) return;

  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM audit_logs
    WHERE action = 'auth_otp_failed'
      AND changes->>'verificationId' = ${verificationId}
      AND created_at >= NOW() - (${OTP_BURST_WINDOW_MINUTES}::int * INTERVAL '1 minute')
  `;
  const count = Number(rows[0]?.count || 0);

  if (count >= OTP_BURST_THRESHOLD) {
    await recordAuditEvent({
      req,
      action: 'auth_otp_failure_burst',
      resourceType: 'auth',
      changes: {
        ...requestMeta(req),
        verificationId,
        count,
        windowMinutes: OTP_BURST_WINDOW_MINUTES,
      },
    });
  }
};

export const recordFailedLogin = async (
  req: Request,
  phoneNumber?: string,
  reason?: string
) => {
  await recordAuditEvent({
    req,
    action: 'auth_login_failed',
    resourceType: 'auth',
    changes: {
      ...requestMeta(req),
      phoneNumber,
      reason,
    },
  });

  if (!phoneNumber) return;

  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM audit_logs
    WHERE action = 'auth_login_failed'
      AND changes->>'phoneNumber' = ${phoneNumber}
      AND created_at >= NOW() - (${LOGIN_BURST_WINDOW_MINUTES}::int * INTERVAL '1 minute')
  `;
  const count = Number(rows[0]?.count || 0);

  if (count >= LOGIN_BURST_THRESHOLD) {
    await recordAuditEvent({
      req,
      action: 'auth_login_failure_burst',
      resourceType: 'auth',
      changes: {
        ...requestMeta(req),
        phoneNumber,
        count,
        windowMinutes: LOGIN_BURST_WINDOW_MINUTES,
      },
    });
  }
};

export const recordPaymentVerificationFailed = (
  req: Request,
  reference?: string,
  reason?: string
) => {
  recordAuditEventSafe({
    req,
    action: 'payment_verification_failed',
    resourceType: 'payment',
    changes: {
      ...requestMeta(req),
      reference,
      reason,
    },
  });
};

export const recordBidFailed = (
  req: Request,
  kind: 'bid' | 'buy_now',
  reason?: string
) => {
  recordAuditEventSafe({
    req,
    action: kind === 'buy_now' ? 'buy_now_failed' : 'bid_failed',
    resourceType: 'bid',
    changes: {
      ...requestMeta(req),
      auctionId: req.body?.auction_id || req.params?.auctionId,
      amount: req.body?.amount,
      reason,
    },
  });
};
