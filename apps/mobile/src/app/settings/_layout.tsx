import { Stack, router, type NativeStackNavigationOptions } from 'expo-router';
import { Platform } from 'react-native';
import { HeaderAction } from '@/ui/HeaderAction';
import { tick } from '@/lib/haptics';
import { androidSettingsTransition, useAppReducedMotion } from '@/lib/motionPref';
import { usePalette } from '@/lib/theme';

function goBackFromSettings() {
  if (router.canGoBack()) router.back();
  else router.replace('/accounts');
}

const settingsIndexOptions: NativeStackNavigationOptions = {
  title: '設定',
  ...(Platform.OS === 'ios' ? {
    unstable_headerLeftItems: () => [{
      type: 'button',
      icon: { type: 'sfSymbol', name: 'chevron.left' },
      label: '戻る',
      onPress: () => { tick(); goBackFromSettings(); },
    }],
  } : {
    headerLeft: () => (
      <HeaderAction name={{ ios: 'chevron.left', android: 'arrow_back' }} label="戻る" onPress={goBackFromSettings} />
    ),
  }),
};

export default function Layout() {
  const p = usePalette();
  const reduceMotion = useAppReducedMotion();
  return (
    <Stack screenOptions={{
      ...androidSettingsTransition(reduceMotion),
      headerStyle: { backgroundColor: p.bg }, headerTintColor: p.text, headerShadowVisible: false,
      contentStyle: { backgroundColor: p.bg },
    }}>
      <Stack.Screen name="index" options={settingsIndexOptions} />
    </Stack>
  );
}
