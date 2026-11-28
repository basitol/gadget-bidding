import { Request } from 'express';
import prisma from '../../config/prisma';
import config from '../../config';
import logger from '../../utils/logger';
import { comparePassword } from '../../utils/password';
import * as paystackService from '../payment/paystack.service';
import * as auditService from '../audit/audit.service';
import { createNotification } from '../notification/notification.service';
import { PAYOUT_HOLD_DAYS, firstPayoutFrom, lagosShortDate, pauseEndFor, pauseOf } from './payoutSchedule';

/**
 * A seller's payout account: where their withdrawals go. It is resolved with the bank and only
 * saved when the account name matches the registered business name ("Must be in your registered
 * business name"). Withdrawals by sellers always go here, never to bank details in the request.
 *
 * Changing it (not adding the first one) pauses payouts for SELLER_POLICY.payoutHoldDaysAfterAccountChange
 * days (users.payouts_paused_until): if someone else got into the account, the money doesn't follow.
 */

export class PayoutAccountError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string
  ) {
    super(message);
  }
}

export interface PayoutAccountView {
  bank_code: string;
  bank_name: string;
  account_number_last4: string;
  account_name: string;
  added_at: string | null;
}

/** The saved account, unmasked. Server-side only (withdrawals). */
export interface PayoutAccount {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  addedAt: Date | null;
}

/* ---------------- Name matching ---------------- */

/** Endings banks and the CAC register write differently. Each maps to one spelling. */
const SUFFIXES: Record<string, string> = {
  LTD: 'LTD',
  LIMITED: 'LTD',
  ENT: 'ENT',
  ENTERPRISE: 'ENT',
  ENTERPRISES: 'ENT',
  VENTURE: 'VENTURES',
  VENTURES: 'VENTURES',
  NIG: 'NIG',
  NIGERIA: 'NIG',
  CO: 'CO',
  COY: 'CO',
  COMPANY: 'CO',
  GLOBAL: 'GLOBAL',
  INTL: 'INTL',
  INTERNATIONAL: 'INTL',
};

/** "Okafor & Sons Nig. Ltd." → ["OKAFOR", "AND", "SONS", "NIG", "LTD"] */
const words = (name: string) =>
  name
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(w => SUFFIXES[w] ?? w);

/** The name without the endings: "ADE GLOBAL VENTURES NIG LTD" → "ADE". */
const core = (ws: string[]) => {
  const out = [...ws];
  while (out.length && SUFFIXES[out[out.length - 1]]) out.pop();
  return out;
};

const joined = (ws: string[]) => ws.join('');

/**
 * Same business? Forgiving about case, punctuation, "&" vs "and", spacing and the usual endings
 * (Ltd/Limited, Ent/Enterprises, Ventures, Nig/Nigeria, Co/Company, Global, Intl). Everything
 * else must match: sharing one word ("ADE PHONES" vs "ADE MOTORS") is not a match.
 */
export const namesMatch = (accountName: string, businessName: string): boolean => {
  const a = words(accountName);
  const b = words(businessName);
  if (!a.length || !b.length) return false;
  const ca = core(a);
  const cb = core(b);
  // A name made only of endings ("Global Ventures Ltd") is compared whole.
  if (!ca.length || !cb.length) return joined(a) === joined(b);
  return joined(ca) === joined(cb);
};

/* ---------------- Banks ---------------- */

/** Paystack's test bank: resolves any number to "TEST ACCOUNT <number>". Not in the bank list. */
const TEST_BANK = { id: 0, name: 'Test Bank', code: '001' };

/**
 * Banks a payout account can be at. With Paystack test keys only 3 real-bank look-ups work per
 * day, so the test bank is added at the top to keep the flow testable. Never in live mode.
 */
export const listPayoutBanks = async (): Promise<Array<{ id: number; name: string; code: string }>> => {
  const banks = await paystackService.listBanks();
  const testMode = config.paystack.secretKey.startsWith('sk_test_');
  return testMode && banks.length && !banks.some(b => b.code === TEST_BANK.code) ? [TEST_BANK, ...banks] : banks;
};

/* ---------------- Reading ---------------- */

const last4 = (n: string) => n.slice(-4);

const toView = (a: PayoutAccount): PayoutAccountView => ({
  bank_code: a.bankCode,
  bank_name: a.bankName,
  account_number_last4: last4(a.accountNumber),
  account_name: a.accountName,
  added_at: a.addedAt?.toISOString() ?? null,
});

const loadSeller = (userId: string) =>
  prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      passwordHash: true,
      businessName: true,
      sellerKybStatus: true,
      twoFactorEnabled: true,
      payoutBankCode: true,
      payoutBankName: true,
      payoutAccountNumber: true,
      payoutAccountName: true,
      payoutAccountAddedAt: true,
      payoutsPausedUntil: true,
      sellerApplication: { select: { status: true, businessName: true } },
    },
  });

type SellerRow = NonNullable<Awaited<ReturnType<typeof loadSeller>>>;

