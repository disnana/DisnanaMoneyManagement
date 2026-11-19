import { Stack, type NativeStackNavigationOptions } from 'expo-router';
import { useAppReducedMotion } from '@/lib/motionPref';
import { usePalette } from '@/lib/theme';

export type TabStackProps = { title: string; indexOptions?: NativeStackNavigationOptions };

/** Android / default: standard top app bar on the tonal background. */
export function TabStack({ title, indexOptions }: TabStackProps) {
  const p = usePalette();
  const reduceMotion = useAppReducedMotion();
  return (
    <Stack
      screenOptions={{
        animation: reduceMotion ? 'none' : 'default',
        headerStyle: { backgroundColor: p.bg },
        headerTintColor: p.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: p.bg },
      }}>
      <Stack.Screen name="index" options={{ title, ...indexOptions }} />
    </Stack>
  );
}
