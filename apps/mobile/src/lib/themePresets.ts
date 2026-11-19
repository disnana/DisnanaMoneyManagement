import { useMemo } from 'react';
import { useAppearanceColor, useAppearanceStyle, useThemeColorScheme, type AppearanceColor } from './themePref';

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
  cardRadius: number;
  controlRadius: number;
}

type Colors = Omit<Palette, 'cardRadius' | 'controlRadius'>;

const colorsByTheme: Record<Exclude<AppearanceColor, 'standard'>, Record<'light' | 'dark', Colors>> = {
  navy: {
    light: {
      bg: '#F4F0E7', card: '#FFFCF6', fill: '#EEE9DF', sectionHeader: '#E6E2D8',
      text: '#222D3B', textSecondary: '#555F6B', separator: '#CCC4B7', outline: '#827D74',
      tint: '#294C72', onTint: '#FFFFFF', income: '#0759AF', expense: '#222D3B', danger: '#A5232F',
    },
    dark: {
      bg: '#141B25', card: '#1D2733', fill: '#283443', sectionHeader: '#303D4D',
      text: '#F4EFE4', textSecondary: '#BBC5D1', separator: '#4B596B', outline: '#8190A1',
      tint: '#ADD0F2', onTint: '#102238', income: '#78B9FF', expense: '#F4EFE4', danger: '#FF9B95',
    },
  },
  violet: {
    light: {
      bg: '#F2EFFA', card: '#FFFFFF', fill: '#EBE5F7', sectionHeader: '#E2D9F5',
      text: '#211B34', textSecondary: '#5B526F', separator: '#D2C8E4', outline: '#8D819F',
      tint: '#5D35B5', onTint: '#FFFFFF', income: '#0759AF', expense: '#211B34', danger: '#AC2139',
    },
    dark: {
      bg: '#151020', card: '#20182D', fill: '#2E243E', sectionHeader: '#3A2B51',
      text: '#F5EFFF', textSecondary: '#C8BEDB', separator: '#514364', outline: '#907EAA',
      tint: '#C9ACFF', onTint: '#260F4C', income: '#78B9FF', expense: '#F5EFFF', danger: '#FFA19C',
    },
  },
  terracotta: {
    light: {
      bg: '#FAF5F1', card: '#FFFDF9', fill: '#F1E8E0', sectionHeader: '#F6E4D9',
      text: '#402E2B', textSecondary: '#685449', separator: '#DCC9BC', outline: '#988174',
      tint: '#914729', onTint: '#FFFFFF', income: '#0759AF', expense: '#402E2B', danger: '#A2253D',
    },
    dark: {
      bg: '#221A17', card: '#2C211E', fill: '#3C2E29', sectionHeader: '#45332B',
      text: '#F6E7E0', textSecondary: '#CEAFA0', separator: '#62483D', outline: '#9A7B6B',
      tint: '#F6AF8C', onTint: '#2D180E', income: '#91C3FF', expense: '#F6E7E0', danger: '#FF9DB1',
    },
  },
};

const modernDarkSurfaces = {
  bg: '#171C23',
  card: '#222A34',
  fill: '#2D3743',
  separator: '#3B4654',
  outline: '#67768A',
  sectionHeader: '#364252',
} satisfies Partial<Colors>;

const shapes = {
  classic: { cardRadius: 8, controlRadius: 6 },
  modern: { cardRadius: 16, controlRadius: 12 },
  soft: { cardRadius: 24, controlRadius: 16 },
};

export function useStyledPalette(light: Palette, dark: Palette, preview?: AppearanceColor): Palette {
  const scheme = useThemeColorScheme();
  const [style] = useAppearanceStyle();
  const [savedColor] = useAppearanceColor();
  const color = preview ?? savedColor;
  const base = scheme === 'dark' ? dark : light;

  return useMemo(() => {
    if (style === 'standard' && color === 'standard') return base;
    const colors = color === 'standard' ? base : colorsByTheme[color][scheme];
    const shape = style === 'standard' ? { cardRadius: base.cardRadius, controlRadius: base.controlRadius } : shapes[style];
    const surfaces = style === 'modern' && scheme === 'dark' && color === 'standard' ? modernDarkSurfaces : undefined;
    return { ...colors, ...surfaces, ...shape };
  }, [base, color, scheme, style]);
}
