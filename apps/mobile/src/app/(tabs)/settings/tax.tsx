import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { SymbolView } from 'expo-symbols';
import { INCOME_TAX_CATEGORY_LABELS } from '@dmm/core/data/categories';
import type { IncomeTaxCategory } from '@dmm/core/types/finance';
import { computeTaxSummary } from '@dmm/core/utils/tax';
import { buildTransactionsCsv, formatJPY, getTodayString } from '@dmm/core/utils/format';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { success, tick } from '@/lib/haptics';
import { Group, Row, Screen, SectionTitle } from '@/ui/kit';

/** 確定申告の準備: yearly business figures and a CSV for the accountant / e-Tax. */
export default function Tax() {
  const p = usePalette();
  const { state, accountNameMap } = useFinance();
  const [year, setYear] = useState(() => Number(getTodayString().slice(0, 4)));
  const yearTx = useMemo(() => state.transactions.filter((t) => t.date.slice(0, 4) === String(year)), [state.transactions, year]);
  const s = useMemo(() => computeTaxSummary(yearTx), [yearTx]);

  const exportCsv = async () => {
    const csv = buildTransactionsCsv(
      [...yearTx].sort((a, b) => a.date.localeCompare(b.date)),
      accountNameMap
    );
    const file = new File(Paths.cache, `kakeibo-${year}.csv`);
    file.create({ overwrite: true });
    file.write(csv);
    success();
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
  };

  const step = (delta: number, icon: { ios: string; android: string }) => (
    <Pressable hitSlop={8} onPress={() => { tick(); setYear((y) => y + delta); }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <SymbolView name={icon as never} size={18} tintColor={p.tint} />
    </Pressable>
  );

  return (
    <>
      <Stack.Screen options={{ title: '確定申告の準備' }} />
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          {step(-1, { ios: 'chevron.left', android: 'chevron_left' })}
          <Text style={{ color: p.text, fontSize: 17, fontWeight: '600', minWidth: 120, textAlign: 'center' }}>{year}年</Text>
          {step(1, { ios: 'chevron.right', android: 'chevron_right' })}
        </View>

        <View style={{ alignItems: 'center', gap: 2 }}>
          <Text style={{ color: p.textSecondary, fontSize: 13 }}>事業所得の見込み（収入 − 経費）</Text>
          <Text style={{ color: s.estimatedBusinessNet < 0 ? p.danger : p.text, fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{formatJPY(s.estimatedBusinessNet)}</Text>
        </View>

        <Group>
          <Row title="事業・雑所得の収入" right={formatJPY(s.businessAndMiscIncome)} />
          <Row title="経費（按分後）" right={formatJPY(s.totalDeductibleExpense)} />
          <Row title="源泉徴収された税額" right={formatJPY(s.totalWithholding)} />
        </Group>

        {s.incomeByTaxCategory.length > 0 ? (
          <>
            <SectionTitle>所得区分別の収入</SectionTitle>
            <Group>
              {s.incomeByTaxCategory.map((c) => (
                <Row key={c.key} title={INCOME_TAX_CATEGORY_LABELS[c.key as IncomeTaxCategory] ?? c.key} subtitle={`${c.count}件${c.withholding > 0 ? ` · 源泉 ${formatJPY(c.withholding)}` : ''}`} right={formatJPY(c.amount)} />
              ))}
            </Group>
          </>
        ) : null}

        {s.expenseBySubject.length > 0 ? (
          <>
            <SectionTitle>勘定科目別の経費</SectionTitle>
            <Group>
              {s.expenseBySubject.map((e) => (
                <Row key={e.subject} title={e.subject} subtitle={`${e.count}件 · 支払 ${formatJPY(e.gross)}`} right={formatJPY(e.deductible)} />
              ))}
            </Group>
          </>
        ) : (
          <Text style={{ color: p.textSecondary, textAlign: 'center', padding: 24 }}>この年の事業経費はまだありません。取引の記録で「事業」を選ぶと集計されます。</Text>
        )}

        <Group>
          <Row title={`${year}年の取引を CSV で書き出す`} icon={{ ios: 'square.and.arrow.up', android: 'ios_share' }} onPress={() => void exportCsv()} chevron />
        </Group>
      </Screen>
    </>
  );
}
