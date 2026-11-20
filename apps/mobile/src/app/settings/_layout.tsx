import { Stack, router } from 'expo-router';
import { HeaderAction } from '@/ui/HeaderAction';
import { androidSettingsTransition, useAppReducedMotion } from '@/lib/motionPref';
import { usePalette } from '@/lib/theme';

export default function Layout() {
  const p = usePalette();
  const reduceMotion = useAppReducedMotion();
  return (
    <Stack screenOptions={{
      ...androidSettingsTransition(reduceMotion),
      headerStyle: { backgroundColor: p.bg }, headerTintColor: p.text, headerShadowVisible: false,
      contentStyle: { backgroundColor: p.bg },
    }}>
      <Stack.Screen name="index" options={{ title: '設定', headerLeft: () => (
        <HeaderAction name={{ ios: 'chevron.left', android: 'arrow_back' }} label="戻る" onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/accounts');
        }} />
      ) }} />
    </Stack>
  );
}
