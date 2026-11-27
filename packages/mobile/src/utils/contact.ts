import { User } from '../types';

/**
 * Accounts made with email, Google or Apple get a non-routable "+9…" placeholder phone
 * (the backend requires one). Never show it or pre-fill forms with it.
 */
export const isPlaceholderPhone = (phone?: string | null): boolean => !!phone && phone.startsWith('+9');

/** The user's real phone number, or '' if they haven't given one. */
export const realPhone = (user?: Pick<User, 'phone_number'> | null): string =>
  user?.phone_number && !isPlaceholderPhone(user.phone_number) ? user.phone_number : '';

/** One line identifying the account: phone if real, else email, else @username. */
export const contactLabel = (user?: (User & { username?: string | null }) | null): string =>
  realPhone(user) || user?.email || (user?.username ? `@${user.username}` : '');
