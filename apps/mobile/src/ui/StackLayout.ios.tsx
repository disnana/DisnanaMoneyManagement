import { Stack } from 'expo-router';
import { useAppReducedMotion } from '@/lib/motionPref';
import { usePalette } from '@/lib/theme';
import type { TabStackProps } from './StackLayout';

/** iOS: inline native title with an opaque header above each screen. */
export function TabStack({ title, indexOptions }: TabStackProps) {
  const p = usePalette();
  const reduceMotion = useAppReducedMotion();
  return (
    <Stack
      screenOptions={{
        animation: reduceMotion ? 'none' : 'default',
        headerLargeTitleEnabled: false,
        headerStyle: { backgroundColor: p.bg },
        headerTintColor: p.text,
        headerLargeTitleShadowVisible: false,
        headerShadowVisible: false,
      }}>
      <Stack.Screen name="index" options={{ title, ...indexOptions }} />
    </Stack>
  );
}
