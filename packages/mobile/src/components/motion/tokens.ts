import { Easing } from 'react-native';

/** Motion tokens (docs/DESIGN_GUIDE.md › Motion). */
export const duration = {
  /** Taps, toggles, chip changes */
  fast: 150,
  /** Sheets, tabs, screen slides */
  normal: 250,
  /** Wins and celebrations only */
  slow: 400,
} as const;

/** Ease-out to enter, ease-in to leave. */
export const easing = {
  enter: Easing.out(Easing.cubic),
  exit: Easing.in(Easing.cubic),
} as const;
