import { router, Stack } from 'expo-router';
import { Modal, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppReducedMotion } from '@/lib/motionPref';
import { GettingStarted } from '@/ui/GettingStarted';

function closeGuide() {
  if (router.canGoBack()) router.back();
  else router.replace('/settings');
}

export default function Guide() {
  const reduceMotion = useAppReducedMotion();
  const guide = <GettingStarted review onClose={closeGuide} />;
  return (
    <>
      {Platform.OS !== 'ios' ? <Stack.Screen options={{ headerShown: false }} /> : null}
      {Platform.OS === 'android' ? (
        <Modal visible presentationStyle="fullScreen" hardwareAccelerated statusBarTranslucent navigationBarTranslucent
          animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={closeGuide}>
          <SafeAreaProvider>{guide}</SafeAreaProvider>
        </Modal>
      ) : guide}
    </>
  );
}
