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

function artwork(id: string): number | undefined {
  if (id === 'classic') return classic;
  const key = './' + id + '.png';
  return previewKeys.has(key) ? previews(key) : undefined;
}

export function getLauncherIcons() {
  const available = new Set(native?.available() ?? []);
  return catalog.flatMap((item) => {
    if (!available.has(item.id)) return [];
    const automatic = item.id.endsWith('_auto');
    const preview = artwork(item.id.replace(/_auto$/, '_mint'));
    return preview === undefined ? [] : [{
      ...item, preview, nightPreview: automatic ? artwork(item.id.replace(/_auto$/, '_teal')) : undefined,
    }];
  });
}

export function getLauncherIcon() {
  return native?.selected() ?? null;
}

export function getStartupIcon(dark: boolean): number {
  const fallback = artwork('smile_mint') ?? classic;
  try {
    const selected = getLauncherIcon() ?? 'smile_mint';
    return artwork(selected.replace(/_auto$/, dark ? '_teal' : '_mint')) ?? fallback;
  } catch {
    // The loading screen should work before the launcher module is ready.
    return fallback;
  }
}

export function selectLauncherIcon(id: string) {
  native?.select(id);
}
