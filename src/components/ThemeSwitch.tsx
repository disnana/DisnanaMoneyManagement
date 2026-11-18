import React from 'react';
import { Segmented } from './mobile/MobileKit';
import { useThemePref, type ThemePref } from '../utils/theme';

const OPTIONS: { id: ThemePref; label: string }[] = [
  { id: 'system', label: '自動' },
  { id: 'light', label: 'ライト' },
  { id: 'dark', label: 'ダーク' },
];

/** Appearance: Auto (follows the OS, default) / Light / Dark */
export const ThemeSwitch: React.FC = () => {
  const [pref, setPref] = useThemePref();
  return <Segmented value={pref} options={OPTIONS} onChange={setPref} />;
};
