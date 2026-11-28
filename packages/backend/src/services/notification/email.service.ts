import { Resend } from 'resend';
import config from '../../config';
import logger from '../../utils/logger';

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (!config.email.resendApiKey) {
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(config.email.resendApiKey);
  }
  return resendClient;
}

/**
 * Send email via Resend
 */
export const sendEmail = async ({
  to,
  subject,
  html,
}: SendEmailParams): Promise<boolean> => {
  const resend = getResend();
  if (!resend) {
    logger.warn('RESEND_API_KEY is not set; skipping email send');
    return false;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: config.email.from,
      to,
      subject,
      html,
    });

    if (error) {
      logger.error('Failed to send email:', error);
      return false;
    }

    if (data?.id) {
      logger.info(`Email sent successfully to ${to} (${subject})`);
      return true;
    }

    logger.error('Failed to send email: no message id returned');
    return false;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Error sending email:', message);
    return false;
  }
};

/**
 * Send OTP via email
 */
export const sendOTPEmail = async (
  email: string,
  otp: string
): Promise<boolean> => {
  const subject = 'Your Gadgets Bidding verification code';
  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #111827; margin-bottom: 16px;">Verify your account</h2>
      <p style="color: #374151; font-size: 15px; line-height: 1.6;">
        Your Gadgets Bidding verification code is:
      </p>
      <div style="background: #F3F4F6; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">
        <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #111827;">${otp}</span>
      </div>
      <p style="color: #6B7280; font-size: 13px; line-height: 1.6;">
        This code is valid for ${config.otpExpiryMinutes} minutes. Do not share it with anyone.
        If you didn't request this code, you can safely ignore this email.
      </p>
    </div>
  `;
  return sendEmail({ to: email, subject, html });
};

/* ---------------- Buyer emails (design guide: 680 wide, one heading, plain money tables, no glass) ---------------- */

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string
  );

/** ₦ with commas, no kobo: ₦1,284,800 */
const naira = (amount: number) => `₦${Math.round(amount).toLocaleString('en-NG')}`;

/** Nov 24, 2026 · 6:00 pm (Lagos time) */
const lagosDate = (date: Date) => {
  const day = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Africa/Lagos',
  });
  const time = date
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' })
    .toLowerCase();
  return `${day} · ${time}`;
};

const INK = '#1C1F2A';
const SLATE = '#5C6273';
const MUTED = '#7C8293';
const LINE = '#EDEFF4';

const emailShell = (heading: string, body: string, footer: string) => `
  <div style="background:#F6F7FA;padding:32px 0;">
    <div style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;max-width:680px;margin:0 auto;background:#FFFFFF;border-radius:18px;padding:32px;">
      <div style="font-size:17px;font-weight:600;color:${INK};margin-bottom:24px;">Gadgets Bidding</div>
      <h1 style="font-size:22px;font-weight:600;color:${INK};margin:0 0 12px;">${heading}</h1>
      ${body}
      <p style="color:${MUTED};font-size:12px;line-height:1.6;margin:28px 0 0;border-top:1px solid ${LINE};padding-top:16px;">
        ${footer} We'll never ask for your password or PIN by email.
      </p>
    </div>
  </div>`;

export interface OrderReceipt {
  orderNumber: string;
  itemTitle: string;
  itemAmount: number;
  deliveryFee: number;
  deliveryMethod: 'delivery' | 'pickup';
  total: number;
  paidWith: string | null;
  paidAt: Date | null;
}

export const sendOrderReceiptEmail = async (to: string, r: OrderReceipt): Promise<boolean> => {
  const row = (label: string, value: string, strong = false) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid ${LINE};color:${strong ? INK : SLATE};font-size:14px;">${label}</td>
      <td style="padding:12px 0;border-bottom:1px solid ${LINE};color:${INK};font-size:${strong ? 16 : 14}px;font-weight:${strong ? 600 : 500};text-align:right;">${value}</td>
    </tr>`;
  const rows = [
    row('Order', escapeHtml(r.orderNumber)),
    row('Item', escapeHtml(r.itemTitle)),
    row('Winning bid', naira(r.itemAmount)),
    row(r.deliveryMethod === 'pickup' ? 'Pickup at the hub' : 'Delivery', r.deliveryFee ? naira(r.deliveryFee) : 'Free'),
    row('Buyer fee', naira(0)),
    row('Total paid', naira(r.total), true),
    r.paidWith ? row('Paid with', escapeHtml(r.paidWith)) : '',
    r.paidAt ? row('Paid on', lagosDate(r.paidAt)) : '',
  ].join('');
  const body = `
    <p style="color:${SLATE};font-size:15px;line-height:1.6;margin:0 0 20px;">
      Here's your receipt. Your money sits in escrow: the seller is only paid after you confirm the item arrived okay.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${rows}</table>`;
  return sendEmail({
    to,
    subject: `Your receipt for order ${r.orderNumber}`,
    html: emailShell(
      'Your receipt',
      body,
      `You're getting this because you asked for a receipt for order ${escapeHtml(r.orderNumber)} in the Gadgets Bidding app.`
    ),
  });
};

