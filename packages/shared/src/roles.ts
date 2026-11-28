import type { AccountType, UserRole } from './types/index';

/** @deprecated Legacy buyer role stored before bidder normalization */
export const LEGACY_BUYER_ROLE = 'user' as const;

export const BUYER_ROLES: readonly UserRole[] = ['bidder'];
export const SELLER_ROLES: readonly UserRole[] = ['seller', 'admin'];

export const roleForAccountType = (accountType?: AccountType): UserRole =>
  accountType === 'seller' ? 'seller' : 'bidder';

export const normalizeUserRole = (role?: string | null): UserRole => {
  if (role === 'seller' || role === 'admin' || role === 'staff') return role;
  if (role === 'bidder') return 'bidder';
  // Legacy sessions / rows
  return 'bidder';
};

export const isBuyerRole = (role?: string | null): boolean =>
  role === 'bidder' || role === LEGACY_BUYER_ROLE;

export const isSellerRole = (role?: string | null): boolean =>
  role === 'seller' || role === 'admin';

/** Store staff sign in through the seller log in, but only see their store's hub drop-offs and collections. */
export const isStaffRole = (role?: string | null): boolean => role === 'staff';

export const assertAccountTypeAccess = (
  accountType: AccountType | undefined,
  role?: string | null
): void => {
  if (!accountType) return;

  if (accountType === 'buyer' && isStaffRole(role)) {
    throw new Error('This is a store staff account. Use the seller log in.');
  }

  if (accountType === 'buyer' && !isBuyerRole(role)) {
    throw new Error(
      'This account is registered as a seller. Please use the seller login.'
    );
  }

  if (accountType === 'seller' && !isSellerRole(role) && !isStaffRole(role)) {
    throw new Error(
      'This account is registered as a buyer. Please use the buyer login.'
    );
  }
};
