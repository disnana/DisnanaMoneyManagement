import { useMemo } from 'react';
import { Text, View } from 'react-native';
import type { Account, PurchaseCandidate } from '@dmm/core/types/finance';
import { formatJPY, formatMonthLabel, getCurrentMonthKey, shiftMonth } from '@dmm/core/utils/format';
import { averageMonthlyNet, budgetOverview, installmentPlan, monthsUntilAffordable } from '@dmm/core/utils/purchasePlan';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { DonutChart } from '@/ui/PieChart';
import { Group, Row, SectionTitle } from '@/ui/kit';

const AMBER = '#F59E0B';

/** Instalment plan and "when can I buy it" for one purchase (candidate or draft). */
export function PurchaseInsights({ amount, month, ledgerId, categoryId, installment, bank }: {
  amount?: number;
  month: string;
  ledgerId?: string;
  categoryId?: string;
  installment?: PurchaseCandidate['installment'];
  bank?: Account;
}) {
  const p = usePalette();
  const { state, accountBalances } = useFinance();

  const plan = amount && installment && installment.count > 1 ? installmentPlan(amount, installment.count, installment.annualRatePct) : undefined;

  const balance = bank ? accountBalances[bank.id] ?? 0 : undefined;
  const surplus = useMemo(() => averageMonthlyNet(state, getCurrentMonthKey(), 3, ledgerId ?? null), [state, ledgerId]);
  const months = amount && balance !== undefined ? monthsUntilAffordable(amount, balance, surplus) : undefined;

  return (
    <>
      {amount && bank ? (
        <>
          <SectionTitle>いつ買える？</SectionTitle>
          <View style={{ backgroundColor: p.card, borderRadius: 15, padding: 16, gap: 4 }}>
            <Text style={{ color: months === 0 ? p.income : months === undefined ? p.danger : p.text, fontSize: 17, fontWeight: '700' }}>
              {months === 0
                ? `${bank.name}の残高で今すぐ買えます`
                : months === undefined
                  ? '今のペースでは届きません'
                  : `あと約${months}か月（${formatMonthLabel(shiftMonth(getCurrentMonthKey(), months))}ごろ）`}
            </Text>
            <Text style={{ color: p.textSecondary, fontSize: 13 }}>
              {bank.name}の残高 {formatJPY(balance ?? 0)} ・ 直近3か月の平均収支 {surplus >= 0 ? '+' : ''}{formatJPY(surplus)}／月
            </Text>
          </View>
        </>
      ) : null}
      {plan && amount ? (
        <>
          <SectionTitle>分割払いの目安</SectionTitle>
          <Group>
            <Row title="毎月の支払い" subtitle={`${installment?.count}回・年率 ${installment?.annualRatePct ?? 0}%`} right={formatJPY(plan.monthly)} />
            <Row title="支払総額" right={formatJPY(plan.total)} />
            <Row title="利息・手数料の合計" right={formatJPY(plan.interest)} rightColor={plan.interest > 0 ? p.danger : undefined} />
            <Row title={`毎月の収支（平均 ${formatJPY(surplus)}）に対して`}
              right={`${surplus > 0 ? Math.round((plan.monthly / surplus) * 100) : '—'}${surplus > 0 ? '%' : ''}`}
              rightColor={surplus > 0 && plan.monthly > surplus ? p.danger : undefined} />
          </Group>
        </>
      ) : null}

    </>
  );
}

function Legend({ color, label, value, strong }: { color: string; label: string; value: string; strong?: boolean }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text style={{ flex: 1, color: p.textSecondary, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: p.text, fontSize: 15, fontWeight: strong ? '700' : '600', fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

/**
 * The "am I overspending?" picture: a ring of this month's budget use with the planned purchase(s) added,
 * and a plain verdict (safe / careful / over) so the cost of buying is felt before deciding.
 */
export function BudgetPie({ month, ledgerId, extras, title }: {
  month: string;
  ledgerId?: string;
  extras: { categoryId: string; amount: number }[];
  title?: string;
}) {
  const p = usePalette();
  const { state } = useFinance();
  const before = useMemo(() => budgetOverview(state, month, ledgerId), [state, month, ledgerId]);
  const after = useMemo(() => budgetOverview(state, month, ledgerId, extras), [state, month, ledgerId, extras]);
  if (after.limit <= 0) {
    return <Text style={{ color: p.textSecondary, fontSize: 13 }}>この家計グループに予算を設定すると、購入後の使い過ぎを円グラフで確認できます。</Text>;
  }
  const added = Math.max(0, after.spent - before.spent);
  const over = after.spent > after.limit;
  const careful = !over && after.ratio >= 0.8;
  const tone = over ? p.danger : careful ? AMBER : p.income;
  const overBy = after.spent - after.limit;
  const slices = [
    { id: 'spent', value: before.spent, color: before.spent > before.limit ? p.danger : p.tint },
    { id: 'plan', value: added, color: over ? p.danger : AMBER },
    ...(over ? [] : [{ id: 'left', value: after.limit - after.spent, color: p.fill }]),
  ];
  return (
    <>
      <SectionTitle>{title ?? `${formatMonthLabel(month)}の予算の使い方`}</SectionTitle>
      <View style={{ backgroundColor: p.card, borderRadius: 15, padding: 16, gap: 14 }}>
        <View style={{ borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: tone + '22' }}>
          <Text style={{ color: tone, fontSize: 16, fontWeight: '800' }}>
            {over ? `予算を ${formatJPY(overBy)} 超えます` : careful ? `予算の ${Math.round(after.ratio * 100)}% を使います` : `予算内です（残り ${formatJPY(after.limit - after.spent)}）`}
          </Text>
          {over ? <Text style={{ color: p.text, fontSize: 13, marginTop: 2 }}>今月は見送るか、来月に回すことも考えてみましょう。</Text> : null}
        </View>
        <DonutChart size={200} thickness={24} slices={slices}
          centerLabel={over ? '予算超過' : '購入後の使用率'} centerValue={`${Math.round(after.ratio * 100)}%`} />
        <View style={{ gap: 6 }}>
          <Legend color={before.spent > before.limit ? p.danger : p.tint} label="いまの支出" value={formatJPY(before.spent)} />
          {added > 0 ? <Legend color={over ? p.danger : AMBER} label="この購入" value={`+${formatJPY(added)}`} /> : null}
          <Legend color={p.fill} label="今月の予算の合計" value={formatJPY(after.limit)} strong />
        </View>
        {after.items.some((i) => i.over) ? (
          <View style={{ gap: 4 }}>
            {after.items.filter((i) => i.over).map((i) => (
              <Text key={i.categoryId} style={{ color: p.danger, fontSize: 13 }}>
                {i.name}：{formatJPY(i.spent - i.limit)} 超過（予算 {formatJPY(i.limit)}）
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </>
  );
}