const accountOf = (u: SellerRow): PayoutAccount | null =>
  u.payoutBankCode && u.payoutAccountNumber && u.payoutAccountName
    ? {
        bankCode: u.payoutBankCode,
        bankName: u.payoutBankName || u.payoutBankCode,
        accountNumber: u.payoutAccountNumber,
        accountName: u.payoutAccountName,
        addedAt: u.payoutAccountAddedAt,
      }
    : null;

/** The name on the approved application, else the one on the account. */
const businessNameOf = (u: SellerRow): string | null =>
  (u.sellerApplication?.status === 'approved' ? u.sellerApplication.businessName?.trim() : null) ||
  u.businessName?.trim() ||
  u.sellerApplication?.businessName?.trim() ||
  null;

const isApproved = (u: SellerRow) =>
  u.sellerKybStatus === 'approved' || u.sellerApplication?.status === 'approved';

export type PayoutPauseInfo = {
  /** Payouts are paused after a recent change until this time; null when not paused. */
  payouts_paused_until: string | null;
  /** The first 6 pm payout after the pause (null when not paused). */
  payouts_resume_at: string | null;
};

const pauseInfo = (pausedUntil: Date | null, now = new Date()): PayoutPauseInfo => {
  const pause = pauseOf(pausedUntil, now);
  return {
    payouts_paused_until: pause ? pause.until.toISOString() : null,
    payouts_resume_at: pause ? pause.resumesAt.toISOString() : null,
  };
};

/** GET /seller/payout-account: the saved account (masked) plus what the screen needs around it. */
export const getPayoutAccount = async (
  userId: string
): Promise<
  {
    account: PayoutAccountView | null;
    business_name: string | null;
    two_step_enabled: boolean;
    /** Changing the account pauses payouts this many days. */
    hold_days: number;
    /** If they changed it now, payouts would resume at this 6 pm (null: no account yet, so no pause). */
    change_resumes_at: string | null;
  } & PayoutPauseInfo
> => {
  const u = await loadSeller(userId);
  if (!u) throw new PayoutAccountError('Account not found', 404);
  const account = accountOf(u);
  return {
    account: account ? toView(account) : null,
    business_name: businessNameOf(u),
    two_step_enabled: u.twoFactorEnabled,
    hold_days: PAYOUT_HOLD_DAYS,
    change_resumes_at: account ? firstPayoutFrom(pauseEndFor()).toISOString() : null,
    ...pauseInfo(u.payoutsPausedUntil),
  };
};

/** For withdrawals: the full saved account and whether 2-step sign-in is on. */
export const getPayoutReadiness = async (
  userId: string
): Promise<{ account: PayoutAccount | null; twoStepEnabled: boolean }> => {
  const u = await loadSeller(userId);
  if (!u) throw new PayoutAccountError('Account not found', 404);
  return { account: accountOf(u), twoStepEnabled: u.twoFactorEnabled };
};

export const maskAccount = toView;

/* ---------------- Checking (before saving) ---------------- */

/** Look the name up with the bank. '' when the bank has no such account. */
const resolveName = async (userId: string, bank: { code: string; name: string }, accountNumber: string) => {
  try {
    const resolved = await paystackService.resolveAccountNumber(accountNumber, bank.code);
    return resolved.account_name?.trim() || '';
  } catch (error) {
    const reason = (error as Error).message || '';
    logger.warn(`Payout account resolve failed for ${userId}: ${reason}`);
    // Paystack limits, timeouts and outages aren't "wrong number".
    if (/limit|too many|timeout|timed out|network|unavailable|ECONN|socket/i.test(reason)) {
      throw new PayoutAccountError(
        `We couldn't check that account with ${bank.name} just now. Try again in a few minutes.`,
        503,
        'BANK_CHECK_UNAVAILABLE'
      );
    }
    return '';
  }
};

/**
 * GET /seller/payout-account/check?bank_code&account_number: the name the bank has on the account
 * and whether it matches the registered business name. Nothing is saved.
 */
export const checkPayoutAccount = async (
  userId: string,
  input: { bankCode: string; accountNumber: string }
): Promise<{ bank_code: string; bank_name: string; account_name: string; matches: boolean; business_name: string | null }> => {
  const u = await loadSeller(userId);
  if (!u) throw new PayoutAccountError('Account not found', 404);
  const banks = await listPayoutBanks();
  if (!banks.length) {
    throw new PayoutAccountError("We couldn't reach the banks just now. Try again in a minute.", 503, 'BANKS_UNAVAILABLE');
  }
  const bank = banks.find(b => b.code === input.bankCode);
  if (!bank) throw new PayoutAccountError('Pick your bank from the list.', 400, 'UNKNOWN_BANK');
  const name = await resolveName(userId, bank, input.accountNumber);
  if (!name) {
    throw new PayoutAccountError(
      `We couldn't find that account at ${bank.name}. Check the number and the bank.`,
      422,
      'ACCOUNT_NOT_FOUND'
    );
  }
  const business = businessNameOf(u);
  return {
    bank_code: bank.code,
    bank_name: bank.name,
    account_name: name,
    matches: business ? namesMatch(name, business) : false,
    business_name: business,
  };
};

/* ---------------- Saving ---------------- */

/**
 * PUT /seller/payout-account. Approved sellers only; needs the password; the bank must resolve the
 * number to a name that matches the registered business name.
 */
