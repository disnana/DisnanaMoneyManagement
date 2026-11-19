import { useSyncExternalStore } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { kv } from '@/lib/kv';

/** "system" (default) follows the OS live; "light"/"dark" are explicit user choices. */
export type ThemePref = 'system' | 'light' | 'dark';
export type AppearanceStyle = 'standard' | 'classic' | 'modern' | 'soft';

const KEY = 'dmm_theme';
const STYLE_KEY = 'dmm_appearance_style';
const listeners = new Set<() => void>();

const storedMode = kv.getItem(KEY);
let mode: ThemePref = storedMode === 'light' || storedMode === 'dark' ? storedMode : 'system';
const storedStyle = kv.getItem(STYLE_KEY);
let appearanceStyle: AppearanceStyle =
  storedStyle === 'classic' || storedStyle === 'modern' || storedStyle === 'soft' ? storedStyle : 'standard';

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getThemePref(): ThemePref {
  return mode;
}

/** 'auto' removes the app-level override so the OS decides again (RN 0.88 Appearance API). */
export function applyThemePref(pref: ThemePref = getThemePref()): void {
  // react-native-web (the browser preview) has no override API; native iOS/Android do
  if (typeof Appearance.setColorScheme === 'function') {
    Appearance.setColorScheme(pref === 'system' ? 'auto' : pref);
  }
}

export function setThemePref(pref: ThemePref): void {
  if (pref === mode) return;
  kv.setItem(KEY, pref);
  mode = pref;
  applyThemePref(pref);
  listeners.forEach((l) => l());
}

export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const pref = useSyncExternalStore(subscribe, getThemePref, getThemePref);
  return [pref, setThemePref];
}

export function useThemeColorScheme(): 'light' | 'dark' {
  const osScheme = useColorScheme();
  const [pref] = useThemePref();
  return pref === 'system' ? (osScheme === 'dark' ? 'dark' : 'light') : pref;
}

function getAppearanceStyle(): AppearanceStyle {
  return appearanceStyle;
}

function setAppearanceStyle(style: AppearanceStyle): void {
  if (style === getAppearanceStyle()) return;
  kv.setItem(STYLE_KEY, style);
  appearanceStyle = style;
  listeners.forEach((listener) => listener());
}

export function useAppearanceStyle(): [AppearanceStyle, (style: AppearanceStyle) => void] {
  const style = useSyncExternalStore(subscribe, getAppearanceStyle, getAppearanceStyle);
  return [style, setAppearanceStyle];
}

// Apply the saved choice before the first render so there is no flash of the wrong theme
applyThemePref();
