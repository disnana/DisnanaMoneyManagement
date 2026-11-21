import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { authenticate, isLockEnabled, useLockEnabled } from '@/lib/appLock';
import { usePalette } from '@/lib/theme';

/**
 * Covers the app with a lock screen while the lock is on: at launch, and again whenever the app has been in
 * the background for a moment. The cover also hides balances from the app switcher.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const p = usePalette();
  const enabled = useLockEnabled();
  const [locked, setLocked] = useState(isLockEnabled);
  const [covered, setCovered] = useState(false); // while inactive (app switcher)
  const busy = useRef(false);

  const unlock = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (await authenticate()) setLocked(false);
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLocked(false);
      return;
    }
    if (locked) void unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let leftAt = 0;
    const sub = AppState.addEventListener('change', (s) => {
      setCovered(s !== 'active');
      if (s === 'background') {
        // Android may launch a separate activity for device credentials.
        leftAt = busy.current ? 0 : Date.now();
      }
      if (s === 'active') {
        const shouldRelock = leftAt > 0 && Date.now() - leftAt > 5000;
        leftAt = 0;
        if (shouldRelock && !busy.current) {
          setLocked(true);
          void unlock();
        }
      }
    });
    return () => sub.remove();
  }, [enabled, unlock]);

  const showCover = enabled && (locked || covered);
  return (
    <View style={{ flex: 1 }}>
      {children}
      {showCover ? (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <SymbolView name={{ ios: 'lock.fill', android: 'lock' }} size={44} tintColor={p.tint} />
          <Text style={{ color: p.text, fontSize: 17, fontWeight: '600' }}>ロック中</Text>
          {locked ? (
            <Pressable onPress={() => void unlock()} style={{ minHeight: 48, paddingHorizontal: 28, borderRadius: 16, backgroundColor: p.tint, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: p.onTint, fontSize: 16, fontWeight: '700' }}>ロックを解除</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
