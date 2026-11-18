import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { Transaction, TransactionType } from '@dmm/core/types/finance';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getCategoryById } from '@dmm/core/data/categories';
import { getTodayString } from '@dmm/core/utils/format';
import { useFinance } from '@/lib/store';
import { usePalette, metrics } from '@/lib/theme';
import { pickOne } from '@/lib/pick';
import { success, tick } from '@/lib/haptics';
import { KEYBOARD_ACCESSORY_ID } from '@/ui/KeyboardDone';
import { Group, Segmented } from '@/ui/kit';

function shiftDay(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + delta);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${['日', '月', '火', '水', '木', '金', '土'][d.getDay()]}）`;
}

export default function AddScreen() {
  const p = usePalette();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, addTransaction, updateTransaction } = useFinance();
  const editing = useMemo(() => (id ? state.transactions.find((t) => t.id === id) : undefined), [id, state.transactions]);

  const [type, setType] = useState<TransactionType>(editing?.type ?? 'expense');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [date, setDate] = useState(editing?.date ?? getTodayString());
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? EXPENSE_CATEGORIES[0].id);
  const [accountId, setAccountId] = useState(editing?.accountId ?? state.accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(editing?.toAccountId ?? state.accounts[1]?.id ?? state.accounts[0]?.id ?? '');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [memo, setMemo] = useState(editing?.memo ?? '');

  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const accountName = (aid: string) => state.accounts.find((a) => a.id === aid)?.name ?? '選択';
  const category = getCategoryById(type === 'transfer' ? 'transfer' : categoryId);

  const changeType = (t: TransactionType) => {
    setType(t);
    if (t === 'expense') setCategoryId(EXPENSE_CATEGORIES.some((c) => c.id === categoryId) ? categoryId : EXPENSE_CATEGORIES[0].id);
    if (t === 'income') setCategoryId(INCOME_CATEGORIES.some((c) => c.id === categoryId) ? categoryId : INCOME_CATEGORIES[0].id);
  };

  const pickCategory = async () => {
    const choice = await pickOne('カテゴリ', categories.map((c) => ({ id: c.id, label: c.name })));
    if (choice) setCategoryId(choice);
  };
  const pickAccount = async (setter: (v: string) => void, label: string) => {
    const choice = await pickOne(label, state.accounts.map((a) => ({ id: a.id, label: a.name })));
    if (choice) setter(choice);
  };

  const save = (keepOpen: boolean) => {
    const value = Math.round(Number(amount.replace(/,/g, '')));
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert('金額を入力してください');
      return;
    }
    const cat = getCategoryById(type === 'transfer' ? 'transfer' : categoryId);
    const payload: Omit<Transaction, 'id'> = {
      type,
      amount: value,
      date,
      categoryId: type === 'transfer' ? 'transfer' : categoryId,
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : undefined,
      title: title.trim() || (type === 'transfer' ? '口座振替' : cat.name),
      memo: memo.trim() || undefined,
      scope: editing?.scope ?? 'personal',
    };
    if (editing) updateTransaction(editing.id, payload);
    else addTransaction(payload);
    success();
    if (keepOpen && !editing) {
      setAmount('');
      setTitle('');
      setMemo('');
      return;
    }
    router.back();
  };

  const fieldRow = (label: string, value: string, onPress: () => void) => (
    <Pressable
      onPress={() => {
        tick();
        onPress();
      }}
      android_ripple={{ color: p.fill }}
      style={{ minHeight: metrics.rowMinHeight - 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ color: p.text, fontSize: 16 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
        <Text numberOfLines={1} style={{ color: p.textSecondary, fontSize: 16, flexShrink: 1 }}>
          {value}
        </Text>
        <SymbolView name={{ ios: 'chevron.up.chevron.down', android: 'unfold_more' }} size={13} tintColor={p.textSecondary} />
      </View>
    </Pressable>
  );

  const input = (value: string, onChangeText: (t: string) => void, placeholder: string) => (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={p.textSecondary}
      style={{ minHeight: metrics.rowMinHeight - 8, paddingHorizontal: 16, color: p.text, fontSize: 16 }}
    />
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: p.bg }}>
      {Platform.OS === 'ios' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 10, height: 56 }}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <SymbolView name={{ ios: 'xmark', android: 'close' }} size={17} tintColor={p.textSecondary} />
          </Pressable>
          <Text style={{ color: p.text, fontSize: 17, fontWeight: '600' }}>{editing ? '取引を編集' : '収支を記録'}</Text>
          <View style={{ width: 44 }} />
        </View>
      ) : null}

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}>
        <Segmented<TransactionType>
          value={type}
          onChange={changeType}
          options={[
            { id: 'expense', label: '支出' },
            { id: 'income', label: '収入' },
            { id: 'transfer', label: '振替' },
          ]}
        />

        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
            <Text style={{ color: p.textSecondary, fontSize: 28, fontWeight: '700' }}>¥</Text>
            <TextInput
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))}
              placeholder="0"
              placeholderTextColor={p.textSecondary}
              keyboardType="number-pad"
              inputAccessoryViewID={KEYBOARD_ACCESSORY_ID}
              autoFocus={!editing}
              style={{ borderWidth: 0, color: type === 'income' ? p.income : p.text, fontSize: 44, fontWeight: '800', minWidth: 120, textAlign: 'center', fontVariant: ['tabular-nums'] }}
            />
          </View>
        </View>

        <Group>
          <View style={{ minHeight: metrics.rowMinHeight - 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
            <Pressable hitSlop={8} onPress={() => { tick(); setDate((d) => shiftDay(d, -1)); }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <SymbolView name={{ ios: 'chevron.left', android: 'chevron_left' }} size={16} tintColor={p.tint} />
            </Pressable>
            <Text style={{ color: p.text, fontSize: 16, fontWeight: '600' }}>{dateLabel(date)}</Text>
            <Pressable hitSlop={8} onPress={() => { tick(); setDate((d) => shiftDay(d, 1)); }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} size={16} tintColor={p.tint} />
            </Pressable>
          </View>
          {type !== 'transfer' ? fieldRow('カテゴリ', category.name, pickCategory) : null}
          {fieldRow(type === 'transfer' ? '出金元' : type === 'income' ? '入金先' : '支払い方法', accountName(accountId), () => pickAccount(setAccountId, type === 'transfer' ? '出金元' : '口座'))}
          {type === 'transfer' ? fieldRow('入金先', accountName(toAccountId), () => pickAccount(setToAccountId, '入金先')) : null}
        </Group>

        <Group>
          {input(title, setTitle, '内容（任意）')}
          {input(memo, setMemo, 'メモ（任意）')}
        </Group>
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingBottom: 20, gap: 4 }}>
        <Pressable
          onPress={() => save(false)}
          android_ripple={{ color: 'rgba(255,255,255,0.25)' }}
          style={({ pressed }) => ({
            minHeight: 52,
            borderRadius: Platform.OS === 'ios' ? 14 : 26,
            backgroundColor: p.tint,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
          })}>
          <Text style={{ color: p.onTint, fontSize: 17, fontWeight: '700' }}>{editing ? '変更を保存' : '登録'}</Text>
        </Pressable>
        {!editing ? (
          <Pressable onPress={() => save(true)} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: p.tint, fontSize: 15, fontWeight: '600' }}>続けて登録</Text>
          </Pressable>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}
