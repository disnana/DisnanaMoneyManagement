import { useSyncExternalStore } from 'react';
import { readPreference, savePreference } from './preferences';

export const hiddenAssetAmount = '¥・・・・・・';

const key = 'dmm_home_hide_assets';
const saved = readPreference(key);
let hidden = saved !== null && saved !== 'off';
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return hidden;
}

function toggle() {
  const next = !hidden;
  const saved = savePreference(key, next ? 'on' : 'off');
  // A failed write can still mask the current screen, but must never reveal its balance.
  if (!saved && !next) return;
  hidden = next;
  listeners.forEach((listener) => listener());
}

export function useHomeAssetVisibility() {
  return [useSyncExternalStore(subscribe, getSnapshot, getSnapshot), toggle] as const;
}
