import { Stack } from 'expo-router';
import { AddButton } from '@/ui/AddButton';

/** iOS: large collapsing title over a translucent blurred navigation bar. */
export function TabStack({ title }: { title: string }) {
  return (
    <Stack
      screenOptions={{
        headerLargeTitleEnabled: true,
        headerTransparent: true,
        headerBlurEffect: 'systemMaterial',
        headerLargeTitleShadowVisible: false,
        headerShadowVisible: false,
      }}>
      <Stack.Screen name="index" options={{ title, headerRight: () => <AddButton /> }} />
    </Stack>
  );
}
