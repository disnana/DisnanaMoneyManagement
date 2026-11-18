import { router } from 'expo-router';
import { Platform } from 'react-native';
import { tick } from '@/lib/haptics';
import { usePalette } from '@/lib/theme';
import { HeaderAction } from '@/ui/HeaderAction';
import { TabStack } from '@/ui/StackLayout';

export default function Layout() {
  const p = usePalette();
  const openPlanning = () => router.push('/planning');
  return <TabStack title="ホーム" indexOptions={Platform.OS === 'ios' ? {
    unstable_headerRightItems: () => [{
      type: 'button', icon: { type: 'sfSymbol', name: 'list.clipboard' }, label: '予算・計画',
      tintColor: p.tint, onPress: () => { tick(); openPlanning(); },
    }],
  } : {
    headerRight: () => <HeaderAction name={{ ios: 'list.clipboard', android: 'assignment' }} label="予算・計画" accent onPress={openPlanning} />,
  }} />;
}
