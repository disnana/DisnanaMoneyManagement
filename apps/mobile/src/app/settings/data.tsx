import { useState } from 'react';
import { Text, type GestureResponderEvent } from 'react-native';
import { Stack } from 'expo-router';
import { getCurrentMonthKey } from '@dmm/core/utils/format';
import { success } from '@/lib/haptics';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { AnchoredDeleteDialog } from '@/ui/AnchoredDeleteDialog';
import type { PopoverAnchor } from '@/ui/AnchoredPopover';
import { Group, Row, Screen } from '@/ui/kit';

type Mode = 'clear' | 'sample';

export default function DataSettings() {
  const { state, clearAllData, resetToSampleData, setActiveLedgerId, setMonth, setTransactionFilter } = useFinance();
  const p = usePalette();
  const [pending, setPending] = useState<{ mode: Mode; anchor: PopoverAnchor }>();
  const [message, setMessage] = useState('');
  const ask = (mode: Mode, { nativeEvent }: GestureResponderEvent) =>
    setPending({ mode, anchor: { x: nativeEvent.pageX, y: nativeEvent.pageY } });
  const isSample = pending?.mode === 'sample';

  return (
    <>
      <Stack.Screen options={{ title: 'データ管理' }} />
      <Screen>
        <Group>
          <Row title="サンプルデータに置き換える" icon={{ ios: 'doc.text', android: 'description' }}
            subtitle="サンプルの口座と取引で試す" chevron onPress={(event) => ask('sample', event)} />
          <Row title="家計データを初期化" icon={{ ios: 'trash', android: 'delete' }} iconColor={p.danger}
            subtitle="空の家計簿から始める" chevron onPress={(event) => ask('clear', event)} />
        </Group>
        {message ? <Text accessibilityLiveRegion="polite" style={{ color: p.tint }}>{message}</Text> : null}
      </Screen>
      <AnchoredDeleteDialog heading={isSample ? 'サンプルデータに置き換えますか？' : '家計データを初期化しますか？'}
        title={pending ? `口座 ${state.accounts.length}件 · 取引 ${state.transactions.length}件` : undefined}
        description="現在の口座・取引・予算・貯金目標などが消えます。この操作は元に戻せません。"
        confirmLabel={isSample ? '置き換える' : '初期化する'} anchor={pending?.anchor}
        onCancel={() => setPending(undefined)} onDelete={() => {
          if (!pending) return;
          if (isSample) resetToSampleData();
          else clearAllData();
          setActiveLedgerId(null);
          setMonth(getCurrentMonthKey());
          setTransactionFilter('all');
          setPending(undefined);
          setMessage(isSample ? 'サンプルデータに置き換えました。' : '家計データを初期化しました。');
          success();
        }} />
    </>
  );
}
