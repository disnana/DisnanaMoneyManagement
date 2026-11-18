import { router } from 'expo-router';
import { Platform } from 'react-native';
import { HeaderAction } from '@/ui/HeaderAction';
import { TabStack } from '@/ui/StackLayout';

export default function Layout() {
  const planningButton = () => (
    <HeaderAction name={{ ios: 'list.clipboard', android: 'assignment' }} label="予算・計画" circular
      onPress={() => router.push('/planning')} />
  );
  return <TabStack title="ホーム" indexOptions={Platform.OS === 'ios' ? {
    unstable_headerRightItems: () => [{
      type: 'custom', element: planningButton(), hidesSharedBackground: true,
    }],
  } : {
    headerRight: planningButton,
  }} />;
}
