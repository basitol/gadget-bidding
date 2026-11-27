import prisma from '../../config/prisma';
import config from '../../config';
import logger from '../../utils/logger';
import { generateOTP, getOTPExpiry, isOTPExpired } from '../../utils/otp';
import { sendOTPSMS } from '../notification/sms.service';
import { sendOTPEmail, sendEmail } from '../notification/email.service';
import { recordAuditEventSafe } from '../audit/audit.service';
import * as notificationService from '../notification/notification.service';

/**
 * Change the email or phone on an account. A 6-digit code goes to the NEW address, so only
 * someone who can read it can switch to it. The old email gets a heads-up once it's done.
 * Pending changes are user_verifications rows with target "change:<new value>".
 */
type Kind = 'email' | 'phone';
const PREFIX = 'change:';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 0803…, 803…, +234803… → +234803…; null when it isn't a Nigerian mobile number. */
const toPhone = (raw: string) => {
  const d = raw.replace(/\D/g, '');
  const phone = d.startsWith('234') ? `+${d}` : d.startsWith('0') ? `+234${d.slice(1)}` : `+234${d}`;
  return /^\+234[789][01]\d{8}$/.test(phone) ? phone : null;
};

const mask = (kind: Kind, v: string) => {
  if (kind === 'phone') return `0${v.slice(4, 7)} ••• ${v.slice(-4)}`;
  const [name, domain] = v.split('@');
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(1, name.length - 2))}@${domain}`;
};

const send = (kind: Kind, to: string, code: string) => {
  const p = kind === 'email' ? sendOTPEmail(to, code) : sendOTPSMS(to, code);
  Promise.resolve(p).catch(err => logger.error(`Failed to send ${kind} change code:`, err));
  if (config.nodeEnv === 'development') logger.info(`[DEV] ${kind} change code for ${to}: ${code}`);
};

export const startContactChange = async (userId: string, kind: Kind, raw: string) => {
  if (kind !== 'email' && kind !== 'phone') throw new Error('Choose email or phone number');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, phoneNumber: true } });
  if (!user) throw new Error('Account not found');

  let value: string;
  if (kind === 'email') {
    value = raw.trim().toLowerCase();
    if (!EMAIL.test(value)) throw new Error('Enter an email like name@example.com');
    if (value === user.email?.toLowerCase()) throw new Error("That's already your email");
    if (await prisma.user.findFirst({ where: { email: { equals: value, mode: 'insensitive' }, NOT: { id: userId } }, select: { id: true } })) {
      throw new Error('That email is already on another account');
    }
  } else {
    const phone = toPhone(raw);
    if (!phone) throw new Error('Check the number. It should look like 0803 000 0000.');
    if (phone === user.phoneNumber) throw new Error("That's already your number");
    if (await prisma.user.findFirst({ where: { phoneNumber: phone, NOT: { id: userId } }, select: { id: true } })) {
      throw new Error('That number is already on another account');
    }
    value = phone;
  }

  // One change at a time: starting again replaces the old code.
  await prisma.userVerification.deleteMany({
    where: { userId, verificationType: kind, target: { startsWith: PREFIX }, isVerified: false },
  });
  const code = generateOTP();
  const v = await prisma.userVerification.create({
    data: {
      userId,
      verificationType: kind,
      verificationCode: code,
      target: `${PREFIX}${value}`,
      expiresAt: getOTPExpiry(config.otpExpiryMinutes),
    },
  });
  send(kind, value, code);
  return { verification_id: v.id, kind, sent_to: mask(kind, value), expires_in_minutes: config.otpExpiryMinutes };
};

const pending = async (userId: string, verificationId: string) => {
  const v = await prisma.userVerification.findFirst({
    where: { id: verificationId, userId, target: { startsWith: PREFIX }, isVerified: false },
  });
  if (!v || !v.target) throw new Error('This code has expired. Start again.');
  return { v, kind: v.verificationType as Kind, value: v.target.slice(PREFIX.length) };
};

export const resendContactCode = async (userId: string, verificationId: string) => {
  const { v, kind, value } = await pending(userId, verificationId);
  const code = generateOTP();
  await prisma.userVerification.update({
    where: { id: v.id },
    data: { verificationCode: code, expiresAt: getOTPExpiry(config.otpExpiryMinutes) },
  });
  send(kind, value, code);
  return { verification_id: v.id, kind, sent_to: mask(kind, value), expires_in_minutes: config.otpExpiryMinutes };
};

export const finishContactChange = async (userId: string, verificationId: string, code: string) => {
  const { v, kind, value } = await pending(userId, verificationId);
  if (!v.expiresAt || isOTPExpired(v.expiresAt)) throw new Error('That code has expired. Send a new one.');
  if (v.verificationCode !== code.trim()) throw new Error("That code isn't right. Check it and try again.");

  const before = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, phoneNumber: true } });
  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: kind === 'email' ? { email: value, isVerified: true, updatedAt: new Date() } : { phoneNumber: value, updatedAt: new Date() },
      }),
      prisma.userVerification.delete({ where: { id: v.id } }),
    ]);
  } catch (e: any) {
    if (e?.code === 'P2002') throw new Error(`That ${kind === 'email' ? 'email' : 'number'} is already on another account`);
    throw e;
  }

  recordAuditEventSafe({ userId, action: `${kind}_changed`, resourceType: 'user', resourceId: userId, changes: { kind } });
  notificationService
    .createNotification(
      userId,
      'system',
      kind === 'email' ? 'Your email was changed' : 'Your phone number was changed',
      kind === 'email'
        ? `We'll use ${value} from now on. If this wasn't you, contact support straight away.`
        : `We'll use ${mask('phone', value)} from now on. If this wasn't you, contact support straight away.`,
      {},
      ['push']
    )
    .catch(() => {});
  // Heads-up to the old address, so a stolen session can't quietly take over the account.
  if (before?.email && before.email.toLowerCase() !== (kind === 'email' ? value : '')) {
    sendEmail({
      to: before.email,
      subject: kind === 'email' ? 'Your Gadgets Bidding email was changed' : 'Your Gadgets Bidding phone number was changed',
      html: `<p>The ${kind === 'email' ? 'email' : 'phone number'} on your Gadgets Bidding account was just changed.</p><p>If this was you, there's nothing to do. If it wasn't, reply to this email or contact support in the app straight away.</p>`,
    }).catch(() => {});
  }
};
