import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { GettingStarted, isGuideStep, isGuideTopic } from '@/ui/GettingStarted';

export default function GuideImageScreen() {
  const { topic, step } = useLocalSearchParams<{ topic?: string; step?: string }>();
  if (!isGuideTopic(topic)) return <Redirect href="/settings/guide" />;
  if (!isGuideStep(topic, step)) return <Redirect href={{ pathname: '/settings/guide-topic', params: { topic } }} />;
  return <GettingStarted review reviewRoute={{ topic, step: Number(step) }} onClose={() => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/settings/guide-topic', params: { topic } });
  }} />;
}
