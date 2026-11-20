import { Text } from 'react-native';
import { Stack } from 'expo-router';
import { getPendingAdvances, pendingAdvanceTotals } from '@dmm/core/utils/advances';
import { formatJPY, getTodayString } from '@dmm/core/utils/format';
import { useFinance } from '@/lib/store';
import { useFinanceSubmit } from '@/lib/useFinanceSubmit';
import { usePalette } from '@/lib/theme';
import { pickOne } from '@/lib/pick';
import { confirmAction } from '@/lib/confirmAction';
import { success } from '@/lib/haptics';
import { Group, Row, Screen, SectionTitle } from '@/ui/kit';

/** 立て替え（あとで回収）: what is still owed to the user, and one tap to record the payback. */
export default function Advances() {
  const submit = useFinanceSubmit('stay');
  const p = usePalette();
  const { state, accountNameMap, reimburseAdvance } = useFinance();
  const pending = getPendingAdvances(state.transactions);
  const totals = pendingAdvanceTotals(state.transactions);

  const collect = async (id: string) => {
    const adv = state.transactions.find((t) => t.id === id);
    if (!adv) return;
    const accountId = await pickOne(
      '回収した口座',
      state.accounts.map((a) => ({ id: a.id, label: a.name }))
    );
    if (!accountId) return;
    if (await submit(() => reimburseAdvance(adv.id, accountId, getTodayString()))) success();
  };

  return (
    <>
      <Stack.Screen options={{ title: '立て替え' }} />
      <Screen>
        {pending.length === 0 ? (
          <Text style={{ color: p.textSecondary, textAlign: 'center', padding: 40 }}>回収待ちの立て替えはありません</Text>
        ) : (
          <>
            <Group>
              <Row title="回収待ち合計" right={formatJPY(pending.reduce((s, t) => s + t.amount, 0))} />
              {totals.map((t) => (
                <Row key={t.name} title={t.name} right={formatJPY(t.amount)} />
              ))}
            </Group>
            <SectionTitle>明細（タップで回収済みにする）</SectionTitle>
            <Group>
              {pending.map((t) => (
                <Row
                  key={t.id}
                  title={t.title}
                  subtitle={`${t.date} · ${t.advance?.for ?? ''} · ${accountNameMap[t.accountId] ?? ''}`}
                  right={formatJPY(t.amount)}
                  onPress={() =>
                    confirmAction('回収済みにしますか？', `${t.advance?.for ?? ''}から ${formatJPY(t.amount)} を回収しました。`,
                      { text: '口座を選ぶ', onPress: () => void collect(t.id) })
                  }
                />
              ))}
            </Group>
          </>
        )}
      </Screen>
    </>
  );
}
