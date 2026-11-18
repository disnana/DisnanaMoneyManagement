/** iOS theme: system grouped backgrounds, hairline separators, continuous corners. */
import { useColorScheme } from 'react-native';
import type { Palette } from './theme';

export type { Palette } from './theme';

const light: Palette = {
  bg: '#F2F2F7',
  card: '#FFFFFF',
  fill: 'rgba(118,118,128,0.12)',
  text: '#000000',
  textSecondary: 'rgba(60,60,67,0.75)', // 0.6 (system secondaryLabel) is only 3.4:1 on white; 0.75 reaches 5.1:1 (WCAG AA 4.5:1)
  separator: 'rgba(60,60,67,0.18)',
  tint: '#0F766E',
  onTint: '#FFFFFF',
  income: '#0759AF', // accessible blue on grouped backgrounds
  expense: '#000000',
  danger: '#D70015', // Apple's accessible red; #FF3B30 is only 3.6:1 on white
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
  income: '#78B9FF',
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
