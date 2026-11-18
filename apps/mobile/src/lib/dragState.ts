import { useSyncExternalStore } from 'react';

/** True while a list row is being dragged, so screens can pause scrolling. */
let dragging = false;
const listeners = new Set<() => void>();

export function setDragging(value: boolean): void {
  if (dragging === value) return;
  dragging = value;
  listeners.forEach((l) => l());
}

export function useDragging(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => dragging,
    () => false
  );
}
