export type ThemeColors = {
  // Brand
  primary: string;
  primaryLight: string;
  primaryDark: string;
  secondary: string;
  secondaryLight: string;
  secondaryDark: string;
  accent: string;
  accentLight: string;

  // Surfaces
  background: string;
  backgroundLight: string;
  surface: string;
  surfaceLight: string;

  // Text
  text: string;
  textSecondary: string;
  textMuted: string;

  // Status
  success: string;
  warning: string;
  error: string;
  info: string;

  // Gradients
  gradientStart: string;
  gradientEnd: string;

  // Borders
  border: string;
  borderLight: string;
};

export const darkColors: ThemeColors = {
  // Primary - Electric Blue
  primary: '#2563EB',
  primaryLight: '#3B82F6',
  primaryDark: '#1D4ED8',

  // Secondary - Sky Blue
  secondary: '#0EA5E9',
  secondaryLight: '#38BDF8',
  secondaryDark: '#0284C7',

  // Accent - Indigo
  accent: '#6366F1',
  accentLight: '#818CF8',

  // Neutrals - Deep Dark Blue
  background: '#030712',
  backgroundLight: '#0A1628',
  surface: '#0F1D32',
  surfaceLight: '#162844',

  // Text
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#475569',

  // Status
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // Gradients
  gradientStart: '#1D4ED8',
  gradientEnd: '#2563EB',

  // Borders
  border: '#1E3A5F',
  borderLight: '#2D4A6F',
};

export const lightColors: ThemeColors = {
  primary: '#2563EB',
  primaryLight: '#3B82F6',
  primaryDark: '#1D4ED8',

  secondary: '#0EA5E9',
  secondaryLight: '#38BDF8',
  secondaryDark: '#0284C7',

  accent: '#6366F1',
  accentLight: '#818CF8',

  background: '#F8FAFC',
  backgroundLight: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceLight: '#F1F5F9',

  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',

  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  gradientStart: '#2563EB',
  gradientEnd: '#0EA5E9',

  border: '#E2E8F0',
  borderLight: '#F1F5F9',
};

export type ThemeMode = 'light' | 'dark';

export function getColors(mode: ThemeMode): ThemeColors {
  return mode === 'dark' ? darkColors : lightColors;
}

// Back-compat default (dark)
export const colors = darkColors;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extraBold: 'Inter_800ExtraBold',
  sizes: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 24,
    xxxl: 32,
    display: 40,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 9999,
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
};
