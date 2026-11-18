/** iOS theme: system grouped backgrounds, hairline separators, continuous corners. */
import { useColorScheme } from 'react-native';
import type { Palette } from './theme';

export type { Palette } from './theme';

const light: Palette = {
  bg: '#F2F2F7',
  card: '#FFFFFF',
  fill: 'rgba(118,118,128,0.12)',
  text: '#000000',
  textSecondary: 'rgba(60,60,67,0.6)',
  separator: 'rgba(60,60,67,0.18)',
  tint: '#0F766E',
  onTint: '#FFFFFF',
  income: '#1F8F4E',
  expense: '#000000',
  danger: '#FF3B30',
};

const dark: Palette = {
  bg: '#000000',
  card: '#1C1C1E',
  fill: 'rgba(118,118,128,0.24)',
  text: '#FFFFFF',
  textSecondary: 'rgba(235,235,245,0.6)',
  separator: 'rgba(84,84,88,0.6)',
  tint: '#2DD4BF',
  onTint: '#00201C',
  income: '#30D158',
  expense: '#FFFFFF',
  danger: '#FF453A',
};

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const metrics = {
  cardRadius: 12,
  rowRadius: 0,
  controlRadius: 9,
  rowMinHeight: 56,
  screenPaddingTop: 0,
};

export const fontFamily = 'system-ui';
