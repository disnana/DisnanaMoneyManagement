/** iOS theme: system grouped backgrounds, hairline separators, continuous corners. */
import { useStyledPalette, type Palette } from './themePresets';
import type { AppearanceColor } from './themePref';

export type { Palette } from './themePresets';

const light: Palette = {
  cardRadius: 12, controlRadius: 9,
  bg: '#F2F2F7',
  card: '#FFFFFF',
  fill: 'rgba(118,118,128,0.12)',
  text: '#000000',
  textSecondary: '#52525C',
  separator: 'rgba(60,60,67,0.18)',
  outline: '#81838D',
  sectionHeader: '#DFE1E8',
  tint: '#0F766E',
  onTint: '#FFFFFF',
  income: '#0759AF', // accessible blue on grouped backgrounds
  expense: '#000000',
  danger: '#B80017',
};

const dark: Palette = {
  cardRadius: 12, controlRadius: 9,
  bg: '#000000',
  card: '#1C1C1E',
  fill: 'rgba(118,118,128,0.24)',
  text: '#FFFFFF',
  textSecondary: '#B1B1BC',
  separator: 'rgba(84,84,88,0.6)',
  outline: '#787882',
  sectionHeader: '#333339',
  tint: '#2DD4BF',
  onTint: '#00201C',
  income: '#78B9FF',
  expense: '#FFFFFF',
  danger: '#FF786E',
};

export function usePalette(preview?: AppearanceColor): Palette {
  return useStyledPalette(light, dark, preview);
}

export const metrics = {
  rowRadius: 0,
  rowMinHeight: 56,
  screenPaddingTop: 0,
};

export const fontFamily = 'system-ui';
