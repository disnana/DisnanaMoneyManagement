import { useSyncExternalStore } from 'react';
import { kv } from '@/lib/kv';

export const homeLayouts = [
  { id: 'trend', label: '資産推移', subtitle: '総資産と直近６か月の推移を大きく表示' },
  { id: 'month', label: '月の収支', subtitle: '選んだ月の収支と取引を先に確認' },
  { id: 'wallet', label: 'ウォレット', subtitle: '総資産の下に口座別残高をまとめて表示' },
] as const;

export type HomeLayout = typeof homeLayouts[number]['id'];

const layoutKey = 'dmm_home_layout';
const privacyKey = 'dmm_home_hide_assets';
const listeners = new Set<() => void>();
const savedLayout = kv.getItem(layoutKey);
let layout: HomeLayout = homeLayouts.find(({ id }) => id === savedLayout)?.id ?? 'trend';
let assetsHidden = kv.getItem(privacyKey) === 'on';

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function setLayout(value: HomeLayout) {
  if (layout === value) return;
  kv.setItem(layoutKey, value);
  layout = value;
  listeners.forEach((listener) => listener());
}

function toggleAssets() {
  assetsHidden = !assetsHidden;
  kv.setItem(privacyKey, assetsHidden ? 'on' : 'off');
  listeners.forEach((listener) => listener());
}

const getLayout = () => layout;
const getAssetsHidden = () => assetsHidden;

export function useHomeLayout() {
  return [useSyncExternalStore(subscribe, getLayout, getLayout), setLayout] as const;
}

export function useHomeAssetVisibility() {
  return [useSyncExternalStore(subscribe, getAssetsHidden, getAssetsHidden), toggleAssets] as const;
}
