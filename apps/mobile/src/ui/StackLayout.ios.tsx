import { Stack } from 'expo-router';
import { usePalette } from '@/lib/theme';
import type { TabStackProps } from './StackLayout';

/** iOS: inline native title with an opaque header above each screen. */
export function TabStack({ title, indexOptions }: TabStackProps) {
  const p = usePalette();
  return (
    <Stack
      screenOptions={{
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
