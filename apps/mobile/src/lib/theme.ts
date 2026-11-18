/**
 * Android / default theme: Material 3 inspired (tonal surfaces, rounded cards, no hairlines).
 * iOS overrides this file in theme.ios.ts (system grouped backgrounds, hairline separators).
 */
import { useColorScheme } from 'react-native';

export interface Palette {
  bg: string;
  card: string;
  fill: string;
  text: string;
  textSecondary: string;
  separator: string;
  outline: string;
  sectionHeader: string;
  tint: string;
  onTint: string;
  income: string;
  expense: string;
  danger: string;
}

const light: Palette = {
  bg: '#F3F7F6',
  card: '#FFFFFF',
  fill: '#E4ECEA',
  text: '#16201F',
  textSecondary: '#5B6B69',
  separator: 'transparent',
  outline: '#818B89',
  sectionHeader: '#DCE6E4',
  tint: '#0F766E',
  onTint: '#FFFFFF',
  income: '#0759AF',
  expense: '#16201F',
  danger: '#B3261E',
};

const dark: Palette = {
  bg: '#0E1413',
  card: '#182120',
  fill: '#25312F',
  text: '#E6EEEC',
  textSecondary: '#9DB0AD',
  separator: 'transparent',
  outline: '#71827E',
  sectionHeader: '#303E3B',
  tint: '#5EEAD4',
  onTint: '#00201C',
  income: '#78B9FF',
  expense: '#E6EEEC',
  danger: '#F2B8B5',
};

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const metrics = {
  cardRadius: 20,
  rowRadius: 0,
  controlRadius: 100,
  rowMinHeight: 64,
  /** Android has no large-title nav bar; keep a bit more air above content */
  screenPaddingTop: 8,
};

export const fontFamily = undefined;
