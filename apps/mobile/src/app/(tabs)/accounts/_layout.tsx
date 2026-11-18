import { router } from 'expo-router';
import { Platform } from 'react-native';
import { HeaderAction } from '@/ui/HeaderAction';
import { TabStack } from '@/ui/StackLayout';
import { tick } from '@/lib/haptics';
import { usePalette } from '@/lib/theme';

export const unstable_settings = { initialRouteName: 'index' };

export default function Layout() {
  const p = usePalette();
  const openSettings = () => router.push('/settings');
  return <TabStack title="口座" indexOptions={Platform.OS === 'ios' ? {
    unstable_headerRightItems: () => [{
      type: 'button', icon: { type: 'sfSymbol', name: 'gearshape.fill' }, label: '設定',
      tintColor: p.tint, onPress: () => { tick(); openSettings(); },
    }],
  } : {
    headerRight: () => <HeaderAction name={{ ios: 'gearshape.fill', android: 'settings' }} label="設定" accent onPress={openSettings} />,
  }} />;
}
