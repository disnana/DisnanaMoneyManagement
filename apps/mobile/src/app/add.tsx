import { useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { Account, IncomeTaxCategory, Transaction, TransactionScope, TransactionType } from '@dmm/core/types/finance';
import { ACCOUNTING_SUBJECTS, ACCOUNT_TYPE_LABELS, INCOME_TAX_CATEGORY_LABELS, getCategoryById, getOrderedCategories } from '@dmm/core/data/categories';
import { formatMonthLabel, getTodayString } from '@dmm/core/utils/format';
import { getBillingMonthForDate } from '@dmm/core/utils/creditCard';
import { getTransactionLedger } from '@dmm/core/utils/ledgers';
import { ACCOUNT_ICONS } from '@/lib/accountIcons';
import { categoryIcon } from '@/lib/categoryIcons';
import { ledgerColor, ledgerIcon, ledgerOptions } from '@/lib/ledgerAppearance';
import { pickCategory } from '@/lib/categoryPicker';
import { useFinance } from '@/lib/store';
import { usePalette, metrics } from '@/lib/theme';
import { pickOne } from '@/lib/pick';
import { success, tick } from '@/lib/haptics';
import { KEYBOARD_ACCESSORY_ID } from '@/ui/KeyboardDone';
import { Group, IconBadge, Segmented } from '@/ui/kit';
import { AnchoredDeleteDialog } from '@/ui/AnchoredDeleteDialog';
import type { PopoverAnchor } from '@/ui/AnchoredPopover';
import { HeaderAction } from '@/ui/HeaderAction';
import { TransactionDatePicker } from '@/ui/TransactionDatePicker';
import { TransactionInput } from '@/ui/TransactionForm';

const TYPE_LABELS = { income: '収入', expense: '支出', transfer: '振替' };
const TAX_CATEGORY_GUIDE: Record<IncomeTaxCategory, string> = {
  salary: '勤務先から受け取る給与・賞与',
  business: '事業として営む活動から得た所得',
  miscellaneous: '公的年金など。他の所得区分に当てはまらないもの',
  dividend: '株式の配当や預貯金の利子をまとめて記録',
  temporary: '懸賞の賞金など、対価の性質を持たない一時的な所得',
  non_taxable: '非課税と確認した収入や贈与の記録用',
};

function toDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${['日', '月', '火', '水', '木', '金', '土'][d.getDay()]}）`;
}

export default function AddScreen() {
  const p = usePalette();
  const params = useLocalSearchParams<{ id?: string; accountId?: string; toAccountId?: string; billingMonth?: string; amount?: string }>();
  const { id } = params;
  const closing = useRef(false);
  const { state, visibleState, ledgers, activeLedger, addTransaction, updateTransaction, deleteTransaction, reorderAccounts, showSavedTransaction } = useFinance();
  const accountsById = useMemo(() => new Map(state.accounts.map((a) => [a.id, a])), [state.accounts]);
  const editing = useMemo(() => (id ? state.transactions.find((t) => t.id === id) : undefined), [id, state.transactions]);
  const paymentCard = state.accounts.find((a) => a.id === params.toAccountId && a.type === 'credit');
  const paymentMonth = paymentCard && params.billingMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.billingMonth)
    ? params.billingMonth : undefined;
  const transferAccounts = state.accounts.filter((a) => a.type !== 'debit');
  const defaultAccount = state.accounts.find((a) => a.id === params.accountId) ??
    (paymentMonth ? transferAccounts.find((a) => a.type === 'bank') : visibleState.accounts[0] ?? state.accounts[0]);

  const [type, setType] = useState<TransactionType>(editing?.type ?? (paymentMonth ? 'transfer' : 'expense'));
  const [amount, setAmount] = useState(editing ? String(editing.amount) : paymentMonth ? params.amount ?? '' : '');
  const [date, setDate] = useState(editing?.date ?? getTodayString());
  const [dateOpen, setDateOpen] = useState(false);
  const [deleteAnchor, setDeleteAnchor] = useState<PopoverAnchor>();
  const [categoryId, setCategoryId] = useState(() => editing?.categoryId ??
    getOrderedCategories('expense', state.customCategories, state.categoryOrder?.expense, state.hiddenCategoryIds)[0]?.id ?? '');
  const [accountId, setAccountId] = useState(editing?.accountId ?? defaultAccount?.id ?? '');
  const [toAccountId, setToAccountId] = useState(editing?.toAccountId ?? paymentCard?.id ??
    transferAccounts.find((a) => a.id !== defaultAccount?.id)?.id ?? '');
  const [title, setTitle] = useState(editing?.title ?? (paymentMonth && paymentCard
    ? `${paymentCard.name} ${formatMonthLabel(paymentMonth)}の支払い` : ''));
  const [memo, setMemo] = useState(editing?.memo ?? '');
  const [scope, setScope] = useState<TransactionScope>(editing?.scope ??
    (!paymentMonth && (activeLedger?.kind === 'business' || defaultAccount?.usageScope === 'business') ? 'business' : 'personal'));
  const [ledgerId, setLedgerId] = useState(() => editing
    ? getTransactionLedger(editing, accountsById, ledgers).id
    : paymentMonth ? undefined : activeLedger?.id);
  const [ratio, setRatio] = useState(String(editing?.businessRatio ?? 100));
  const [subject, setSubject] = useState(editing?.accountingSubject ?? '');
  const [counterparty, setCounterparty] = useState(editing?.counterparty ?? '');
  const [taxCat, setTaxCat] = useState<IncomeTaxCategory | undefined>(editing?.incomeTaxCategory);
  const taxSelection = taxCat ?? (scope === 'business' ? 'business' : undefined);
  const [withholding, setWithholding] = useState(editing?.withholdingTax ? String(editing.withholdingTax) : '');
  const [advanceOn, setAdvanceOn] = useState(Boolean(editing?.advance));
  const [advanceFor, setAdvanceFor] = useState(editing?.advance?.for ?? '');
  const isBusiness = scope === 'business' && !advanceOn;
  const ledger = getTransactionLedger({ accountId, ledgerId, scope }, accountsById, ledgers);

  const customCategories = state.customCategories;
  const account = state.accounts.find((a) => a.id === accountId);
  const destination = state.accounts.find((a) => a.id === toAccountId);
  const linkedBank = account?.type === 'debit'
    ? state.accounts.find((a) => a.id === account.linkedBankAccountId && a.type === 'bank') : undefined;
  const targetBillingMonth = type === 'transfer' && destination?.type === 'credit'
    ? (destination.id === editing?.toAccountId ? editing?.targetBillingMonth
      : destination.id === paymentCard?.id ? paymentMonth : undefined)
    : undefined;
  const category = getCategoryById(type === 'transfer' ? 'transfer' : categoryId, customCategories);
  const shiftDate = (days: number) => {
    const next = new Date(`${date}T00:00:00`);
    next.setDate(next.getDate() + days);
    tick();
    setDate(toDateString(next));
  };

  const changeType = (t: TransactionType) => {
    setType(t);
    if (t !== 'transfer') {
      const options = getOrderedCategories(t, customCategories, state.categoryOrder?.[t], state.hiddenCategoryIds);
      if (!options.some((item) => item.id === categoryId)) {
        setCategoryId(options[0]?.id ?? '');
      }
    }
    if (t === 'transfer') {
      const from = transferAccounts.find((a) => a.id === accountId) ?? linkedBank ?? transferAccounts[0];
      const to = transferAccounts.find((a) => a.id === toAccountId && a.id !== from?.id) ??
        transferAccounts.find((a) => a.id !== from?.id);
      setAccountId(from?.id ?? '');
      setToAccountId(to?.id ?? '');
    }
  };

  const pickAccount = async (setter: (v: string) => void, label: string, excludeId?: string) => {
    const choices = (type === 'transfer' ? transferAccounts : state.accounts).filter((a) => a.id !== excludeId);
    if (choices.length === 0) {
      Alert.alert('選べる口座がありません');
      return;
    }
    const currentId = label === '入金先' && type === 'transfer' ? toAccountId : accountId;
    const choice = await pickOne(label, choices.map((a) => ({
      id: a.id,
      label: a.name,
      subtitle: a.institution && !a.name.includes(a.institution) ? a.institution : undefined,
      searchText: ACCOUNT_TYPE_LABELS[a.type],
      icon: ACCOUNT_ICONS[a.type],
      color: a.type === 'bank' || a.type === 'foreign_bank' ? p.income
        : a.type === 'credit' ? '#8167BF' : p.tint,
      selected: a.id === currentId,
    })), {
      layout: 'divided',
      searchLabel: '口座名・金融機関を検索',
      onReorder: (ids) => {
        const included = new Set(ids);
        let next = 0;
        reorderAccounts(state.accounts.map((account) => included.has(account.id) ? ids[next++] : account.id));
      },
    });
    if (choice) setter(choice);
  };

  const closeEditor = () => router.canGoBack() ? router.back() : router.replace('/transactions');

  const save = (keepOpen: boolean) => {
    if (closing.current) return;
    if (id && !editing) {
      Alert.alert('取引が見つかりません');
      return;
    }
    if (type !== 'transfer' && !categoryId) {
      Alert.alert('カテゴリを選んでください');
      return;
    }
    const value = Number(amount);
    if (!Number.isSafeInteger(value) || value <= 0) {
      Alert.alert('金額を入力してください');
      return;
    }
    if (!account || (type === 'transfer' && (!destination || destination.id === account.id ||
      account.type === 'debit' || destination.type === 'debit'))) {
      Alert.alert('口座を確認してください');
      return;
    }
    if (account.type === 'debit' && !linkedBank) {
      Alert.alert('デビットカードの引落口座を設定してください');
      return;
    }
    if (!keepOpen || editing) closing.current = true;
    const payload: Omit<Transaction, 'id'> = {
      type,
      amount: value,
      date,
      categoryId: type === 'transfer' ? 'transfer' : categoryId,
      accountId,
      ledgerId: ledger.id,
      toAccountId: type === 'transfer' ? toAccountId : undefined,
      targetBillingMonth,
      isPrepayment: targetBillingMonth && paymentMonth
        ? targetBillingMonth > date.slice(0, 7)
        : type === 'transfer' && destination?.type === 'credit' && destination.id === editing?.toAccountId
          ? editing?.isPrepayment : undefined,
      title: title.trim() || (type === 'transfer' ? '口座振替' : category.name),
      memo: memo.trim() || undefined,
      scope: advanceOn ? 'personal' : scope,
      businessRatio: isBusiness && type === 'expense'
        ? Math.min(100, Math.max(0, Math.round(Number(ratio) || 0))) : undefined,
      accountingSubject: isBusiness && type === 'expense'
        ? subject || category.defaultAccountingSubject : undefined,
      counterparty: counterparty.trim() || undefined,
      incomeTaxCategory: type === 'income' ? taxSelection : undefined,
      withholdingTax: type === 'income' ? Math.round(Number(withholding)) || undefined : undefined,
      advance:
        type === 'expense' && advanceOn
          ? { ...(editing?.advance ?? {}), for: advanceFor.trim() || '未設定' }
          : undefined,
    };
    if (editing) updateTransaction(editing.id, payload);
    else addTransaction(payload);
    showSavedTransaction(date, type, ledger.id);
    success();
    if (keepOpen && !editing) {
      setAmount('');
      setTitle('');
      setMemo('');
      return;
    }
    closeEditor();
  };

  const fieldRow = (
    label: string,
    value: string,
    onPress: () => void,
    badge?: { name: SymbolViewProps['name']; color: string },
    detail?: string
  ) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        Keyboard.dismiss();
        tick();
        onPress();
      }}
      android_ripple={{ color: p.fill }}
      style={{ minHeight: metrics.rowMinHeight, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text style={{ color: p.textSecondary, fontSize: 14, flexBasis: '31%' }}>{label}</Text>
      {badge ? <IconBadge name={badge.name} color={badge.color} size={36} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: p.text, fontSize: 16, fontWeight: '600' }}>{value}</Text>
        {detail ? <Text style={{ color: p.textSecondary, fontSize: 12 }}>{detail}</Text> : null}
      </View>
      <SymbolView name={{ ios: 'chevron.up.chevron.down', android: 'unfold_more' }} size={13} tintColor={p.textSecondary} />
    </Pressable>
  );

  const accountRow = (label: string, selected: Account | undefined, setter: (value: string) => void, excludeId?: string) =>
    fieldRow(label, selected?.name ?? '選択', () => pickAccount(setter, label, excludeId),
      selected ? { name: ACCOUNT_ICONS[selected.type], color: p.tint } : undefined,
      selected ? ACCOUNT_TYPE_LABELS[selected.type] : undefined);

  const dateStep = (days: number, label: string, name: SymbolViewProps['name']) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => shiftDate(days)}
      style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
      <SymbolView name={name} size={17} tintColor={p.tint} />
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Stack.Screen
        options={{
          title: editing ? `${TYPE_LABELS[type]}を編集` : `${TYPE_LABELS[type]}を記録`,
          headerRight: editing ? () => (
            <View style={{ flexDirection: 'row' }}>
              <HeaderAction name={{ ios: 'trash', android: 'delete' }} label="取引を削除"
                onPress={({ nativeEvent }) => {
                  Keyboard.dismiss();
                  setDeleteAnchor({ x: nativeEvent.pageX, y: nativeEvent.pageY });
                }} />
              <HeaderAction name={{ ios: 'checkmark', android: 'check' }} label="取引を保存" accent onPress={() => save(false)} />
            </View>
          ) : undefined,
        }}
      />

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ flexGrow: 1, padding: 16, gap: 16, paddingBottom: 28 }}>
        {!paymentMonth ? <Segmented<TransactionType>
          value={type}
          onChange={changeType}
          options={[
            { id: 'income', label: '収入' },
            { id: 'expense', label: '支出' },
            { id: 'transfer', label: '振替' },
          ]}
        /> : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: p.card, borderRadius: metrics.cardRadius }}>
          {dateStep(-1, '前の日', { ios: 'chevron.left', android: 'chevron_left' })}
          <Pressable accessibilityRole="button" accessibilityLabel={`取引日 ${dateLabel(date)}`}
            style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            onPress={() => { Keyboard.dismiss(); tick(); setDateOpen(true); }}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: p.tint, fontSize: 16, fontWeight: '600' }}>{dateLabel(date)}</Text>
            <SymbolView name={{ ios: 'chevron.down', android: 'expand_more' }} size={12} tintColor={p.tint} />
          </Pressable>
          {dateStep(1, '次の日', { ios: 'chevron.right', android: 'chevron_right' })}
        </View>
        <Group>
          {type !== 'transfer' ? fieldRow('カテゴリ', categoryId ? category.name : '選択',
            () => pickCategory(type, categoryId, state, setCategoryId),
            { name: categoryIcon(category.icon ?? category.id), color: category.color }) : null}
          {accountRow(type === 'transfer' ? '出金元' : type === 'income' ? '入金先' : '支払い方法',
            account, setAccountId, type === 'transfer' ? toAccountId : undefined)}
          {type === 'transfer' ? accountRow('入金先', destination, setToAccountId, accountId) : null}
          {fieldRow('家計グループ', ledger.name, async () => {
            const choice = await pickOne('家計グループ', ledgerOptions(ledgers, ledger.id));
            const group = ledgers.find((item) => item.id === choice);
            if (group) {
              setLedgerId(group.id);
              setScope(group.kind === 'business' ? 'business' : 'personal');
            }
          }, { name: ledgerIcon(ledger), color: ledgerColor(ledger) ?? p.tint })}
          {type === 'expense' && (account?.type === 'credit' || account?.type === 'debit') ? (
            <Text style={{ color: p.textSecondary, fontSize: 13, paddingHorizontal: 16, paddingVertical: 10 }}>
              {account.type === 'credit'
                ? `${formatMonthLabel(getBillingMonthForDate(date, account.closingDay, account.paymentMonthOffset))}の請求分`
                : linkedBank ? `${linkedBank.name}から即時引き落とし` : '引落口座を設定してください'}
            </Text>
          ) : null}
          {targetBillingMonth ? (
            <Text style={{ color: p.textSecondary, fontSize: 13, paddingHorizontal: 16, paddingVertical: 10 }}>
              {formatMonthLabel(targetBillingMonth)}の請求への支払い
            </Text>
          ) : null}
        </Group>

        <Group>
          <TransactionInput label="金額" icon={{ ios: 'yensign', android: 'currency_yen' }}
            accessibilityHint="円単位で入力" value={amount}
            onChangeText={(value) => setAmount(value.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad" inputAccessoryViewID={KEYBOARD_ACCESSORY_ID}
            style={{ minHeight: 34, color: type === 'income' ? p.income : p.text,
              fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'] }} />
          <TransactionInput label="取引内容" icon={{ ios: 'text.alignleft', android: 'subject' }} optional
            value={title} onChangeText={setTitle} placeholder="取引の名前" />
          <TransactionInput label="メモ" icon={{ ios: 'note.text', android: 'notes' }} optional
            value={memo} onChangeText={setMemo} placeholder="補足があれば入力" />
        </Group>

        {type !== 'transfer' ? (
          <Group>
            <View style={{ padding: 8 }}>
              <Segmented<TransactionScope>
                value={scope}
                onChange={setScope}
                options={[
                  { id: 'personal', label: '個人' },
                  { id: 'business', label: '事業' },
                ]}
              />
            </View>
            {isBusiness && type === 'expense' ? (
              <>
                {fieldRow('勘定科目', subject || category.defaultAccountingSubject || '選択', async () => {
                  const choice = await pickOne('勘定科目', ACCOUNTING_SUBJECTS.map((x) => ({ id: x, label: x })));
                  if (choice) setSubject(choice);
                })}
                <TransactionInput label="事業で使った割合" icon={{ ios: 'percent', android: 'percent' }} unit="%"
                  value={ratio} onChangeText={(value) => setRatio(value.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad" inputAccessoryViewID={KEYBOARD_ACCESSORY_ID} />
              </>
            ) : null}
            {type === 'income' ? (
              <>
                <Pressable accessibilityRole="button"
                  accessibilityLabel={`所得区分 ${taxSelection ? INCOME_TAX_CATEGORY_LABELS[taxSelection] : '未設定'}`}
                  onPress={async () => {
                    const entries = Object.entries(INCOME_TAX_CATEGORY_LABELS) as [IncomeTaxCategory, string][];
                    tick();
                    const choice = await pickOne('所得区分', entries.map(([id, label]) => ({
                      id, label, subtitle: TAX_CATEGORY_GUIDE[id], selected: id === taxSelection,
                    })), { description: '税務集計に使う区分です。副業の所得区分などは、収入の実態に応じて確認してください。' });
                    if (choice) setTaxCat(choice as IncomeTaxCategory);
                  }}
                  style={({ pressed }) => ({
                    marginHorizontal: 12, marginVertical: 8, padding: 10, gap: 4, borderWidth: 1,
                    borderColor: p.tint, borderRadius: metrics.controlRadius, backgroundColor: pressed ? p.fill : p.card,
                  })}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: p.textSecondary, fontSize: 14, flexBasis: '30%' }}>所得区分</Text>
                    <Text style={{ flex: 1, color: p.text, fontSize: 16, fontWeight: '600' }}>
                      {taxSelection ? INCOME_TAX_CATEGORY_LABELS[taxSelection] : '選択する'}
                    </Text>
                    <SymbolView name={{ ios: 'chevron.down', android: 'expand_more' }} size={14} tintColor={p.tint} />
                  </View>
                  <Text style={{ color: p.textSecondary, fontSize: 12, lineHeight: 17 }}>
                    {taxSelection ? TAX_CATEGORY_GUIDE[taxSelection] : '税務集計に使う区分を選べます'}
                  </Text>
                </Pressable>
                <TransactionInput label="源泉徴収税額" icon={{ ios: 'doc.plaintext', android: 'description' }} optional unit="円"
                  value={withholding} onChangeText={(value) => setWithholding(value.replace(/[^0-9]/g, ''))}
                  placeholder="明細に記載の税額" keyboardType="number-pad" inputAccessoryViewID={KEYBOARD_ACCESSORY_ID} />
              </>
            ) : null}
            {scope === 'business' ? (
              <TransactionInput label="取引先" icon={{ ios: 'person.crop.rectangle', android: 'badge' }} optional
                value={counterparty} onChangeText={setCounterparty} placeholder="会社名など" />
            ) : null}
          </Group>
        ) : null}

        {type === 'expense' ? (
          <Group>
            <Pressable accessibilityRole="switch" accessibilityLabel="立て替え（あとで回収）"
              accessibilityState={{ checked: advanceOn }} onPress={() => { tick(); setAdvanceOn((value) => !value); }}
              style={{ minHeight: metrics.rowMinHeight, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ flex: 1, color: p.text, fontSize: 16 }}>立て替え（あとで回収）</Text>
              <View style={{ width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center',
                alignItems: advanceOn ? 'flex-end' : 'flex-start', backgroundColor: advanceOn ? p.tint : p.fill }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: advanceOn ? p.onTint : p.card,
                  borderWidth: advanceOn ? 0 : 1, borderColor: p.separator }} />
              </View>
            </Pressable>
            {advanceOn ? (
              <TransactionInput label="立て替えた相手" icon={{ ios: 'person', android: 'person' }} optional
                value={advanceFor} onChangeText={setAdvanceFor} placeholder="例：田中さん" />
            ) : null}
          </Group>
        ) : null}

        {!editing ? <View style={{ flexDirection: 'row', gap: 12, marginTop: 'auto', paddingTop: 4 }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => save(false)}
            style={({ pressed }) => ({
              flex: 1, minHeight: 52, borderRadius: 16, backgroundColor: p.tint,
              alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1,
            })}>
            <Text style={{ color: p.onTint, fontSize: 16, fontWeight: '700' }}>
              登録
            </Text>
          </Pressable>
          {!paymentMonth ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => save(true)}
              style={({ pressed }) => ({
                flex: 1, minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: p.tint, backgroundColor: p.card,
                alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1,
              })}>
              <Text style={{ color: p.tint, fontSize: 16, fontWeight: '700' }}>続けて登録</Text>
            </Pressable>
          ) : null}
        </View> : null}
      </ScrollView>

      {dateOpen ? <TransactionDatePicker date={date} onCancel={() => setDateOpen(false)} onPick={(value) => {
        setDate(value);
        setDateOpen(false);
      }} /> : null}
      <AnchoredDeleteDialog heading="取引を削除しますか？" title={editing?.title} anchor={deleteAnchor}
        onCancel={() => setDeleteAnchor(undefined)} onDelete={() => {
          if (!editing || closing.current) return;
          closing.current = true;
          setDeleteAnchor(undefined);
          deleteTransaction(editing.id);
          success();
          closeEditor();
        }} />
    </View>
  );
}
