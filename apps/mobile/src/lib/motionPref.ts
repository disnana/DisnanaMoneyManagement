import { useSyncExternalStore } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import { kv } from '@/lib/kv';

const key = 'dmm_reduce_motion';
let enabled = kv.getItem(key) === 'on';
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return enabled;
}

function setEnabled(value: boolean) {
  if (enabled === value) return;
  enabled = value;
  kv.setItem(key, enabled ? 'on' : 'off');
  listeners.forEach((listener) => listener());
}

export function useMotionPreference() {
  return [useSyncExternalStore(subscribe, getSnapshot, getSnapshot), setEnabled] as const;
}

export function useAppReducedMotion() {
  const system = useReducedMotion();
  const [preference] = useMotionPreference();
  return preference || system;
}
