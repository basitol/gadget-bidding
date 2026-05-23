// Validate Nigerian phone number
export const isValidNigerianPhone = (phone: string): boolean => {
  // Remove all non-digits
  const cleaned = phone.replace(/\D/g, '');

  // Check for valid Nigerian formats
  // +234XXXXXXXXXX (13 digits)
  // 234XXXXXXXXXX (12 digits)
  // 0XXXXXXXXXX (11 digits)

  if (cleaned.startsWith('234') && cleaned.length === 13) return true;
  if (cleaned.startsWith('234') && cleaned.length === 12) return true;
  if (cleaned.startsWith('0') && cleaned.length === 11) return true;

  return false;
};

// Format phone to international format
export const formatToInternational = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');

  if (cleaned.startsWith('0') && cleaned.length === 11) {
    return `+234${cleaned.slice(1)}`;
  }

  if (cleaned.startsWith('234') && cleaned.length === 12) {
    return `+${cleaned}`;
  }

  if (cleaned.startsWith('234') && cleaned.length === 13) {
    return `+${cleaned}`;
  }

  return phone;
};

// Validate email
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validate password
export const isValidPassword = (
  password: string
): { valid: boolean; message: string } => {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters' };
  }

  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one uppercase letter',
    };
  }

  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one lowercase letter',
    };
  }

  if (!/[0-9]/.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one number',
    };
  }

  return { valid: true, message: '' };
};

// Validate OTP
export const isValidOtp = (otp: string): boolean => {
  return /^\d{6}$/.test(otp);
};

// Validate amount
export const isValidAmount = (amount: number, min = 100): boolean => {
  return amount >= min && Number.isFinite(amount);
};

// Validate full name
export const isValidFullName = (name: string): boolean => {
  // At least two words, each at least 2 characters
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 && parts.every(part => part.length >= 2);
};
