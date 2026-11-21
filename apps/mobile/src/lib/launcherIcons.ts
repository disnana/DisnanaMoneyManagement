import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import catalog from '../../assets/launcher-icons/catalog.json';

declare const require: NodeRequire & {
  context(path: string, recursive: boolean, pattern: RegExp): {
    (key: string): number;
    keys(): string[];
  };
};

const native = Platform.OS === 'android'
  ? requireOptionalNativeModule<{
    available(): string[];
    selected(): string | null;
    select(id: string): void;
  }>('LauncherIcons')
  : null;

const previews = require.context('../../assets/launcher-icons', false, /^\.\/\w+\.png$/);
const classic = require('../../assets/images/icon.png') as number;
const previewKeys = new Set(previews.keys());

export function getLauncherIcons() {
  const available = new Set(native?.available() ?? []);
  return catalog.flatMap((item) => {
    if (!available.has(item.id)) return [];
    if (item.id === 'classic') return [{ ...item, preview: classic }];
    const key = './' + item.id + '.png';
    return previewKeys.has(key) ? [{ ...item, preview: previews(key) }] : [];
  });
}

export function getLauncherIcon() {
  return native?.selected() ?? null;
}

export function selectLauncherIcon(id: string) {
  native?.select(id);
}
