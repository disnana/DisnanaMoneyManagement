import { useSyncExternalStore } from 'react';
import type { NativeStackNavigationOptions } from 'expo-router';
import { Platform } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { readPreference, savePreference } from './preferences';

const key = 'dmm_reduce_motion';
let enabled = readPreference(key) === 'on';
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
  if (!savePreference(key, value ? 'on' : 'off')) return;
  enabled = value;
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

export function androidSettingsTransition(reduceMotion: boolean): NativeStackNavigationOptions | undefined {
  if (Platform.OS !== 'android') return undefined;
  // The default Android pop fades both screens. A slide keeps them opaque throughout.
  return { animation: reduceMotion ? 'none' : 'slide_from_right' };
}
