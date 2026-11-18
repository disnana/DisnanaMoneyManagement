import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { getCategoryById } from '@dmm/core/data/categories';
import { categoryIcon } from '@/lib/categoryIcons';
import { pickCategory } from '@/lib/categoryPicker';
import { ALL_LEDGER_ICON, ledgerColor, ledgerIcon } from '@/lib/ledgerAppearance';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { AnchoredDeleteDialog } from '@/ui/AnchoredDeleteDialog';
import type { PopoverAnchor } from '@/ui/AnchoredPopover';
import { HeaderAction } from '@/ui/HeaderAction';
import { Group, Row, Screen } from '@/ui/kit';
import { PlanningInput } from '@/ui/PlanningForm';

export default function BudgetEditor() {
  const { categoryId, ledgerId } = useLocalSearchParams<{ categoryId?: string; ledgerId?: string }>();
  const { ledgers, state, upsertBudget, removeBudget } = useFinance();
  const p = usePalette();
  const ledger = ledgers.find((item) => item.id === ledgerId);
  const scopedBudgets = state.budgets.filter((item) => item.ledgerId === ledgerId);
  const initial = scopedBudgets.find((item) => item.categoryId === categoryId);
  const [category, setCategory] = useState(categoryId ?? '');
  const [amount, setAmount] = useState(initial ? String(initial.monthlyLimit) : '');
  const [deleteAnchor, setDeleteAnchor] = useState<PopoverAnchor>();
  const closing = useRef(false);
  const selected = category ? getCategoryById(category, state.customCategories) : undefined;
  const existing = scopedBudgets.find((item) => item.categoryId === category);
  const missing = Boolean((ledgerId && !ledger) || (categoryId && !initial));
  const monthlyLimit = Number(amount);
  const valid = !missing && Boolean(category) && Number.isSafeInteger(monthlyLimit) && monthlyLimit > 0;
  const close = () => router.canGoBack() ? router.back() : router.replace('/planning');

  return (
    <>
      <Stack.Screen options={{
        title: existing ? '予算を編集' : '予算を追加',
        headerRight: missing ? undefined : () => (
          <View style={{ flexDirection: 'row' }}>
            {existing ? (
              <HeaderAction name={{ ios: 'trash', android: 'delete' }} label="予算を削除"
                onPress={({ nativeEvent }) => setDeleteAnchor({ x: nativeEvent.pageX, y: nativeEvent.pageY })} />
            ) : null}
            <HeaderAction name={{ ios: 'checkmark', android: 'check' }} label="予算を保存" accent disabled={!valid} onPress={() => {
              if (!valid || closing.current) return;
              closing.current = true;
              upsertBudget({ categoryId: category, monthlyLimit, ledgerId });
              close();
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
              onPress={categoryId ? undefined : () => void pickCategory('expense', category, state, (id) => {
                const budget = scopedBudgets.find((item) => item.categoryId === id);
                setCategory(id);
                setAmount(budget ? String(budget.monthlyLimit) : '');
              })} />
            <PlanningInput label="毎月の上限（円）" value={amount} onChange={setAmount} yen />
          </Group>
        )}
      </Screen>
      <AnchoredDeleteDialog heading="カテゴリ予算を削除しますか？" title={selected?.name} anchor={deleteAnchor}
        onCancel={() => setDeleteAnchor(undefined)} onDelete={() => {
          if (!existing || closing.current) return;
          closing.current = true;
          setDeleteAnchor(undefined);
          removeBudget(existing.categoryId, ledgerId);
          close();
        }} />
    </>
  );
}
