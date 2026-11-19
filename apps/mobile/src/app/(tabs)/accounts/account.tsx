import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ACCOUNT_TYPE_LABELS } from '@dmm/core/data/categories';
import type { Account, AccountType } from '@dmm/core/types/finance';
import { ACCOUNT_ICONS } from '@/lib/accountIcons';
import { ledgerColor, ledgerIcon } from '@/lib/ledgerAppearance';
import { useLedgerPicker } from '@/lib/ledgerPicker';
import { pickOne } from '@/lib/pick';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { DeleteDialog } from '@/ui/DeleteDialog';
import { HeaderAction } from '@/ui/HeaderAction';
import { TransactionInput } from '@/ui/TransactionForm';
import { Group, Row, Screen } from '@/ui/kit';

const TYPES: AccountType[] = ['bank', 'cash', 'emoney', 'investment', 'psp', 'foreign_bank'];

/** Add or edit a bank / cash / e-money / investment / payment-service account (cards have their own screen). */
export default function AccountEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, ledgers, activeLedger, addAccount, updateAccount, deleteAccount } = useFinance();
  const p = usePalette();
  const pickLedger = useLedgerPicker();
  const existing = state.accounts.find((a) => a.id === id);
  const editing = existing && existing.type !== 'credit' && existing.type !== 'debit' ? existing : undefined;
  const [type, setType] = useState<AccountType>(editing?.type ?? 'bank');
  const [name, setName] = useState(editing?.name ?? '');
  const [institution, setInstitution] = useState(editing?.institution ?? '');
  const [balance, setBalance] = useState(editing ? String(editing.initialBalance) : '');
  const [ledgerId, setLedgerId] = useState<string | undefined>(editing?.ledgerId ?? activeLedger?.id);
  const ledger = ledgers.find((l) => l.id === ledgerId);
  const used = editing ? state.transactions.some((tx) => tx.accountId === editing.id || tx.toAccountId === editing.id) : false;

  const save = () => {
    if (!name.trim()) {
      Alert.alert('口座名を入力してください');
      return;
    }
    const initialBalance = balance.trim() === '' || balance === '-' ? 0 : Number(balance);
    if (!Number.isSafeInteger(initialBalance)) {
      Alert.alert('開始残高を確認してください');
      return;
    }
    const details = { name: name.trim(), institution: institution.trim() || undefined, initialBalance, ledgerId } satisfies Partial<Account>;
    if (editing) updateAccount(editing.id, details);
    else addAccount({ ...details, type });
    router.back();
  };

  const [deleteOpen, setDeleteOpen] = useState(false);
  const remove = () => {
    if (!editing) return;
    setDeleteOpen(true);
  };

  return (
    <>
      <Stack.Screen options={{
        title: editing ? '口座の設定' : '口座を追加',
        headerRight: id && !editing ? undefined : () => <HeaderAction name={{ ios: 'checkmark', android: 'check' }} label="保存" accent onPress={save} />,
      }} />
      <Screen automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">
        {id && !editing ? <Text style={{ color: p.textSecondary }}>口座が見つかりません</Text> : (
          <>
            <Group>
              <Row title="種類" right={ACCOUNT_TYPE_LABELS[type]} icon={ACCOUNT_ICONS[type]} chevron={!editing}
                onPress={editing ? undefined : async () => {
                  const choice = await pickOne('口座の種類', TYPES.map((t) => ({ id: t, label: ACCOUNT_TYPE_LABELS[t], icon: ACCOUNT_ICONS[t], selected: t === type })));
                  if (choice) setType(choice as AccountType);
                }} />
              <TransactionInput label="口座名" icon={{ ios: 'text.alignleft', android: 'subject' }}
                placeholder="例：生活費口座" value={name} onChangeText={setName} />
              <TransactionInput label="金融機関" icon={{ ios: 'building.columns', android: 'account_balance' }} optional
                placeholder="金融機関・サービス名" value={institution} onChangeText={setInstitution} />
              <TransactionInput label="開始残高" icon={{ ios: 'yensign', android: 'currency_yen' }} unit="円"
                placeholder="0" keyboardType="numbers-and-punctuation" value={balance}
                onChangeText={(v) => setBalance(v.normalize('NFKC').replace(/[^0-9-]/g, '').replace(/(?!^)-/g, '').slice(0, 13))} />
              <Row title="家計グループ" right={ledger?.name ?? '選択'} chevron icon={ledger ? ledgerIcon(ledger) : undefined} iconColor={ledgerColor(ledger)}
                onPress={async () => {
                  const choice = await pickLedger(ledgerId);
                  if (choice) setLedgerId(choice);
                }} />
            </Group>
            <Text style={{ color: p.textSecondary, fontSize: 13, paddingHorizontal: 4 }}>
              開始残高は、記録を付け始める時点の残高です。以降の収支で増減します。
            </Text>
            {editing ? (
              <Group>
                <Row title="この口座を削除" subtitle={used ? '取引が記録されている口座は削除できません' : undefined}
                  rightColor={p.danger} onPress={used ? () => Alert.alert('削除できません', 'この口座には取引が記録されています。') : remove} />
              </Group>
            ) : null}
          </>
        )}
      </Screen>
      <DeleteDialog visible={deleteOpen && Boolean(editing) && !used} heading="口座を削除しますか？" title={editing?.name}
        onCancel={() => setDeleteOpen(false)} onDelete={() => {
          if (!editing) return;
          setDeleteOpen(false);
          deleteAccount(editing.id);
          router.dismissTo('/accounts');
        }} />
    </>
  );
}