export const sendPasswordResetEmail = async (to: string, otp: string): Promise<boolean> => {
  const body = `
    <p style="color:${SLATE};font-size:15px;line-height:1.6;margin:0 0 16px;">Use this code to choose a new password:</p>
    <div style="background:#F5F6F9;border-radius:12px;padding:16px;text-align:center;margin:0 0 16px;">
      <span style="font-size:32px;font-weight:600;letter-spacing:8px;color:${INK};">${otp}</span>
    </div>
    <p style="color:${SLATE};font-size:14px;line-height:1.6;margin:0;">It works for ${config.otpExpiryMinutes} minutes. If you didn't ask to reset your password, ignore this email and your password stays the same.</p>`;
  return sendEmail({
    to,
    subject: 'Your Gadgets Bidding password reset code',
    html: emailShell(
      'Reset your password',
      body,
      "You're getting this because someone asked to reset the password for this email on Gadgets Bidding."
    ),
  });
};

/* ---------------- Store staff invite ---------------- */

export interface StaffInvite {
  /** As the owner typed it: "Ifeoma Okeke". */
  staffName: string;
  business: string;
  ownerName: string | null;
  /** The email they'll sign in with (this one). */
  email: string;
  /** The 6-digit code hub staff check, with their ID. */
  pickupCode: string;
  /** "your NIN slip" */
  idPhrase: string;
}

export const sendStaffInviteEmail = async (to: string, i: StaffInvite): Promise<boolean> => {
  const first = escapeHtml(i.staffName.split(' ')[0] || i.staffName);
  const business = escapeHtml(i.business);
  const who = i.ownerName ? `${escapeHtml(i.ownerName)} from ${business}` : business;
  const step = (n: number, text: string) => `
    <tr>
      <td style="width:24px;vertical-align:top;padding:6px 0;color:${INK};font-size:14px;font-weight:600;">${n}.</td>
      <td style="padding:6px 0;color:${SLATE};font-size:14px;line-height:1.6;">${text}</td>
    </tr>`;
  const body = `
    <p style="color:${SLATE};font-size:15px;line-height:1.6;margin:0 0 20px;">
      Hi ${first}, ${who} added you as store staff. You'll drop off and collect gadgets at our Computer Village hub for the store, and see what's waiting in the app.
    </p>
    <p style="color:${INK};font-size:15px;font-weight:600;margin:0 0 4px;">Set up your sign-in</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 20px;">
      ${step(1, 'Get the Gadgets Bidding app.')}
      ${step(2, 'Tap <b>I\'m a business</b>, then <b>I was added to a store team</b>.')}
      ${step(3, `Enter <b>${escapeHtml(i.email)}</b>, the code we email you, and a password.`)}
    </table>
    <p style="color:${SLATE};font-size:15px;line-height:1.6;margin:0 0 12px;">At the hub, show ${escapeHtml(i.idPhrase)} and this code:</p>
    <div style="background:#F5F6F9;border-radius:12px;padding:16px;text-align:center;margin:0 0 16px;">
      <span style="font-size:32px;font-weight:600;letter-spacing:8px;color:${INK};">${escapeHtml(i.pickupCode)}</span>
    </div>
    <p style="color:${SLATE};font-size:14px;line-height:1.6;margin:0;">Store staff can't see the store's payouts or change its settings.</p>`;
  return sendEmail({
    to,
    subject: `${i.business} added you to their team on Gadgets Bidding`,
    html: emailShell(
      `You're on the ${business} team`,
      body,
      `You're getting this because ${business} added this email as store staff on Gadgets Bidding. If you don't know them, ignore this email.`
    ),
  });
};

/* ---------------- Account restrictions (Users › Suspend / Pause listings / Restore) ---------------- */

