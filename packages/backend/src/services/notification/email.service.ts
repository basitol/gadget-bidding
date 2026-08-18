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
  const subject = 'Your GadgetBid verification code';
  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #111827; margin-bottom: 16px;">Verify your account</h2>
      <p style="color: #374151; font-size: 15px; line-height: 1.6;">
        Your GadgetBid verification code is:
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
