import prisma from '../../config/prisma';
import config from '../../config';
import { TwoFactorMethod, User } from '@gadget-bidding/shared';
import { generateOTP, getOTPExpiry, isOTPExpired } from '../../utils/otp';
import { sendOTPSMS } from '../notification/sms.service';
import logger from '../../utils/logger';
import { USER_SELECT, maskEmail, maskPhone, toE164Phone, toPublicUser } from './auth.service';
import {
  PENDING_TOTP_MINUTES,
  buildOtpAuthUri,
  generateTotpSecret,
  readTotpStore,
  verifyTotp,
  writeTotpStore,
} from './totp';
import { forgetTrustedDevices } from './trustedDevices';

/**
 * Setting up 2-step sign-in with an authenticator app or text messages
 * (sellers protect payouts with it). The emailed code is still switched on
 * and off with PUT /auth/2fa.
 *
 * App:  setup → { secret, otpauth_uri } (kept as pending, the live method is untouched)
 *       confirm with the app's first code → method 'totp'
 * Text: setup → texts a code to the business phone (a user_verifications row,
 *       target "two_factor_setup|<phone>") → confirm → method 'sms', that phone
 */

export type SetupMethod = Extract<TwoFactorMethod, 'totp' | 'sms'>;

const SETUP_TARGET = 'two_factor_setup|';

const loadUser = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      phoneNumber: true,
      twoFactorEnabled: true,
      twoFactorMethod: true,
      totpSecret: true,
      twoFactorPhone: true,
      deletedAt: true,
      sellerApplication: { select: { businessPhone: true } },
    },
  });
  if (!user || user.deletedAt) throw new Error('Account not found');
  return user;
};

const liveMethod = (user: { twoFactorEnabled: boolean; twoFactorMethod: string | null }) =>
  user.twoFactorEnabled ? ((user.twoFactorMethod as TwoFactorMethod | null) ?? 'email') : null;

/** GET /auth/2fa */
export const getTwoFactorStatus = async (userId: string) => {
  const user = await loadUser(userId);
  const smsPhone = user.twoFactorPhone || user.sellerApplication?.businessPhone || null;
  return {
    enabled: user.twoFactorEnabled,
    method: liveMethod(user),
    email_hint: user.email ? maskEmail(user.email) : null,
    sms_phone_hint: smsPhone ? maskPhone(smsPhone) : null,
  };
};

/** POST /auth/2fa/setup */
export const startTwoFactorSetup = async (
  userId: string,
  method: SetupMethod
): Promise<{ secret: string; otpauth_uri: string } | { verification_id: string; phone_hint: string }> => {
  const user = await loadUser(userId);

  if (method === 'totp') {
    const secret = generateTotpSecret();
    const store = readTotpStore(user.totpSecret);
    await prisma.user.update({
      where: { id: userId },
      data: { totpSecret: writeTotpStore({ ...store, p: secret, pt: Date.now() }) },
    });
    return { secret, otpauth_uri: buildOtpAuthUri(secret, user.email || user.phoneNumber) };
  }

  const businessPhone = user.sellerApplication?.businessPhone;
  if (!businessPhone) throw new Error('Add your business phone to your seller details first.');
  const phone = toE164Phone(businessPhone);
  const otp = generateOTP();
  // Only the newest code counts.
  await prisma.userVerification.deleteMany({
    where: { userId, verificationType: 'phone', target: { startsWith: SETUP_TARGET } },
  });
  const v = await prisma.userVerification.create({
    data: {
      userId,
      verificationType: 'phone',
      verificationCode: otp,
      target: `${SETUP_TARGET}${phone}`,
      expiresAt: getOTPExpiry(config.otpExpiryMinutes),
    },
  });
  sendOTPSMS(phone, otp).catch(err => logger.error('Failed to text 2-step set-up code:', err));
  if (config.nodeEnv === 'development') logger.info(`[DEV] 2-step set-up code for user ${userId}: ${otp}`);
  return { verification_id: v.id, phone_hint: maskPhone(phone) };
};

/** POST /auth/2fa/confirm: turns 2-step on with that method and returns the updated user. */
export const confirmTwoFactorSetup = async (
  userId: string,
  data: { method: SetupMethod; code: string; verification_id?: string }
): Promise<User> => {
  const user = await loadUser(userId);
  const was = liveMethod(user);
  let update: {
    twoFactorEnabled: true;
    twoFactorMethod: SetupMethod;
    totpSecret: string | null;
    twoFactorPhone: string | null;
  };
  let setupRowId: string | null = null;

  if (data.method === 'totp') {
    const store = readTotpStore(user.totpSecret);
    if (!store.p || !store.pt || Date.now() - store.pt > PENDING_TOTP_MINUTES * 60_000) {
      throw new Error('This set-up has expired. Start again.');
    }
    const step = verifyTotp(store.p, data.code);
    if (step === null) {
      throw new Error("That code didn't match. Check your phone's time is set automatically, then try the newest code.");
    }
    update = {
      twoFactorEnabled: true,
      twoFactorMethod: 'totp',
      totpSecret: writeTotpStore({ s: store.p, ls: step }),
      twoFactorPhone: null,
    };
  } else {
    const v = data.verification_id
      ? await prisma.userVerification.findFirst({
          where: { id: data.verification_id, userId, verificationType: 'phone', target: { startsWith: SETUP_TARGET } },
        })
      : null;
    if (!v?.target) throw new Error('This code has expired. Send a new one.');
    if (!v.expiresAt || isOTPExpired(v.expiresAt)) throw new Error('This code has expired. Send a new one.');
    if (v.verificationCode !== data.code) throw new Error("That code didn't match. Try again.");
    setupRowId = v.id;
    update = {
      twoFactorEnabled: true,
      twoFactorMethod: 'sms',
      totpSecret: null,
      twoFactorPhone: v.target.slice(SETUP_TARGET.length),
    };
  }

  const updated = await prisma.$transaction(async tx => {
    if (setupRowId) {
      const spent = await tx.userVerification.deleteMany({ where: { id: setupRowId } });
      if (!spent.count) throw new Error('This code has expired. Send a new one.');
    } else {
      // A second confirm (or a new set-up) got there first.
      const same = await tx.user.count({ where: { id: userId, totpSecret: user.totpSecret } });
      if (!same) throw new Error('This set-up has changed. Start again.');
    }
    const row = await tx.user.update({ where: { id: userId }, data: update, select: USER_SELECT });
    // Phones trusted under another method have to pass this one.
    if (was !== update.twoFactorMethod) await forgetTrustedDevices(userId, tx);
    return row;
  });

  logger.info(`2-step sign-in on (${update.twoFactorMethod}) for user ${userId}`);
  return toPublicUser(updated);
};
