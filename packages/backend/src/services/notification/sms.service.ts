import axios from 'axios';
import config from '../../config';
import logger from '../../utils/logger';

interface SendSMSParams {
  to: string;
  message: string;
}

/**
 * Send SMS via Termii
 */
export const sendSMS = async ({
  to,
  message,
}: SendSMSParams): Promise<boolean> => {
  try {
    // Format phone number (ensure it starts with country code)
    const formattedPhone = to.startsWith('+') ? to : `+234${to.substring(1)}`;

    const response = await axios.post(
      `${config.termii.apiUrl}/sms/send`,
      {
        to: formattedPhone,
        from: config.termii.senderId,
        sms: message,
        type: 'plain',
        channel: 'generic',
        api_key: config.termii.apiKey,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.message_id) {
      logger.info(`SMS sent successfully to ${formattedPhone}`);
      return true;
    }

    logger.error('Failed to send SMS:', response.data);
    return false;
  } catch (error: any) {
    logger.error('Error sending SMS:', error.response?.data || error.message);
    return false;
  }
};

/**
 * Send OTP via SMS
 */
export const sendOTPSMS = async (
  phoneNumber: string,
  otp: string
): Promise<boolean> => {
  const message = `Your GadgetBid verification code is: ${otp}. Valid for 10 minutes. Do not share this code with anyone.`;
  return sendSMS({ to: phoneNumber, message });
};

/**
 * Send welcome SMS
 */
export const sendWelcomeSMS = async (
  phoneNumber: string,
  name: string
): Promise<boolean> => {
  const message = `Welcome to GadgetBid, ${name}! Start bidding on your favorite gadgets now. Happy bidding!`;
  return sendSMS({ to: phoneNumber, message });
};
