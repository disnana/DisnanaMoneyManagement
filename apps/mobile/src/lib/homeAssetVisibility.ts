import { useSyncExternalStore } from 'react';
import { kv } from '@/lib/kv';

const key = 'dmm_home_hide_assets';
let hidden = kv.getItem(key) === 'on';
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return hidden;
}

function toggle() {
  hidden = !hidden;
  kv.setItem(key, hidden ? 'on' : 'off');
  listeners.forEach((listener) => listener());
}

export function useHomeAssetVisibility() {
  return [useSyncExternalStore(subscribe, getSnapshot, getSnapshot), toggle] as const;
}
