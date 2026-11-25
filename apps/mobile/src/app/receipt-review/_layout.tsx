import { Stack } from 'expo-router';
import { useAppReducedMotion } from '@/lib/motionPref';
import { usePalette } from '@/lib/theme';
import { ReceiptFlowProvider } from '@/ui/ReceiptFlow';

export default function ReceiptLayout() {
  const palette = usePalette();
  const reduceMotion = useAppReducedMotion();
  return (
    <ReceiptFlowProvider>
      <Stack screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: palette.bg },
        headerTintColor: palette.text,
        contentStyle: { backgroundColor: palette.bg },
        animation: reduceMotion ? 'none' : 'default',
      }}>
        <Stack.Screen name="index" options={{ title: 'AIレシート' }} />
        <Stack.Screen name="confirm" options={{ title: '送信内容を確認' }} />
        <Stack.Screen name="history" options={{ title: '端末に保存した結果' }} />
        <Stack.Screen name="results" options={{ title: '解析状況' }} />
        <Stack.Screen name="document" options={{ title: '書類の読み取り結果' }} />
      </Stack>
    </ReceiptFlowProvider>
  );
}
