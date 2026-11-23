import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { GettingStarted, isGuideTopic } from '@/ui/GettingStarted';

export default function GuideTopicScreen() {
  const { topic } = useLocalSearchParams<{ topic?: string }>();
  if (!isGuideTopic(topic)) return <Redirect href="/settings/guide" />;
  return <GettingStarted review reviewRoute={{ topic }} onClose={() => {
    if (router.canGoBack()) router.back();
    else router.replace('/settings/guide');
  }} />;
}
