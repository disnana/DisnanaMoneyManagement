import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { kv } from '@/lib/kv';

const HAPTIC_KEY = 'dmm_haptics';
let enabled: boolean | undefined;

export function getHapticsEnabled(): boolean {
  if (enabled === undefined) enabled = kv.getItem(HAPTIC_KEY) !== 'off';
  return enabled;
}

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
  kv.setItem(HAPTIC_KEY, value ? 'on' : 'off');
}

/** Selection tick (tabs, segmented, pickers). */
export function tick() {
  if (Platform.OS === 'web' || !getHapticsEnabled()) return;
  if (Platform.OS === 'android') void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick);
  else void Haptics.selectionAsync();
}

/** Confirmation (saved / deleted). */
export function success() {
  if (Platform.OS === 'web' || !getHapticsEnabled()) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}
