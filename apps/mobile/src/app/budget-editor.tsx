import { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { getCategoryById } from '@dmm/core/data/categories';
import { categoryIcon } from '@/lib/categoryIcons';
import { useCategoryPicker } from '@/lib/categoryPicker';
import { ALL_LEDGER_ICON, ledgerColor, ledgerIcon } from '@/lib/ledgerAppearance';
import { useFinance } from '@/lib/store';
import { closeEditor, useFinanceSubmit } from '@/lib/useFinanceSubmit';
import { usePalette } from '@/lib/theme';
import { DeleteDialog } from '@/ui/DeleteDialog';
import { HeaderAction } from '@/ui/HeaderAction';
import { Group, Row, Screen } from '@/ui/kit';
import { PlanningInput } from '@/ui/PlanningForm';

export default function BudgetEditor() {
  const { categoryId, ledgerId } = useLocalSearchParams<{ categoryId?: string; ledgerId?: string }>();
  const { ledgers, state, upsertBudget, removeBudget } = useFinance();
  const p = usePalette();
  const pickCategory = useCategoryPicker();
  const ledger = ledgers.find((item) => item.id === ledgerId);
  const scopedBudgets = state.budgets.filter((item) => item.ledgerId === ledgerId);
  const initial = scopedBudgets.find((item) => item.categoryId === categoryId);
  const [category, setCategory] = useState(categoryId ?? '');
  const [amount, setAmount] = useState(initial ? String(initial.monthlyLimit) : '');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const submit = useFinanceSubmit();
  const selected = category ? getCategoryById(category, state.customCategories) : undefined;
  const existing = scopedBudgets.find((item) => item.categoryId === category);
  const missing = Boolean((ledgerId && !ledger) || (categoryId && !initial));
  const monthlyLimit = Number(amount);
  const valid = !missing && Boolean(category) && Number.isSafeInteger(monthlyLimit) && monthlyLimit > 0;

  return (
    <>
      <Stack.Screen options={{
        title: existing ? '予算を編集' : '予算を追加',
        headerRight: missing ? undefined : () => (
          <View style={{ flexDirection: 'row' }}>
            {existing ? (
              <HeaderAction name={{ ios: 'trash', android: 'delete' }} label="予算を削除"
                onPress={() => setDeleteOpen(true)} />
            ) : null}
            <HeaderAction name={{ ios: 'checkmark', android: 'check' }} label="予算を保存" accent disabled={!valid} onPress={async () => {
              if (valid && await submit(() => upsertBudget({ categoryId: category, monthlyLimit, ledgerId }))) closeEditor('/planning');
            }} />
          </View>
        ),
      }} />
      <Screen automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">
        {missing ? <Text style={{ color: p.textSecondary }}>予算が見つかりません</Text> : (
          <Group>
            <Row title="家計グループ" right={ledger?.name ?? 'すべて'}
              icon={ledger ? ledgerIcon(ledger) : ALL_LEDGER_ICON} iconColor={ledgerColor(ledger)} />
            <Row title="カテゴリ" right={selected?.name ?? '選択'} chevron={!categoryId}
              icon={selected ? categoryIcon(selected.icon ?? selected.id) : { ios: 'tag', android: 'label' }}
              iconColor={selected?.color}
              onPress={categoryId ? undefined : () => void pickCategory('expense', category, (id) => {
                const budget = scopedBudgets.find((item) => item.categoryId === id);
                setCategory(id);
                setAmount(budget ? String(budget.monthlyLimit) : '');
              })} />
            <PlanningInput label="毎月の上限" icon={{ ios: 'yensign', android: 'currency_yen' }} value={amount} onChange={setAmount} yen />
          </Group>
        )}
      </Screen>
      <DeleteDialog heading="カテゴリ予算を削除しますか？" title={selected?.name} visible={deleteOpen}
        onCancel={() => setDeleteOpen(false)} onDelete={async () => {
          if (!existing || !await submit(() => removeBudget(existing.categoryId, ledgerId))) return;
          setDeleteOpen(false);
          closeEditor('/planning');
        }} />
    </>
  );
}
