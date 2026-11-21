import { router, Stack } from 'expo-router';
import { GettingStarted } from '@/ui/GettingStarted';

export default function Guide() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <GettingStarted review onClose={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/settings');
      }} />
    </>
  );
}
