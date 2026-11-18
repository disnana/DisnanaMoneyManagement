import { useState } from 'react';
import { Alert, Text, TextInput } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import type { Account } from '@dmm/core/types/finance';
import { formatDayLabel } from '@dmm/core/utils/format';
import { ACCOUNT_ICONS } from '@/lib/accountIcons';
import { pickNear, pickOne, type PickOption } from '@/lib/pick';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { Group, Row, Screen, Segmented } from '@/ui/kit';

type CardType = 'credit' | 'debit';
const DAYS = Array.from({ length: 31 }, (_, i) => ({
  id: String(i + 1),
  label: formatDayLabel(i + 1),
}));

export default function CardSettings() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, activeLedger, addAccount, updateAccount } = useFinance();
  const p = usePalette();
  const existing = state.accounts.find((account) => account.id === id);
  const card = existing?.type === 'credit' || existing?.type === 'debit' ? existing : undefined;
  const banks = state.accounts.filter((account) => account.type === 'bank');
  const [type, setType] = useState<CardType>(card?.type === 'debit' ? 'debit' : 'credit');
  const [name, setName] = useState(card?.name ?? '');
  const [institution, setInstitution] = useState(card?.institution ?? '');
  const [bankId, setBankId] = useState<string | undefined>(card ? card.linkedBankAccountId : banks[0]?.id);
  const [closingDay, setClosingDay] = useState(card?.closingDay ?? 31);
  const [paymentDay, setPaymentDay] = useState(card?.paymentDay ?? 27);
  const [offset, setOffset] = useState<1 | 2>(card?.paymentMonthOffset ?? 1);
  const [limit, setLimit] = useState(card?.creditLimit ? String(card.creditLimit) : '');
  const [warningDays, setWarningDays] = useState(card?.paymentWarningDays ?? 0);
  const bank = banks.find((account) => account.id === bankId);
  const fixedBank = card?.type === 'debit' && Boolean(bank) &&
    state.transactions.some((tx) => tx.accountId === card.id);

  const save = () => {
    if (!name.trim()) {
      Alert.alert('カード名を入力してください');
      return;
    }
    if (type === 'debit' && !bank) {
      Alert.alert('引落口座を選んでください');
      return;
    }
    const creditLimit = limit ? Number(limit) : undefined;
    if (creditLimit !== undefined && !Number.isSafeInteger(creditLimit)) {
      Alert.alert('利用限度額を確認してください');
      return;
    }
    const details = {
      name: name.trim(),
      institution: institution.trim() || undefined,
      linkedBankAccountId: bank?.id,
      ...(type === 'credit' ? {
        closingDay, paymentDay, paymentMonthOffset: offset, creditLimit, paymentWarningDays: warningDays || undefined,
      } : {}),
    } satisfies Partial<Account>;
    if (card) updateAccount(card.id, details);
    else addAccount({ ...details, type, initialBalance: 0, ledgerId: activeLedger?.id });
    router.back();
  };

  const selectDay = async (label: string, setDay: (day: number) => void) => {
    const choice = await pickOne(label, DAYS);
    if (choice) setDay(Number(choice));
  };

  const inputStyle = { minHeight: 52, paddingHorizontal: 16, color: p.text, fontSize: 16 };

  return (
    <>
      <Stack.Screen options={{ title: card ? 'カード設定' : 'カードを追加' }} />
      <Screen automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">
        {id && !card ? (
          <Text style={{ color: p.textSecondary }}>カードが見つかりません</Text>
        ) : (
          <>
            {!card ? (
              <Segmented<CardType>
                value={type}
                onChange={setType}
                options={[{ id: 'credit', label: 'クレジット' }, { id: 'debit', label: 'デビット' }]}
              />
            ) : null}
            <Group>
              <TextInput
                accessibilityLabel="カード名"
                placeholder="カード名"
                placeholderTextColor={p.textSecondary}
                value={name}
                onChangeText={setName}
                style={inputStyle}
              />
              <TextInput
                accessibilityLabel="発行会社"
                placeholder="発行会社（任意）"
                placeholderTextColor={p.textSecondary}
                value={institution}
                onChangeText={setInstitution}
                style={inputStyle}
              />
              <Row title="引落口座" right={bank?.name ?? '未選択'} chevron={!fixedBank}
                onPress={fixedBank ? undefined : async (event) => {
                  const options: PickOption[] = banks.map((account) => ({
                    id: account.id, label: account.name, icon: ACCOUNT_ICONS.bank, selected: bankId === account.id,
                  }));
                  if (type === 'credit') options.push({ id: '', label: '指定なし', selected: !bankId });
                  if (options.length === 0) {
                    Alert.alert('登録済みの銀行口座がありません');
                    return;
                  }
                  const choice = await pickNear(event, '引落口座', options);
                  if (choice !== null) setBankId(choice || undefined);
                }}
              />
            </Group>
            {type === 'credit' ? (
              <Group>
                <Row title="締め日" right={formatDayLabel(closingDay)} chevron onPress={() => selectDay('締め日', setClosingDay)} />
                <Row title="支払日" right={formatDayLabel(paymentDay)} chevron onPress={() => selectDay('支払日', setPaymentDay)} />
                <Row title="支払月" right={offset === 1 ? '翌月' : '翌々月'} chevron onPress={async () => {
                  const choice = await pickOne('支払月', [{ id: '1', label: '翌月' }, { id: '2', label: '翌々月' }]);
                  if (choice) setOffset(choice === '2' ? 2 : 1);
                }} />
                <TextInput
                  accessibilityLabel="利用限度額"
                  placeholder="利用限度額（任意）"
                  placeholderTextColor={p.textSecondary}
                  keyboardType="number-pad"
                  value={limit}
                  onChangeText={(value) => setLimit(value.replace(/[^0-9]/g, ''))}
                  style={inputStyle}
                />
                <Row title="支払日前の警告" subtitle="期日が近づくとホームに表示"
                  right={warningDays ? `${warningDays}日前` : 'オフ'} chevron onPress={async () => {
                    const choice = await pickOne('支払日前の警告', [
                      { id: '0', label: 'オフ' },
                      ...[1, 3, 7].map((days) => ({ id: String(days), label: `${days}日前` })),
                    ]);
                    if (choice !== null) setWarningDays(Number(choice));
                  }} />
              </Group>
            ) : null}
            {fixedBank ? (
              <Text style={{ color: p.textSecondary }}>記録済みの決済は現在の引落口座に紐づいています。</Text>
            ) : null}
            <Group><Row title="保存" onPress={save} /></Group>
          </>
        )}
      </Screen>
    </>
  );
}
