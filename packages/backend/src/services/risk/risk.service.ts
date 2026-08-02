import prisma from '../../config/prisma';
import { Prisma } from '../../generated/prisma';
import logger from '../../utils/logger';

type RiskFlagType =
  | 'repeated_failed_otp'
  | 'repeated_payment_failures'
  | 'missed_bid_payment'
  | 'frequent_disputes';

type RiskSeverity = 'medium' | 'high' | 'critical';

type RiskFlag = {
  type: RiskFlagType;
  label: string;
  severity: RiskSeverity;
  reason: string;
  signal_count: number;
  last_signal_at: string | null;
  created_at: string | null;
};

const FLAG_LABELS: Record<RiskFlagType, string> = {
  repeated_failed_otp: 'Repeated failed OTP',
  repeated_payment_failures: 'Repeated payment failures',
  missed_bid_payment: 'Missed bid payment',
  frequent_disputes: 'Frequent disputes',
};

const recordRiskSignal = async (
  userId: string,
  action: string,
  changes: Prisma.InputJsonValue
) => {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      resourceType: 'user',
      resourceId: userId,
      changes,
    },
  });
};

const upsertFlag = async (
  userId: string,
  flagType: RiskFlagType,
  severity: RiskSeverity,
  reason: string,
  signalCount: number
) => {
  await prisma.$executeRaw`
    INSERT INTO user_risk_flags (
      user_id,
      flag_type,
      severity,
      reason,
      signal_count,
      last_signal_at,
      resolved_at,
      updated_at
    )
    VALUES (
      ${userId}::uuid,
      ${flagType},
      ${severity},
      ${reason},
      ${signalCount},
      CURRENT_TIMESTAMP,
      NULL,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (user_id, flag_type)
    DO UPDATE SET
      severity = EXCLUDED.severity,
      reason = EXCLUDED.reason,
      signal_count = EXCLUDED.signal_count,
      last_signal_at = CURRENT_TIMESTAMP,
      resolved_at = NULL,
      updated_at = CURRENT_TIMESTAMP
  `;
};

const countRecentSignals = async (
  userId: string,
  action: string,
  windowDays: number
): Promise<number> => {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM audit_logs
    WHERE user_id = ${userId}::uuid
      AND action = ${action}
      AND created_at >= NOW() - (${windowDays}::int * INTERVAL '1 day')
  `;

  return Number(rows[0]?.count || 0);
};

export const recordFailedOtp = async (verificationId?: string) => {
  if (!verificationId) return;

  try {
    const verification = await prisma.userVerification.findUnique({
      where: { id: verificationId },
      select: { userId: true },
    });

    if (!verification?.userId) return;

    await recordRiskSignal(verification.userId, 'risk_failed_otp', {
      verificationId,
    });

    const signalCount = await countRecentSignals(
      verification.userId,
      'risk_failed_otp',
      1
    );

    if (signalCount >= 5) {
      await upsertFlag(
        verification.userId,
        'repeated_failed_otp',
        signalCount >= 10 ? 'high' : 'medium',
        `${signalCount} failed OTP attempts in the last 24 hours.`,
        signalCount
      );
    }
  } catch (error) {
    logger.error('Failed to record OTP risk signal:', error);
  }
};

export const recordPaymentFailure = async (
  userId: string | undefined,
  reference: string | undefined,
  reason: string
) => {
  if (!userId) return;

  try {
    await recordRiskSignal(userId, 'risk_payment_failure', {
      reference,
      reason,
    });

    const signalCount = await countRecentSignals(
      userId,
      'risk_payment_failure',
      1
    );

    if (signalCount >= 3) {
      await upsertFlag(
        userId,
        'repeated_payment_failures',
        signalCount >= 6 ? 'high' : 'medium',
        `${signalCount} failed payment verification attempts in the last 24 hours.`,
        signalCount
      );
    }
  } catch (error) {
    logger.error('Failed to record payment risk signal:', error);
  }
};

export const recordMissedBidPayment = async (
  userId: string | null | undefined,
  orderId: string,
  orderNumber: string
) => {
  if (!userId) return;

  try {
    await recordRiskSignal(userId, 'risk_missed_bid_payment', {
      orderId,
      orderNumber,
    });

    await upsertFlag(
      userId,
      'missed_bid_payment',
      'critical',
      `Missed the 24-hour payment window for order #${orderNumber}.`,
      1
    );
  } catch (error) {
    logger.error('Failed to record missed bid payment risk signal:', error);
  }
};

export const recordDisputeOpened = async (
  userId: string,
  disputeId: string
) => {
  try {
    await recordRiskSignal(userId, 'risk_dispute_opened', { disputeId });

    const signalCount = await countRecentSignals(
      userId,
      'risk_dispute_opened',
      30
    );

    if (signalCount >= 3) {
      await upsertFlag(
        userId,
        'frequent_disputes',
        signalCount >= 5 ? 'high' : 'medium',
        `${signalCount} disputes opened in the last 30 days.`,
        signalCount
      );
    }
  } catch (error) {
    logger.error('Failed to record dispute risk signal:', error);
  }
};

export const getActiveRiskFlagsForUsers = async (
  userIds: string[]
): Promise<Record<string, RiskFlag[]>> => {
  if (userIds.length === 0) return {};
  const userIdList = Prisma.join(
    userIds.map(userId => Prisma.sql`${userId}::uuid`)
  );

  const rows = await prisma.$queryRaw<
    Array<{
      user_id: string;
      flag_type: RiskFlagType;
      severity: RiskSeverity;
      reason: string;
      signal_count: number;
      last_signal_at: Date | null;
      created_at: Date | null;
    }>
  >`
    SELECT
      user_id::text,
      flag_type,
      severity,
      reason,
      signal_count,
      last_signal_at,
      created_at
    FROM user_risk_flags
    WHERE resolved_at IS NULL
      AND user_id IN (${userIdList})
    ORDER BY
      CASE severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        ELSE 3
      END,
      last_signal_at DESC
  `;

  return rows.reduce<Record<string, RiskFlag[]>>((acc, row) => {
    const type = row.flag_type;
    acc[row.user_id] = acc[row.user_id] || [];
    acc[row.user_id].push({
      type,
      label: FLAG_LABELS[type] || 'Risk flag',
      severity: row.severity,
      reason: row.reason,
      signal_count: row.signal_count,
      last_signal_at: row.last_signal_at?.toISOString() || null,
      created_at: row.created_at?.toISOString() || null,
    });
    return acc;
  }, {});
};
