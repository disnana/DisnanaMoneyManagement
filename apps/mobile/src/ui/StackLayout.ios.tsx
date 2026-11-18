import { Stack } from 'expo-router';
import { AddButton } from '@/ui/AddButton';

/** iOS: compact inline title over a translucent blurred navigation bar (keeps the top tight). */
export function TabStack({ title }: { title: string }) {
  return (
    <Stack
      screenOptions={{
        headerLargeTitleEnabled: false,
        headerTransparent: true,
        headerBlurEffect: 'systemMaterial',
        headerLargeTitleShadowVisible: false,
        headerShadowVisible: false,
      }}>
      <Stack.Screen name="index" options={{ title, headerRight: () => <AddButton /> }} />
    </Stack>
  );
}
