import { router } from 'expo-router';
import { Platform } from 'react-native';
import { HeaderAction } from '@/ui/HeaderAction';
import { TabStack } from '@/ui/StackLayout';
import { tick } from '@/lib/haptics';
import { usePalette } from '@/lib/theme';

export default function Layout() {
  const p = usePalette();
  const openPlanning = () => router.navigate('/planning');
  const planningButton = () => (
    <HeaderAction name={{ ios: 'list.clipboard', android: 'assignment' }} label="予算・計画" circular accent
      onPress={openPlanning} />
  );
  return <TabStack title="ホーム" indexOptions={Platform.OS === 'ios' ? {
    unstable_headerRightItems: () => [{
      type: 'button', icon: { type: 'sfSymbol', name: 'list.clipboard' }, label: '予算・計画',
      tintColor: p.tint, onPress: () => { tick(); openPlanning(); },
    }],
  } : {
    headerRight: planningButton,
  }} />;
}
