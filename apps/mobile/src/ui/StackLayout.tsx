import { Stack } from 'expo-router';
import { usePalette } from '@/lib/theme';
import { AddButton } from '@/ui/AddButton';
import { SettingsButton } from '@/ui/SettingsButton';

/** Android / default: standard top app bar on the tonal background. */
export function TabStack({ title }: { title: string }) {
  const p = usePalette();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: p.bg },
        headerTintColor: p.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: p.bg },
      }}>
      <Stack.Screen name="index" options={{ title, headerRight: () => <AddButton />, headerLeft: () => <SettingsButton /> }} />
    </Stack>
  );
}
