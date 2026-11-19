import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { SymbolView } from 'expo-symbols';
import { INCOME_TAX_CATEGORY_LABELS } from '@dmm/core/data/categories';
import type { IncomeTaxCategory } from '@dmm/core/types/finance';
import { computeTaxSummary } from '@dmm/core/utils/tax';
import { getLedgerTaxExemption } from '@dmm/core/utils/ledgers';
import { buildTransactionsCsv, formatJPY, getTodayString } from '@dmm/core/utils/format';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { success, tick } from '@/lib/haptics';
import { TransactionInput } from '@/ui/TransactionForm';
import { Group, Row, Screen, SectionTitle } from '@/ui/kit';
import { LedgerPicker } from '@/ui/LedgerPicker';

/** 確定申告の準備: yearly business figures and a CSV for the accountant / e-Tax. */
export default function Tax() {
  const p = usePalette();
  const { visibleState, activeLedger, accountNameMap, setLedgerTaxExemption } = useFinance();
  const [year, setYear] = useState(() => Number(getTodayString().slice(0, 4)));
  const [editor, setEditor] = useState<{ groupId: string; year: number }>();
  const [amount, setAmount] = useState('');
  const yearTx = useMemo(() => visibleState.transactions.filter((t) => t.date.slice(0, 4) === String(year)), [visibleState.transactions, year]);
  const s = useMemo(() => computeTaxSummary(yearTx), [yearTx]);
  const exemption = activeLedger ? getLedgerTaxExemption(activeLedger, year) : undefined;
  const editing = editor?.groupId === activeLedger?.id && editor?.year === year;
  const annualBase = activeLedger?.kind === 'business'
    ? s.estimatedBusinessNet
    : s.totalIncome - (s.incomeByTaxCategory.find((item) => item.key === 'non_taxable')?.amount ?? 0);

  const exportCsv = async () => {
    const csv = buildTransactionsCsv(
      [...yearTx].sort((a, b) => a.date.localeCompare(b.date)),
      accountNameMap,
      visibleState.customCategories
    );
    const suffix = activeLedger ? `-${activeLedger.id.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
    const file = new File(Paths.cache, `kakeibo-${year}${suffix}.csv`);
    file.create({ overwrite: true });
    file.write(csv);
    success();
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
  };

  const step = (delta: number, icon: { ios: string; android: string }) => (
    <Pressable accessibilityLabel={delta < 0 ? '前年' : '翌年'} accessibilityRole="button" hitSlop={8}
      onPress={() => { tick(); setYear((y) => y + delta); setEditor(undefined); }}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <SymbolView name={icon as never} size={18} tintColor={p.tint} />
    </Pressable>
  );

  return (
    <>
      <Stack.Screen options={{ title: '確定申告の準備' }} />
      <Screen keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <LedgerPicker />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          {step(-1, { ios: 'chevron.left', android: 'chevron_left' })}
          <Text style={{ color: p.text, fontSize: 17, fontWeight: '600', minWidth: 120, textAlign: 'center' }}>{year}年</Text>
          {step(1, { ios: 'chevron.right', android: 'chevron_right' })}
        </View>

        <View style={{ alignItems: 'center', gap: 2 }}>
          <Text style={{ color: p.textSecondary, fontSize: 13 }}>
            {!activeLedger || activeLedger.kind === 'business' ? '事業・雑所得の見込み（収入 − 経費）' : '年間の収入合計'}
          </Text>
          <Text style={{ color: p.text, fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
            {formatJPY(!activeLedger || activeLedger.kind === 'business' ? s.estimatedBusinessNet : s.totalIncome)}
          </Text>
        </View>

        <Group>
          <Row title="事業・雑所得の収入" right={formatJPY(s.businessAndMiscIncome)} />
          <Row title="経費（按分後）" right={formatJPY(s.totalDeductibleExpense)} />
          <Row title="源泉徴収された税額" right={formatJPY(s.totalWithholding)} />
        </Group>
        {activeLedger && exemption ? (
          <Group>
            <Row title="控除・免除額" right={formatJPY(exemption.amount)} chevron
              subtitle={exemption.sourceYear === year ? `${year}年の設定`
                : exemption.sourceYear ? `${exemption.sourceYear}年の設定を引き継ぎ` : '未設定'}
              onPress={() => {
                setEditor({ groupId: activeLedger.id, year });
                setAmount(String(exemption.amount));
              }} />
            {editing ? (
              <>
                <TransactionInput label="控除・免除額" icon={{ ios: 'yensign', android: 'currency_yen' }} unit="円"
                  value={amount} keyboardType="number-pad"
                  onChangeText={(text) => setAmount(text.normalize('NFKC').replace(/[^0-9]/g, '').slice(0, 15))} />
                <Row title="この年の設定を保存" onPress={() => {
                  if (amount === '') return;
                  setLedgerTaxExemption(activeLedger.id, year, Number(amount));
                  setEditor(undefined);
                }} />
                {exemption.sourceYear === year ? (
                  <Row title="この年の設定を解除" subtitle="以前の設定を引き継ぐ" onPress={() => {
                    setLedgerTaxExemption(activeLedger.id, year);
                    setEditor(undefined);
                  }} />
                ) : null}
              </>
            ) : null}
            <Row title="控除後の参考額" right={formatJPY(Math.max(0, annualBase - exemption.amount))}
              subtitle={activeLedger.kind === 'business' ? '事業・雑所得の見込みから計算' : '非課税区分を除いた収入から計算'} />
          </Group>
        ) : null}

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
