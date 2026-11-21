import { Stack, router, type NativeStackNavigationOptions } from 'expo-router';
import { Platform } from 'react-native';
import { HeaderAction } from '@/ui/HeaderAction';
import { androidSettingsTransition, useAppReducedMotion } from '@/lib/motionPref';
import { usePalette } from '@/lib/theme';

function renderBackButton() {
  return (
    <HeaderAction name={{ ios: 'chevron.left', android: 'arrow_back' }} label="戻る" circular={Platform.OS === 'ios'}
      onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/accounts');
      }} />
  );
}

const settingsIndexOptions: NativeStackNavigationOptions = {
  title: '設定',
  ...(Platform.OS === 'ios' ? {
    unstable_headerLeftItems: () => [{
      type: 'custom',
      element: renderBackButton(),
      hidesSharedBackground: true,
    }],
  } : {
    headerLeft: renderBackButton,
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
