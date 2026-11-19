import { useRef, useState } from 'react';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { formatJPY } from '@dmm/core/utils/format';
import { isPlanningDate } from '@dmm/core/utils/planning';
import { success } from '@/lib/haptics';
import { DeleteDialog } from '@/ui/DeleteDialog';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { Group, Row, Screen } from '@/ui/kit';
import { PlanningActions, PlanningInput } from '@/ui/PlanningForm';
import { PlanningSummary } from '@/ui/PlanningSummary';

export default function SavingsGoalEditor() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const { state, activeLedger, addSavingsGoal, updateSavingsGoal, deleteSavingsGoal, contributeToGoal } = useFinance();
  const p = usePalette();
  const goal = state.savingsGoals.find((item) => item.id === id);
  const isNew = id === 'new';
  const depositing = !isNew && mode === 'deposit';
  const heading = depositing ? '積立を記録' : isNew ? '貯金目標を追加' : '貯金目標を編集';
  const [title, setTitle] = useState(goal?.title ?? '');
  const [target, setTarget] = useState(goal ? String(goal.targetAmount) : '');
  const [date, setDate] = useState(goal?.targetDate ?? '');
  const [monthly, setMonthly] = useState(goal?.monthlyContribution ? String(goal.monthlyContribution) : '');
  const [amount, setAmount] = useState(monthly);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const closing = useRef(false);
  const validDate = !date || isPlanningDate(date);
  const valid = depositing
    ? Boolean(goal && Number(amount) > 0 && Number.isSafeInteger(goal.currentAmount + Number(amount)))
    : Boolean(title.trim()) && Number(target) > 0 && validDate;
  const close = () => router.canGoBack() ? router.back() : router.replace({ pathname: '/planning', params: { section: 'savings' } });
  const save = () => {
    if (!valid || closing.current) return;
    closing.current = true;
    if (depositing && goal) contributeToGoal(goal.id, Number(amount));
    else {
      const details = { title: title.trim(), targetAmount: Number(target), targetDate: date || undefined,
        monthlyContribution: Number(monthly) || undefined };
      if (isNew) addSavingsGoal({ ...details, currentAmount: 0, ledgerId: activeLedger?.id });
      else if (goal) updateSavingsGoal(goal.id, details);
    }
    success();
    close();
  };

  return (
    <>
      <Stack.Screen options={{ title: heading }} />
      <Screen automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">
        {!isNew && !goal ? <Text style={{ color: p.textSecondary }}>貯金目標が見つかりません</Text> : (
          <>
            {depositing && goal ? (
              <>
                <PlanningSummary label={goal.title} value={formatJPY(goal.currentAmount)} color={p.income} detail={`目標 ${formatJPY(goal.targetAmount)}`} />
                <Group><PlanningInput label="積立額" icon={{ ios: 'yensign', android: 'currency_yen' }} value={amount} onChange={setAmount} yen /></Group>
              </>
            ) : (
              <Group>
                <PlanningInput label="目標名" icon={{ ios: 'flag', android: 'flag' }} placeholder="例：旅行資金" value={title} onChange={setTitle} />
                <PlanningInput label="目標額" icon={{ ios: 'yensign', android: 'currency_yen' }} value={target} onChange={setTarget} yen />
                <PlanningInput label="目標日" icon={{ ios: 'calendar', android: 'calendar_today' }} optional placeholder="YYYY-MM-DD" value={date} onChange={setDate} />
                <PlanningInput label="毎月の積立予定" icon={{ ios: 'calendar.badge.plus', android: 'event_repeat' }} optional value={monthly} onChange={setMonthly} yen />
              </Group>
            )}
            {!depositing && !validDate ? <Text style={{ color: p.danger }}>目標日は YYYY-MM-DD 形式で入力してください。</Text> : null}
            <PlanningActions label={depositing ? '積立を記録' : '保存'} close={close} valid={valid} save={save} />
            {!depositing && goal ? (
              <Group><Row title="貯金目標を削除" icon={{ ios: 'trash', android: 'delete' }} iconColor={p.danger}
                onPress={() => setDeleteOpen(true)} /></Group>
            ) : null}
          </>
        )}
      </Screen>
      <DeleteDialog visible={deleteOpen && Boolean(goal) && !depositing} heading="貯金目標を削除しますか？" title={goal?.title}
        onCancel={() => setDeleteOpen(false)} onDelete={() => {
          if (!goal || closing.current) return;
          closing.current = true;
          deleteSavingsGoal(goal.id);
          setDeleteOpen(false);
          close();
        }} />
    </>
  );
}
