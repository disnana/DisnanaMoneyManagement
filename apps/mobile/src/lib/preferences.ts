import { Alert, Platform } from 'react-native';
import { kv } from './kv';

// A missing preference uses the screen's normal default. An unreadable one must keep privacy protections on.
const whenUnavailable = {
  dmm_app_lock: 'on',
  dmm_home_hide_assets: 'on',
  dmm_haptics: 'off',
  dmm_reduce_motion: 'on',
  dmm_theme: 'system',
  dmm_analytics_sort: 'amount',
  dmm_start_guide: 'done',
} as const;
type Preference = keyof typeof whenUnavailable;

export function readPreference(key: Preference): string | null {
  try {
    return kv.getItem(key);
  } catch {
    return whenUnavailable[key];
  }
}

/** Report success only after the requested write succeeds. */
export function savePreference(key: Preference, value: string): boolean {
  try {
    kv.setItem(key, value);
    return true;
  } catch {
    const message = '設定を保存できませんでした。空き容量や保存先を確認して、もう一度お試しください。';
    if (Platform.OS === 'web') globalThis.alert?.(message);
    else Alert.alert('設定の保存', message);
    return false;
  }
}
