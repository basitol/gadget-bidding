import { CURRENCY } from '../constants';

// Format currency (Naira)
export const formatCurrency = (
  amount: number | string | undefined | null
): string => {
  if (amount === undefined || amount === null) {
    return `${CURRENCY}0`;
  }
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) {
    return `${CURRENCY}0`;
  }
  return `${CURRENCY}${num.toLocaleString('en-NG')}`;
};

// Format compact currency (e.g., ₦1.5M)
export const formatCompactCurrency = (
  amount: number | string | undefined | null
): string => {
  if (amount === undefined || amount === null) {
    return `${CURRENCY}0`;
  }
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) {
    return `${CURRENCY}0`;
  }
  if (num >= 1000000) {
    return `${CURRENCY}${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${CURRENCY}${(num / 1000).toFixed(1)}K`;
  }
  return formatCurrency(num);
};

// Format phone number
export const formatPhoneNumber = (phone: string): string => {
  // Remove all non-digits
  const cleaned = phone.replace(/\D/g, '');

  // Nigerian format: +234 XXX XXX XXXX
  if (cleaned.startsWith('234') && cleaned.length === 13) {
    return `+${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6, 9)} ${cleaned.slice(9)}`;
  }

  // Local format: 0XXX XXX XXXX
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
  }

  return phone;
};

// Format date
export const formatDate = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

// Format time
export const formatTime = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleTimeString('en-NG', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Format date and time
export const formatDateTime = (date: string | Date): string => {
  return `${formatDate(date)} at ${formatTime(date)}`;
};

// Format relative time
export const formatRelativeTime = (
  date: string | Date | null | undefined
): string => {
  if (!date) return 'Just now';

  const now = new Date();
  const d = new Date(date);

  // Check for invalid date
  if (isNaN(d.getTime())) return 'Just now';

  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
};

// Format countdown timer
export const formatCountdown = (endTime: string | Date): string => {
  const now = new Date();
  const end = new Date(endTime);
  const diffMs = end.getTime() - now.getTime();

  if (diffMs <= 0) return 'Ended';

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

// Get countdown parts
export const getCountdownParts = (
  endTime: string | Date
): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isEnded: boolean;
} => {
  const now = new Date();
  const end = new Date(endTime);
  const diffMs = end.getTime() - now.getTime();

  if (diffMs <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isEnded: true };
  }

  return {
    days: Math.floor(diffMs / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diffMs % (1000 * 60)) / 1000),
    isEnded: false,
  };
};

// Truncate text
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
};

// Format bid count
export const formatBidCount = (count: number): string => {
  if (count === 0) return 'No bids';
  if (count === 1) return '1 bid';
  return `${count} bids`;
};

/** Fallback for unknown enums — never show raw snake_case to users */
export const humanizeKey = (value?: string | null): string => {
  if (!value) return 'Unknown';
  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
};

// Get condition label
export const getConditionLabel = (condition?: string | null): string => {
  if (!condition) return 'N/A';
  const labels: Record<string, string> = {
    new: 'Brand New',
    like_new: 'Like New',
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    for_parts: 'For Parts',
  };
  return labels[condition] || humanizeKey(condition);
};

// Get condition color
export const getConditionColor = (condition: string): string => {
  const colors: Record<string, string> = {
    new: '#10B981',
    like_new: '#3B82F6',
    excellent: '#8B5CF6',
    good: '#F59E0B',
    fair: '#EF4444',
    for_parts: '#6B7280',
  };
  return colors[condition] || '#6B7280';
};

export const getAuctionStatusLabel = (status?: string | null): string => {
  if (!status) return 'Unknown';
  const labels: Record<string, string> = {
    draft: 'Draft',
    scheduled: 'Scheduled',
    active: 'Live',
    ended: 'Ended',
    cancelled: 'Cancelled',
    sold: 'Sold',
  };
  return labels[status] || humanizeKey(status);
};

export const getOrderStatusLabel = (status?: string | null): string => {
  if (!status) return 'Pending';
  const labels: Record<string, string> = {
    pending: 'Pending',
    pending_payment: 'Pending payment',
    processing: 'Processing',
    sent_to_backoffice: 'Sent to backoffice',
    received_by_backoffice: 'Received by backoffice',
    paid: 'Paid',
    shipped: 'Shipped',
    delivered: 'Delivered',
    completed: 'Completed',
    disputed: 'Disputed',
    cancelled: 'Cancelled',
    refunded: 'Refunded',
  };
  return labels[status] || humanizeKey(status);
};

export const getPaymentStatusLabel = (status?: string | null): string => {
  if (!status) return 'Pending';
  const labels: Record<string, string> = {
    pending: 'Pending',
    paid: 'Paid',
    failed: 'Failed',
    refunded: 'Refunded',
    abandoned: 'Abandoned',
  };
  return labels[status] || humanizeKey(status);
};

export const getTransactionTypeLabel = (type?: string | null): string => {
  if (!type) return 'Transaction';
  const labels: Record<string, string> = {
    deposit: 'Deposit',
    withdrawal: 'Withdrawal',
    bid_hold: 'Bid held',
    bid_release: 'Bid released',
    bid_charge: 'Bid charged',
    purchase: 'Purchase',
    sale: 'Sale proceeds',
    sale_credit: 'Sale proceeds',
    refund: 'Refund',
    fee: 'Platform fee',
    payment: 'Payment',
  };
  return labels[type] || humanizeKey(type);
};

export const getTransactionStatusLabel = (status?: string | null): string => {
  if (!status) return 'Pending';
  const labels: Record<string, string> = {
    pending: 'Pending',
    completed: 'Completed',
    failed: 'Failed',
  };
  return labels[status] || humanizeKey(status);
};

export const getRoleLabel = (role?: string | null): string => {
  if (!role) return 'User';
  const labels: Record<string, string> = {
    bidder: 'Buyer',
    seller: 'Seller',
    admin: 'Admin',
    user: 'Buyer',
  };
  return labels[role] || humanizeKey(role);
};
