import { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { getOrderedCategories } from '@dmm/core/data/categories';
import { categoryIcon } from '@/lib/categoryIcons';
import { useFinance } from '@/lib/store';
import { closeEditor, useFinanceSubmit } from '@/lib/useFinanceSubmit';
import { usePalette } from '@/lib/theme';
import { HeaderAction } from '@/ui/HeaderAction';
import { DeleteDialog } from '@/ui/DeleteDialog';
import { Group, IconBadge, Row, Screen } from '@/ui/kit';

export default function CategoryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, setCategoryHidden } = useFinance();
  const submit = useFinanceSubmit();
  const p = usePalette();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const category = getOrderedCategories('expense', state.customCategories).concat(getOrderedCategories('income', state.customCategories))
    .find((item) => item.id === id);
  const hidden = state.hiddenCategoryIds?.includes(id);

  return (
    <>
      <Stack.Screen options={{ title: 'カテゴリ', headerRight: category ? () => (
        <View style={{ flexDirection: 'row' }}>
          {!hidden ? <HeaderAction name={{ ios: 'trash', android: 'delete' }} label="削除"
            onPress={() => setDeleteOpen(true)} /> : null}
          <HeaderAction name={{ ios: 'pencil', android: 'edit' }} label="編集"
            onPress={() => router.push({ pathname: '/category-editor', params: { id } })} />
        </View>
      ) : undefined }} />
      <Screen>
        {category ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconBadge name={categoryIcon(category.icon ?? category.id)} color={category.color} size={48} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: p.text, fontSize: 22, fontWeight: '800' }}>{category.name}</Text>
                <Text style={{ color: p.textSecondary }}>{category.type === 'income' ? '収入' : '支出'}</Text>
              </View>
            </View>
            {category.memo ? <Text style={{ color: p.text }}>{category.memo}</Text> : null}
            <Group>
              <Row title="記帳済みの取引" right={`${state.transactions.filter((item) => item.categoryId === id).length}件`} />
              {category.type === 'expense' ? (
                <Row title="購入候補" right={`${(state.purchaseCandidates ?? []).filter((item) => item.categoryId === id).length}件`} />
              ) : null}
              {hidden ? <Row title="入力候補に復元" onPress={() => setCategoryHidden(id, false)} /> : null}
            </Group>
          </>
        ) : <Text style={{ color: p.textSecondary }}>カテゴリが見つかりません</Text>}
      </Screen>
      <DeleteDialog heading="カテゴリを削除しますか？" title={category?.name} visible={deleteOpen}
        description="過去の取引にはカテゴリ名が残ります。"
        onCancel={() => setDeleteOpen(false)} onDelete={async () => {
          if (!await submit(() => setCategoryHidden(id, true))) return;
          setDeleteOpen(false);
          closeEditor('/categories');
        }} />
    </>
  );
}
