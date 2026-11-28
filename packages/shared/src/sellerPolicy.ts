/**
 * The seller agreement's numbers, in one place (design › Seller agreement).
 * The server charges and checks with these; the app shows them. Change them here, not in copy.
 */

/** Fee on the item price of a completed sale, by price band. The last band is a flat fee. */
export const PLATFORM_FEE_TIERS: { upTo: number | null; percent?: number; flat?: number; label: string }[] = [
  { upTo: 100_000, percent: 8, label: 'Up to ₦100,000: 8%' },
  { upTo: 500_000, percent: 6, label: '₦100,001–₦500,000: 6%' },
  { upTo: 1_000_000, percent: 5, label: '₦500,001–₦1,000,000: 5%' },
  { upTo: null, flat: 50_000, label: 'Over ₦1,000,000: a flat ₦50,000' },
];

/** The fee band an item price falls in. */
export const platformFeeTier = (price: number) =>
  PLATFORM_FEE_TIERS.find(t => t.upTo === null || price <= t.upTo) ?? PLATFORM_FEE_TIERS[PLATFORM_FEE_TIERS.length - 1];

/** Fee in naira (whole naira) for an item price. */
export const platformFeeFor = (price: number): number => {
  const p = Math.max(0, Number(price) || 0);
  const tier = platformFeeTier(p);
  return tier.flat != null ? Math.min(tier.flat, p) : Math.round((p * (tier.percent ?? 0)) / 100);
};

/** "8%", "5%" or "flat ₦50,000" — for "Platform fee (5%)". */
export const platformFeeLabel = (price: number) => {
  const tier = platformFeeTier(price);
  return tier.flat != null ? `flat ₦${tier.flat.toLocaleString('en-NG')}` : `${tier.percent}%`;
};

export const SELLER_POLICY = {
  /** Where sellers drop off and collect. Confirm before launch. */
  hubAddress: '2nd floor, 14 Ola-Ayeni Street, Computer Village, Ikeja',
  /** A seller has this long to give their side of a case. */
  caseReplyHours: 48,
  /** Refunded cases in this window that pause new listings. */
  failedSaleLimit: 3,
  failedSaleWindowDays: 90,
  /** An item the buyer returned: free to collect for this long, then a daily storage fee. */
  freeCollectionDays: 7,
  storageFeePerDay: 1_000,
  disposeAfterDays: 30,
  /** A rider takes a returned item back to the seller's shop. */
  returnDeliveryFee: 2_000,
  /** A rider collects a sold item from the shop for the hub. */
  riderPickupFee: 1_500,
  /** Changing the payout account pauses payouts for this long. */
  payoutHoldDaysAfterAccountChange: 7,
  /** Proof of shop address is good for this long, then the seller has a grace period to upload a new one. */
  proofOfAddressMonths: 12,
  proofOfAddressGraceDays: 30,
  /** Buyer has this long after delivery to confirm or report a problem. */
  confirmWindowHours: 48,
  agreementUpdated: '2026-11-01',
};
