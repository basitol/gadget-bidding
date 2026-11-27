import crypto from 'crypto';

/**
 * Public stand-in for a bidder's identity: "Bidder •••7". Stable per bidder (so you can follow
 * a bidding war) but not reversible to a name or user id. Real names are never shown to others.
 */
export const bidderLabel = (userId?: string | null): string => {
  if (!userId) return 'Bidder';
  const n = parseInt(crypto.createHash('sha256').update(`bidder:${userId}`).digest('hex').slice(0, 6), 16);
  return `Bidder •••${n % 10}`;
};
