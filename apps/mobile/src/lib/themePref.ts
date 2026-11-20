import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';
import { readPreference, savePreference } from './preferences';

/** "system" (default) follows the OS live; "light"/"dark" are explicit user choices. */
export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'dmm_theme';
const listeners = new Set<() => void>();

export function getThemePref(): ThemePref {
  const v = readPreference(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

/** 'auto' removes the app-level override so the OS decides again (RN 0.88 Appearance API). */
export function applyThemePref(pref: ThemePref = getThemePref()): void {
  // react-native-web (the browser preview) has no override API; native iOS/Android do
  if (typeof Appearance.setColorScheme === 'function') {
    Appearance.setColorScheme(pref === 'system' ? 'auto' : pref);
  }
}

export function setThemePref(pref: ThemePref): void {
  if (!savePreference(KEY, pref)) return;
  applyThemePref(pref);
  listeners.forEach((l) => l());
}

export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const pref = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getThemePref,
    getThemePref
  );
  return [pref, setThemePref];
}

// Apply the saved choice before the first render so there is no flash of the wrong theme
applyThemePref();
