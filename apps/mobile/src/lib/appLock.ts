import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { kv } from '@/lib/kv';

const KEY = 'dmm_app_lock';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function isLockEnabled(): boolean {
  return Platform.OS !== 'web' && kv.getItem(KEY) === 'on';
}

/** Whether this device can authenticate at all (biometrics or a passcode). */
export async function canAuthenticate(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const [hw, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
  return hw && enrolled;
}

/** Face ID / Touch ID / fingerprint, falling back to the device passcode. */
export async function authenticate(prompt = 'DMM のロックを解除'): Promise<boolean> {
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, cancelLabel: 'キャンセル' });
  return r.success;
}

/** Turning the lock on requires a successful authentication first, so users cannot lock themselves out. */
export async function setLockEnabled(on: boolean): Promise<boolean> {
  if (on) {
    if (!(await canAuthenticate())) return false;
    if (!(await authenticate('ロックを有効にする'))) return false;
  }
  kv.setItem(KEY, on ? 'on' : 'off');
  emit();
  return true;
}

export function useLockEnabled(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    isLockEnabled,
    () => false
  );
}
