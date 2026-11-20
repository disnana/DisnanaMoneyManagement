import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { getOrderedCategories } from '@dmm/core/data/categories';
import { categoryIcon } from '@/lib/categoryIcons';
import { useFinance } from '@/lib/store';
import { closeEditor, useFinanceSubmit } from '@/lib/useFinanceSubmit';
import { usePalette } from '@/lib/theme';
import { HeaderAction } from '@/ui/HeaderAction';
import { TransactionInput } from '@/ui/TransactionForm';
import { Group, IconBadge, Screen, SectionTitle, Segmented } from '@/ui/kit';

const ICONS = [
  { id: 'daily', label: '買い物' }, { id: 'food', label: '食事' }, { id: 'dining', label: 'カフェ' },
  { id: 'housing', label: '家' }, { id: 'transport', label: '交通' }, { id: 'hobby', label: '趣味' },
  { id: 'clothing', label: '衣服' }, { id: 'medical', label: '健康' }, { id: 'education', label: '学習' },
  { id: 'business_ops', label: '仕事' }, { id: 'salary', label: '収入' }, { id: 'misc_income', label: 'ギフト' },
];
const COLORS = [
  { value: '#0F766E', name: '青緑' }, { value: '#2563EB', name: '青' },
  { value: '#7C3AED', name: '紫' }, { value: '#BE185D', name: 'ピンク' },
  { value: '#B91C1C', name: '赤' }, { value: '#B45309', name: 'オレンジ' },
  { value: '#15803D', name: '緑' }, { value: '#475569', name: 'グレー' },
];

export default function CategoryEditor() {
  const params = useLocalSearchParams<{ type?: string; id?: string }>();
  const { state, saveCustomCategory } = useFinance();
  const p = usePalette();
  const editing = getOrderedCategories('expense', state.customCategories).concat(getOrderedCategories('income', state.customCategories))
    .find((item) => item.id === params.id);
  const [type, setType] = useState<'expense' | 'income'>(editing?.type === 'income' || (!editing && params.type === 'income') ? 'income' : 'expense');
  const [name, setName] = useState(editing?.name ?? '');
  const [memo, setMemo] = useState(editing?.memo ?? '');
  const [icon, setIcon] = useState(editing?.icon ?? editing?.id ?? 'daily');
  const [color, setColor] = useState(editing?.color ?? COLORS[0].value);
  const submit = useFinanceSubmit();
  const taken = getOrderedCategories(type, state.customCategories)
    .some((category) => category.id !== editing?.id && category.type === type && category.name === name.trim());
  const canSave = Boolean(name.trim()) && !taken;
  const save = async () => {
    if (!canSave) return;
    const saved = await submit(() => saveCustomCategory({ name: name.trim(), type, icon, color, memo: memo.trim() || undefined,
      defaultAccountingSubject: editing?.defaultAccountingSubject }, editing?.id));
    if (saved) closeEditor('/categories');
  };

  return (
    <>
      <Stack.Screen options={{
        title: editing ? 'カテゴリを編集' : 'カテゴリを追加',
        headerRight: () => <HeaderAction name={{ ios: 'checkmark', android: 'check' }}
          label="カテゴリを保存" accent disabled={!canSave} onPress={save} />,
      }} />
      <Screen automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">
        {!editing ? <Segmented value={type} onChange={setType} options={[{ id: 'expense', label: '支出' }, { id: 'income', label: '収入' }]} /> : null}
        <Group>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 }}>
            <IconBadge name={categoryIcon(icon)} color={color} />
            <TextInput accessibilityLabel="カテゴリ名" placeholder="カテゴリ名" placeholderTextColor={p.textSecondary}
              value={name} onChangeText={setName} maxLength={32} style={{ flex: 1, minHeight: 54, fontSize: 17, color: p.text }} />
          </View>
          <TransactionInput label="メモ" icon={{ ios: 'note.text', android: 'notes' }} optional
            placeholder="補足があれば入力" value={memo} onChangeText={setMemo} maxLength={100} />
        </Group>
        {taken ? <Text style={{ color: p.danger }}>同じ名前のカテゴリがあります。</Text> : null}
        <SectionTitle>アイコン</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {ICONS.map((option) => (
            <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={option.label}
              accessibilityState={{ selected: icon === option.id }} onPress={() => setIcon(option.id)}
              style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center',
                borderRadius: 12, backgroundColor: icon === option.id ? p.fill : p.card }}>
              <SymbolView name={categoryIcon(option.id)} tintColor={icon === option.id ? p.tint : p.text} size={22} />
            </Pressable>
          ))}
        </View>
        <SectionTitle>色</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {COLORS.map((option) => (
            <Pressable key={option.value} accessibilityRole="button" accessibilityLabel={option.name}
              accessibilityState={{ selected: color === option.value }} onPress={() => setColor(option.value)}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: option.value,
                alignItems: 'center', justifyContent: 'center' }}>
                {color === option.value ? <SymbolView name={{ ios: 'checkmark', android: 'check' }} size={16} tintColor="#fff" /> : null}
              </View>
            </Pressable>
          ))}
        </View>
      </Screen>
    </>
  );
}
