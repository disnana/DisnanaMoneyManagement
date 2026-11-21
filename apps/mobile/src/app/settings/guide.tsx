import { router, Stack } from 'expo-router';
import { Modal, Platform } from 'react-native';
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
      <Stack.Screen options={{ headerShown: false }} />
      {Platform.OS === 'android' ? (
        <Modal visible presentationStyle="fullScreen" hardwareAccelerated
          animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={closeGuide}>
          {guide}
        </Modal>
      ) : guide}
    </>
  );
}
