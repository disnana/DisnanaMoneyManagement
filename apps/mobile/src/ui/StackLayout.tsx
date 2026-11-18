import { Stack, type NativeStackNavigationOptions } from 'expo-router';
import { usePalette } from '@/lib/theme';

export type TabStackProps = { title: string; indexOptions?: NativeStackNavigationOptions };

/** Android / default: standard top app bar on the tonal background. */
export function TabStack({ title, indexOptions }: TabStackProps) {
  const p = usePalette();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: p.bg },
        headerTintColor: p.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: p.bg },
      }}>
      <Stack.Screen name="index" options={{ title, ...indexOptions }} />
    </Stack>
  );
}
