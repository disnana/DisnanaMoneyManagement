import { useRef, useState } from 'react';
import { Alert, Text } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import type { Account } from '@dmm/core/types/finance';
import { formatDayLabel } from '@dmm/core/utils/format';
import { getAccountLedger } from '@dmm/core/utils/ledgers';
import { ACCOUNT_ICONS } from '@/lib/accountIcons';
import { ledgerColor, ledgerIcon } from '@/lib/ledgerAppearance';
import { useLedgerPicker } from '@/lib/ledgerPicker';
import { pickOne, type PickOption } from '@/lib/pick';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { HeaderAction } from '@/ui/HeaderAction';
import { CardHeader, CardSurface } from '@/ui/CardSurface';
import { Group, Row, Screen, SectionTitle, Segmented } from '@/ui/kit';
import { TransactionInput } from '@/ui/TransactionForm';

type CardType = 'credit' | 'debit';
const DAYS = Array.from({ length: 31 }, (_, i) => ({
  id: String(i + 1),
  label: formatDayLabel(i + 1),
}));

export default function CardSettings() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, ledgers, activeLedger, addAccount, updateAccount } = useFinance();
  const p = usePalette();
  const pickLedger = useLedgerPicker();
  const existing = state.accounts.find((account) => account.id === id);
  const card = existing?.type === 'credit' || existing?.type === 'debit' ? existing : undefined;
  const banks = state.accounts.filter((account) => account.type === 'bank');
  const [type, setType] = useState<CardType>(card?.type === 'debit' ? 'debit' : 'credit');
  const [name, setName] = useState(card?.name ?? '');
  const [institution, setInstitution] = useState(card?.institution ?? '');
  const [bankId, setBankId] = useState(card?.linkedBankAccountId);
  const [closingDay, setClosingDay] = useState(card?.closingDay ?? 31);
  const [paymentDay, setPaymentDay] = useState(card?.paymentDay ?? 27);
  const [offset, setOffset] = useState<1 | 2>(card?.paymentMonthOffset ?? 1);
  const [limit, setLimit] = useState(card?.creditLimit ? String(card.creditLimit) : '');
  const [warningDays, setWarningDays] = useState(card?.paymentWarningDays ?? 0);
  const [ledgerId, setLedgerId] = useState(() => card ? getAccountLedger(card, ledgers).id : activeLedger?.id ?? ledgers[0]?.id);
  const closing = useRef(false);
  const ledger = ledgers.find((l) => l.id === ledgerId);
  const bank = banks.find((account) => account.id === bankId);
  const fixedBank = card?.type === 'debit' && Boolean(bank) &&
    state.transactions.some((tx) => tx.accountId === card.id);

  const save = () => {
    if (closing.current) return;
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
    closing.current = true;
    if (card) updateAccount(card.id, details);
    else addAccount({ ...details, type, initialBalance: 0 });
    if (router.canGoBack()) router.back();
    else router.replace('/accounts');
  };

  const selectDay = async (label: string, currentDay: number, setDay: (day: number) => void) => {
    const choice = await pickOne(label, DAYS.map((day) => ({ ...day, selected: Number(day.id) === currentDay })), { layout: 'divided' });
    if (choice) setDay(Number(choice));
  };

  const selectBank = async () => {
    const options: PickOption[] = banks.map((account) => ({
      id: account.id, label: account.name, icon: ACCOUNT_ICONS.bank, selected: bankId === account.id,
    }));
    if (type === 'credit') options.push({ id: '', label: '指定なし', selected: !bank });
    const choice = await pickOne('引落口座', options, { layout: 'divided', searchLabel: '口座名を検索' });
    if (choice !== null) setBankId(choice || undefined);
  };
  const needsBank = type === 'debit' && banks.length === 0;
  const paymentMonth = offset === 1 ? '翌月' : '翌々月';

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
              <Segmented<CardType> prominent
                value={type}
                onChange={setType}
                options={[{ id: 'credit', label: 'クレジット' }, { id: 'debit', label: 'デビット' }]}
              />
            ) : null}
            <SectionTitle>カード情報</SectionTitle>
            <Group>
              <TransactionInput label="カード名" icon={ACCOUNT_ICONS[type]} placeholder="例：メインカード"
                value={name} onChangeText={setName} />
              <TransactionInput label="発行会社" icon={{ ios: 'building.2', android: 'business' }} optional
                value={institution} onChangeText={setInstitution} />
              <Row title="家計グループ" right={ledger?.name ?? '選択'} chevron icon={ledger ? ledgerIcon(ledger) : undefined} iconColor={ledgerColor(ledger)}
                onPress={async () => {
                  const choice = await pickLedger(ledgerId);
                  if (choice) setLedgerId(choice);
                }} />
            </Group>
            <SectionTitle>{type === 'credit' ? '請求と引き落とし' : '引き落とし'}</SectionTitle>
            <CardSurface>
              {type === 'credit' ? (
                <CardHeader style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                  <Text style={{ color: p.text, fontWeight: '700', fontSize: 15 }}>
                    {formatDayLabel(closingDay)}締め → {paymentMonth}{formatDayLabel(paymentDay)}払い
                  </Text>
                </CardHeader>
              ) : null}
              <Group>
                {needsBank ? (
                  <Row title="銀行口座を追加" subtitle="デビットカードの引落口座に使います"
                    chevron onPress={() => router.push('/accounts/account')} />
                ) : (
                  <Row title="引落口座" right={bank?.name ?? (type === 'credit' ? '指定なし' : '選択')}
                    subtitle={type === 'debit' ? (fixedBank ? '記録済みの決済はこの口座に紐づいています' : '支払うとすぐに引き落とされます') : undefined}
                    chevron={!fixedBank} onPress={fixedBank ? undefined : selectBank} />
                )}
                {type === 'credit' ? (
                  <>
                    <Row title="締め日" right={formatDayLabel(closingDay)} chevron onPress={() => selectDay('締め日', closingDay, setClosingDay)} />
                    <Row title="支払日" right={formatDayLabel(paymentDay)} chevron onPress={() => selectDay('支払日', paymentDay, setPaymentDay)} />
                    <Row title="支払月" right={paymentMonth} chevron onPress={async () => {
                      const choice = await pickOne('支払月', [
                        { id: '1', label: '翌月', selected: offset === 1 },
                        { id: '2', label: '翌々月', selected: offset === 2 },
                      ], { layout: 'divided' });
                      if (choice) setOffset(choice === '2' ? 2 : 1);
                    }} />
                  </>
                ) : null}
              </Group>
            </CardSurface>
            {type === 'credit' ? (
              <>
                <SectionTitle>利用枠と支払日の案内</SectionTitle>
                <Group>
                  <TransactionInput label="利用限度額" icon={{ ios: 'yensign', android: 'currency_yen' }} optional unit="円"
                    keyboardType="number-pad" value={limit}
                    onChangeText={(value) => setLimit(value.normalize('NFKC').replace(/[^0-9]/g, ''))} />
                  <Row title="支払日前の警告" subtitle="支払日が近づくとホームやカード詳細に表示"
                    right={warningDays ? `${warningDays}日前` : 'オフ'} chevron onPress={async () => {
                      const choice = await pickOne('支払日前の警告', [
                        { id: '0', label: 'オフ', selected: !warningDays },
                        ...[1, 3, 7].map((days) => ({ id: String(days), label: `${days}日前`, selected: days === warningDays })),
                      ], { layout: 'divided' });
                      if (choice !== null) setWarningDays(Number(choice));
                    }} />
                </Group>
              </>
            ) : null}
          </>
        )}
      </Screen>
    </>
  );
}
