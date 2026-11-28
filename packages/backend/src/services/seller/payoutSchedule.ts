import { SELLER_POLICY } from '@gadget-bidding/shared';

/**
 * When seller payouts happen: once a day at 6:00 pm Lagos. Also the pause after a payout account
 * change (SELLER_POLICY.payoutHoldDaysAfterAccountChange): no payout run at or before the pause
 * end pays that seller, so payouts resume at the first 6 pm after it.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Lagos is UTC+1 all year (no daylight saving). */
export const LAGOS_UTC_OFFSET_HOURS = 1;
export const PAYOUT_HOUR = 18;

/** 6:00 pm Lagos on the Lagos calendar day of `at`, moved by `dayOffset` days. */
export const sixPmLagos = (at: Date, dayOffset = 0): Date => {
  const lagos = new Date(at.getTime() + LAGOS_UTC_OFFSET_HOURS * HOUR);
  const midnight = Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate() + dayOffset);
  return new Date(midnight + (PAYOUT_HOUR - LAGOS_UTC_OFFSET_HOURS) * HOUR);
};

/** The latest 6 pm Lagos at or before `now`: the run that's due. */
export const lastPayoutTime = (now = new Date()): Date => {
  const today = sixPmLagos(now);
  return now >= today ? today : sixPmLagos(now, -1);
};

/** The next 6 pm Lagos after `now` (today before 6 pm, else tomorrow). */
export const nextPayoutTime = (now = new Date()): Date => {
  const today = sixPmLagos(now);
  return now < today ? today : sixPmLagos(now, 1);
};

/** The first 6 pm Lagos run at or after `at`. */
export const firstPayoutFrom = (at: Date): Date => {
  const sameDay = sixPmLagos(at);
  return at <= sameDay ? sameDay : sixPmLagos(at, 1);
};

/** How long payouts pause after the payout account changes. */
export const PAYOUT_HOLD_DAYS = SELLER_POLICY.payoutHoldDaysAfterAccountChange;

/** A change made at `at` pauses payouts until this time. */
export const pauseEndFor = (at = new Date()) => new Date(at.getTime() + PAYOUT_HOLD_DAYS * DAY);

/**
 * Is a seller's payout paused for the run at `slot`? Paused while the pause end is after the run
 * (the same rule the 6 pm run uses, so the app and the run agree).
 */
export const pausedForSlot = (pausedUntil: Date | null | undefined, slot: Date) => !!pausedUntil && pausedUntil > slot;

/** Paused now (judged by the run that's due now), and when payouts resume. */
export const pauseOf = (pausedUntil: Date | null | undefined, now = new Date()) =>
  pausedUntil && pausedForSlot(pausedUntil, lastPayoutTime(now)) ? { until: pausedUntil, resumesAt: firstPayoutFrom(pausedUntil) } : null;

/** "Dec 3" (Lagos calendar). */
export const lagosShortDate = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Africa/Lagos' });

/** "Nov 24, 2026 · 6:00 pm" (Lagos). */
export const lagosDateTime = (d: Date) => {
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Africa/Lagos' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' }).toLowerCase();
  return `${day} · ${time}`;
};
