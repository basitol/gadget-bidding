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
