import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { formatFullDate, formatJPY, getTodayString } from '@dmm/core/utils/format';
import { planSavings } from '@dmm/core/utils/planning';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { CardHeader, CardSurface } from '@/ui/CardSurface';
import { IconBadge, Row, Screen, SectionTitle } from '@/ui/kit';
import { LedgerPill } from '@/ui/LedgerPill';
import { PlanningProgress } from '@/ui/PlanningSummary';

export default function Savings() {
  const p = usePalette();
  const { state, activeLedger } = useFinance();
  const goals = state.savingsGoals.filter((goal) => !activeLedger || goal.ledgerId === activeLedger.id);
  const saved = goals.reduce((sum, goal) => sum + goal.currentAmount, 0);
  const achieved = goals.filter((goal) => goal.currentAmount >= goal.targetAmount).length;
  const today = getTodayString();
  const add = () => router.push({ pathname: '/savings/[id]', params: { id: 'new' } });

  return (
    <Screen>
      <CardSurface style={{ padding: 16, gap: 6, backgroundColor: p.card }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text accessibilityRole="header" style={{ color: p.text, fontSize: 15, fontWeight: '700', flexShrink: 1 }}>貯めた金額</Text>
          <LedgerPill />
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit
          style={{ color: p.income, fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{formatJPY(saved)}</Text>
        <Text style={{ color: p.textSecondary, fontSize: 13 }}>達成 {achieved} / {goals.length} 件</Text>
      </CardSurface>

      <SectionTitle action={goals.length ? '目標を追加' : undefined} onAction={add}>貯金目標</SectionTitle>
      {goals.length === 0 ? (
        <CardSurface><Row title="貯金目標を追加" subtitle="目標額を決めて、積立を記録"
          icon={{ ios: 'plus.circle', android: 'add_circle' }} chevron onPress={add} /></CardSurface>
      ) : goals.map((goal) => {
        const plan = planSavings(goal, today);
        const open = (mode: 'edit' | 'deposit') => router.push({ pathname: '/savings/[id]', params: { id: goal.id, mode } });
        return (
          <CardSurface key={goal.id}>
            <CardHeader style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8 }}>
              <IconBadge name={{ ios: 'target', android: 'flag' }} color={p.tint} size={32} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text accessibilityRole="header" style={{ color: p.text, fontSize: 15, fontWeight: '700' }}>{goal.title}</Text>
                {goal.targetDate ? <Text style={{ color: p.textSecondary, fontSize: 12 }}>目標日 {formatFullDate(goal.targetDate)}</Text> : null}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`${goal.title}を編集`} onPress={() => open('edit')}
                style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: p.tint, fontSize: 14, fontWeight: '600' }}>編集</Text>
              </Pressable>
            </CardHeader>
            <View style={{ padding: 14, gap: 9 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <Text numberOfLines={1} adjustsFontSizeToFit style={{ flexShrink: 1, color: p.income, fontSize: 23, fontWeight: '800',
                  fontVariant: ['tabular-nums'] }}>{formatJPY(goal.currentAmount)}</Text>
                <Text style={{ color: p.textSecondary, fontSize: 13 }}>目標 {formatJPY(goal.targetAmount)}</Text>
              </View>
              <PlanningProgress amount={goal.currentAmount} total={goal.targetAmount}
                color={plan.overdue ? p.danger : p.tint} label={`${goal.title}の達成率`} />
              <Text style={{ color: plan.overdue ? p.danger : p.text, fontSize: 13, fontWeight: '600' }}>
                {plan.remaining ? `残り ${formatJPY(plan.remaining)}` : '目標達成'}
                {plan.overdue ? ' · 目標日を経過' : ''}
              </Text>
              {plan.monthlyRequired !== undefined && plan.remaining > 0 ? (
                <Text style={{ color: plan.monthlyShortfall ? p.danger : p.textSecondary, fontSize: 13 }}>
                  目標日まで月 {formatJPY(plan.monthlyRequired)}
                  {plan.monthlyShortfall && goal.monthlyContribution ? ` · 積立予定より月 ${formatJPY(plan.monthlyShortfall)} 不足` : ''}
                </Text>
              ) : null}
              {goal.monthlyContribution && plan.remaining > 0 ? (
                <Text style={{ color: p.textSecondary, fontSize: 13 }}>
                  毎月 {formatJPY(goal.monthlyContribution)} の予定 · あと {plan.monthsToGoal} か月
                </Text>
              ) : null}
              <Pressable accessibilityRole="button" accessibilityLabel={`${goal.title}の積立を記録`} onPress={() => open('deposit')}
                style={({ pressed }) => ({ minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10,
                  marginTop: 3, backgroundColor: pressed ? p.fill : `${p.tint}15` })}>
                <Text style={{ color: p.tint, fontSize: 14, fontWeight: '700' }}>積立を記録</Text>
              </Pressable>
            </View>
          </CardSurface>
        );
      })}
    </Screen>
  );
}
