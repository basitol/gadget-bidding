import { useColorScheme } from 'react-native';
import { getColors, ThemeColors, ThemeMode } from '../constants';

export type Theme = {
  mode: ThemeMode;
  colors: ThemeColors;
};

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const mode: ThemeMode = scheme === 'dark' ? 'dark' : 'light';
  return { mode, colors: getColors(mode) };
}

