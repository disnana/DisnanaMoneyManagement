import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { Account } from '@dmm/core/types/finance';
import { formatDayLabel } from '@dmm/core/utils/format';
import { ACCOUNT_ICONS } from '@/lib/accountIcons';
import { ledgerColor, ledgerIcon } from '@/lib/ledgerAppearance';
import { useLedgerPicker } from '@/lib/ledgerPicker';
import { pickOne, type PickOption } from '@/lib/pick';
import { useFinance } from '@/lib/store';
import { closeEditor, useFinanceSubmit } from '@/lib/useFinanceSubmit';
import { usePalette } from '@/lib/theme';
import { HeaderAction } from '@/ui/HeaderAction';
import { TransactionInput } from '@/ui/TransactionForm';
import { Group, Row, Screen, Segmented } from '@/ui/kit';

type CardType = 'credit' | 'debit';
const DAYS = Array.from({ length: 31 }, (_, i) => ({
  id: String(i + 1),
  label: formatDayLabel(i + 1),
}));

export default function CardSettings() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, ledgers, activeLedger, addAccount, updateAccount } = useFinance();
  const submit = useFinanceSubmit();
  const p = usePalette();
  const pickLedger = useLedgerPicker();
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
  const [ledgerId, setLedgerId] = useState<string | undefined>(card?.ledgerId ?? activeLedger?.id ?? ledgers[0]?.id);
  const ledger = ledgers.find((l) => l.id === ledgerId);
  const bank = banks.find((account) => account.id === bankId);
  const fixedBank = card?.type === 'debit' && Boolean(bank) &&
    state.transactions.some((tx) => tx.accountId === card.id);

  const save = async () => {
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
      ledgerId,
      ...(type === 'credit' ? {
        closingDay, paymentDay, paymentMonthOffset: offset, creditLimit, paymentWarningDays: warningDays || undefined,
      } : {}),
    } satisfies Partial<Account>;
    const saved = await submit(() => card ? updateAccount(card.id, details) : addAccount({ ...details, type, initialBalance: 0 }));
    if (saved) closeEditor('/accounts');
  };

  const selectDay = async (label: string, setDay: (day: number) => void) => {
    const choice = await pickOne(label, DAYS);
    if (choice) setDay(Number(choice));
  };


  return (
    <>
      <Stack.Screen options={{
        title: card ? 'カード設定' : 'カードを追加',
        headerRight: id && !card ? undefined : () => (
          <HeaderAction name={{ ios: 'checkmark', android: 'check' }} label="保存" accent onPress={save} />
        ),
      }} />
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
              <TransactionInput label="カード名" icon={{ ios: 'creditcard', android: 'credit_card' }}
                placeholder="例：メインカード" value={name} onChangeText={setName} />
              <TransactionInput label="発行会社" icon={{ ios: 'building.2', android: 'business' }} optional
                placeholder="カード会社名" value={institution} onChangeText={setInstitution} />
              <Row title="家計グループ" right={ledger?.name ?? '選択'} chevron icon={ledger ? ledgerIcon(ledger) : undefined} iconColor={ledgerColor(ledger)}
                onPress={async () => {
                  const choice = await pickLedger(ledgerId);
                  if (choice) setLedgerId(choice);
                }} />
              <Row title="引落口座" right={bank?.name ?? '未選択'} chevron={!fixedBank}
                onPress={fixedBank ? undefined : async () => {
                  const options: PickOption[] = banks.map((account) => ({
                    id: account.id, label: account.name, icon: ACCOUNT_ICONS.bank, selected: bankId === account.id,
                  }));
                  if (type === 'credit') options.push({ id: '', label: '指定なし', selected: !bankId });
                  if (options.length === 0) {
                    Alert.alert('登録済みの銀行口座がありません');
                    return;
                  }
                  const choice = await pickOne('引落口座', options);
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
                <TransactionInput label="利用限度額" icon={{ ios: 'yensign', android: 'currency_yen' }} optional unit="円"
                  keyboardType="number-pad" value={limit} onChangeText={(value) => setLimit(value.replace(/[^0-9]/g, ''))} />
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
          </>
        )}
      </Screen>
    </>
  );
}
