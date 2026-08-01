import {
  AccountType,
  assertAccountTypeAccess,
  isBuyerRole,
  isSellerRole,
  normalizeUserRole,
  roleForAccountType,
  UserRole,
} from '@gadget-bidding/shared';

export type { AccountType, UserRole };

export {
  assertAccountTypeAccess,
  isBuyerRole,
  isSellerRole,
  normalizeUserRole,
  roleForAccountType,
};

/** Mobile app surface: buyer vs seller login and navigation */
export type AppInterfaceType = AccountType;

export const validateInterfaceAccess = (
  interfaceType: AppInterfaceType,
  role?: string | null
): string | null => {
  try {
    assertAccountTypeAccess(interfaceType, role);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Account type mismatch';
  }
};