export const setPayoutAccount = async (
  userId: string,
  input: { bankCode: string; accountNumber: string; password: string },
  req?: Request
): Promise<PayoutAccountView & PayoutPauseInfo> => {
  const u = await loadSeller(userId);
  if (!u) throw new PayoutAccountError('Account not found', 404);

  if (!isApproved(u)) {
    throw new PayoutAccountError(
      'You can add a payout account once your seller account is approved.',
      403,
      'SELLER_NOT_APPROVED'
    );
  }

  const business = businessNameOf(u);
  if (!business) {
    throw new PayoutAccountError(
      "We don't have your registered business name yet. Contact support to add it.",
      409,
      'BUSINESS_NAME_MISSING'
    );
  }

  if (!(await comparePassword(input.password, u.passwordHash))) {
    auditService.recordAuditEventSafe({
      req,
      userId,
      action: 'payout_account_password_failed',
      resourceType: 'user',
      resourceId: userId,
    });
    throw new PayoutAccountError("That password didn't match. Try again.", 400, 'WRONG_PASSWORD');
  }

  const banks = await listPayoutBanks();
  if (!banks.length) {
    throw new PayoutAccountError("We couldn't reach the banks just now. Try again in a minute.", 503, 'BANKS_UNAVAILABLE');
  }
  const bank = banks.find(b => b.code === input.bankCode);
  if (!bank) throw new PayoutAccountError('Pick your bank from the list.', 400, 'UNKNOWN_BANK');

  const resolvedName = await resolveName(userId, bank, input.accountNumber);
  if (!resolvedName) {
    throw new PayoutAccountError(
      `We couldn't find that account at ${bank.name}. Check the number and the bank.`,
      422,
      'ACCOUNT_NOT_FOUND'
    );
  }

  if (!namesMatch(resolvedName, business)) {
    throw new PayoutAccountError(
      `This account is in the name ${resolvedName}. Payouts can only go to an account in your registered business name, ${business}.`,
      422,
      'NAME_MISMATCH'
    );
  }

  const before = accountOf(u);
  const sameAccount = before?.bankCode === bank.code && before?.accountNumber === input.accountNumber;
  // A change (not the first account, not the same one again) pauses payouts.
  const now = new Date();
  const pausedUntil = before && !sameAccount ? pauseEndFor(now) : null;

  const saved = await prisma.user.update({
    where: { id: userId },
    data: {
      payoutBankCode: bank.code,
      payoutBankName: bank.name,
      payoutAccountNumber: input.accountNumber,
      payoutAccountName: resolvedName,
      payoutAccountAddedAt: sameAccount && before?.addedAt ? before.addedAt : now,
      ...(pausedUntil ? { payoutsPausedUntil: pausedUntil } : {}),
    },
    select: {
      payoutBankCode: true,
      payoutBankName: true,
      payoutAccountNumber: true,
      payoutAccountName: true,
      payoutAccountAddedAt: true,
      payoutsPausedUntil: true,
    },
  });
  const after: PayoutAccount = {
    bankCode: saved.payoutBankCode!,
    bankName: saved.payoutBankName!,
    accountNumber: saved.payoutAccountNumber!,
    accountName: saved.payoutAccountName!,
    addedAt: saved.payoutAccountAddedAt,
  };

  const pause = pauseInfo(saved.payoutsPausedUntil, now);
  if (sameAccount && before?.accountName === after.accountName) return { ...toView(after), ...pause };

  const brief = (a: PayoutAccount | null) =>
    a ? { bank_code: a.bankCode, bank_name: a.bankName, account_last4: last4(a.accountNumber), account_name: a.accountName } : null;
  auditService.recordAuditEventSafe({
    req,
    userId,
    action: before ? 'payout_account_changed' : 'payout_account_added',
    resourceType: 'user',
    resourceId: userId,
    changes: { from: brief(before), to: brief(after), payouts_paused_until: pausedUntil?.toISOString() ?? null },
  });

  const where = `${after.bankName} ••••${last4(after.accountNumber)}, ${after.accountName}`;
  const resumes = pause.payouts_resume_at ? new Date(pause.payouts_resume_at) : null;
  createNotification(
    userId,
    'system',
    before ? 'Your payout account changed' : 'Payout account added',
    pausedUntil && resumes
      ? `Your payouts now go to ${where}. For your safety, payouts pause for ${PAYOUT_HOLD_DAYS} days and resume on ${lagosShortDate(resumes)}. If this wasn't you, contact support straight away.`
      : `Your payouts now go to ${where}. If this wasn't you, contact support straight away.`,
    {
      kind: 'payout_account',
      bank_name: after.bankName,
      account_number_last4: last4(after.accountNumber),
      payouts_resume_at: pause.payouts_resume_at,
    },
    ['push', 'email']
  ).catch(e => logger.error('Payout account notification failed:', e));

  logger.info(`Payout account ${before ? 'changed' : 'added'}: ${userId}${pausedUntil ? ` (payouts paused until ${pausedUntil.toISOString()})` : ''}`);
  return { ...toView(after), ...pause };
};
