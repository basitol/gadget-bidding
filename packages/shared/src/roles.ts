import type { AccountType, UserRole } from './types/index';

/** @deprecated Legacy buyer role stored before bidder normalization */
export const LEGACY_BUYER_ROLE = 'user' as const;

export const BUYER_ROLES: readonly UserRole[] = ['bidder'];
export const SELLER_ROLES: readonly UserRole[] = ['seller', 'admin'];

export const roleForAccountType = (accountType?: AccountType): UserRole =>
  accountType === 'seller' ? 'seller' : 'bidder';

export const normalizeUserRole = (role?: string | null): UserRole => {
  if (role === 'seller' || role === 'admin') return role;
  if (role === 'bidder') return 'bidder';
  // Legacy sessions / rows
  return 'bidder';
};

export const isBuyerRole = (role?: string | null): boolean =>
  role === 'bidder' || role === LEGACY_BUYER_ROLE;

export const isSellerRole = (role?: string | null): boolean =>
  role === 'seller' || role === 'admin';

export const assertAccountTypeAccess = (
  accountType: AccountType | undefined,
  role?: string | null
): void => {
  if (!accountType) return;

  if (accountType === 'buyer' && !isBuyerRole(role)) {
    throw new Error(
      'This account is registered as a seller. Please use the seller login.'
    );
  }

  if (accountType === 'seller' && !isSellerRole(role)) {
    throw new Error(
      'This account is registered as a buyer. Please use the buyer login.'
    );
  }
};
