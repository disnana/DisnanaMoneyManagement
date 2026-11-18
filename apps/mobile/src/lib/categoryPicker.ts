import { router } from 'expo-router';
import { getOrderedCategories } from '@dmm/core/data/categories';
import type { FinanceState } from '@dmm/core/types/finance';
import { categoryIcon } from './categoryIcons';
import { pickOne } from './pick';

export async function pickCategory(type: 'income' | 'expense', selected: string, state: FinanceState, onChange: (id: string) => void) {
  const options = getOrderedCategories(type, state.customCategories, state.categoryOrder?.[type], state.hiddenCategoryIds).map((category) => ({
    id: category.id, label: category.name, icon: categoryIcon(category.icon ?? category.id),
    color: category.color, selected: category.id === selected,
  }));
  options.push(
    { id: 'add', label: 'カテゴリを追加', icon: { ios: 'plus.circle.fill', android: 'add_circle' }, color: '', selected: false },
    { id: 'manage', label: 'カテゴリを管理', icon: { ios: 'list.bullet', android: 'list' }, color: '', selected: false },
  );
  const choice = await pickOne('カテゴリ', options);
  if (choice === 'add') router.push({ pathname: '/category-editor', params: { type } });
  else if (choice === 'manage') router.push({ pathname: '/categories', params: { type } });
  else if (choice) onChange(choice);
}