/** An email built but not sent: the team sees it in the sheet ("See full email") before confirming. */
export type BuiltEmail = { subject: string; html: string; summary: string };

const para = (text: string) => `<p style="color:${SLATE};font-size:15px;line-height:1.6;margin:0 0 16px;">${text}</p>`;
const factRows = (rows: [string, string][]) =>
  `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 20px;">${rows
    .map(
      ([k, v]) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${LINE};color:${SLATE};font-size:14px;width:30%;vertical-align:top;">${k}</td>
      <td style="padding:10px 0;border-bottom:1px solid ${LINE};color:${INK};font-size:14px;">${v}</td>
    </tr>`
    )
    .join('')}</table>`;

export const buildSuspendedEmail = (i: { firstName: string; why: string; until: string }): BuiltEmail => ({
  subject: 'Your account is suspended',
  summary: `Why: ${i.why} Until: ${i.until}. Reply to this email to appeal.`,
  html: emailShell(
    'Your account is suspended',
    para(`Hi ${escapeHtml(i.firstName)}, we've suspended your Gadgets Bidding account, so you can't sign in, bid or pay for now.`) +
      factRows([
        ['Why', escapeHtml(i.why)],
        ['Until', escapeHtml(i.until)],
      ]) +
      para('Orders you already paid for still get delivered. Any live bids you had were withdrawn.') +
      para('<b>Think we got this wrong?</b> Reply to this email and tell us why. Someone from our team reads every reply.'),
    "You're getting this because our team suspended the Gadgets Bidding account for this email."
  ),
});

export const buildListingsPausedEmail = (i: {
  name: string;
  why: string;
  until: string;
  closeStore: boolean;
  liveAuctions: number;
}): BuiltEmail => ({
  subject: i.closeStore ? 'Your store is closed' : 'Your listings are paused',
  summary: `Why: ${i.why} Until: ${i.until}. Reply to this email to appeal.`,
  html: emailShell(
    i.closeStore ? 'Your store is closed' : 'Your listings are paused',
    para(
      i.closeStore
        ? `Hi ${escapeHtml(i.name)}, we've closed your store on Gadgets Bidding. You can't sign in to sell until it's reopened.`
        : `Hi ${escapeHtml(i.name)}, we've paused your listings on Gadgets Bidding while we look into something.`
    ) +
      factRows([
        ['Why', escapeHtml(i.why)],
        ['Until', escapeHtml(i.until)],
      ]) +
      para(
        [
          i.liveAuctions
            ? `Your ${i.liveAuctions} live ${i.liveAuctions === 1 ? 'auction is' : 'auctions are'} paused, and bidders have been told. ${i.liveAuctions === 1 ? 'It keeps' : 'They keep'} the time ${i.liveAuctions === 1 ? 'it' : 'they'} had left.`
            : null,
          "You can't list anything new for now. Orders you've already sold still go through the hub as usual.",
          'Payouts are held until your listings are back.',
        ]
          .filter(Boolean)
          .join(' ')
      ) +
      para('<b>Think we got this wrong?</b> Reply to this email and tell us why. Someone from our team reads every reply.'),
    "You're getting this because our team paused the Gadgets Bidding seller account for this email."
  ),
});

export const buildRestoredEmail = (i: {
  firstName: string;
  seller: boolean;
  reason: 'served' | 'mistake' | 'appeal' | 'expired';
}): BuiltEmail => {
  const what = i.seller ? 'You can list and sell again, and payouts start again.' : 'You can bid and pay again.';
  const subject = i.seller ? 'Your listings are back' : 'Your account is active again';
  const lead =
    i.reason === 'mistake'
      ? `We ${i.seller ? 'paused your listings' : 'suspended your account'} by mistake. Sorry about that. ${what}`
      : i.reason === 'appeal'
        ? `We looked at what you sent us and agree. ${what}`
        : i.reason === 'expired'
          ? `Your ${i.seller ? 'pause' : 'suspension'} has ended. ${what}`
          : `${what} Thanks for sorting it out.`;
  return {
    subject,
    summary: lead,
    html: emailShell(
      subject,
      para(`Hi ${escapeHtml(i.firstName)}, ${lead.charAt(0).toLowerCase()}${lead.slice(1)}`) +
        (i.seller ? para('Any auctions we paused start again with the time they had left.') : ''),
      "You're getting this because your Gadgets Bidding account was restored."
    ),
  };
};

export const sendBuiltEmail = (to: string, e: BuiltEmail) => sendEmail({ to, subject: e.subject, html: e.html });
