import { ActivityIndicator, Text, View } from 'react-native';
import type { FinanceState } from '@dmm/core/types/finance';
import { usePalette } from '@/lib/theme';
import { Group, Row } from './kit';
import { LocalFinanceBackup } from './LocalFinanceBackup';

export function FinanceRecovery({ loading, retry, restore }: {
  loading: boolean; retry: () => void; restore: (state: FinanceState) => Promise<void>;
}) {
  const p = usePalette();
  return <View style={{ flex: 1, justifyContent: 'center', gap: 16, padding: 24, backgroundColor: p.bg }}>
    {loading ? <ActivityIndicator color={p.tint} accessibilityLabel="家計データを読み込み中" /> : <>
      <Text accessibilityRole="header" style={{ color: p.text, fontSize: 20, fontWeight: '700' }}>家計データを開けませんでした</Text>
      <Text style={{ color: p.textSecondary, fontSize: 15 }}>元のデータを保持しています。保存先を確認して再読み込みするか、バックアップから復元してください。</Text>
      <Group><Row title="再読み込み" chevron onPress={retry} /></Group>
      <LocalFinanceBackup restore={restore} />
    </>}
  </View>;
}
