import { router } from 'expo-router';
import { getOrderedCategories } from '@dmm/core/data/categories';
import { categoryIcon } from './categoryIcons';
import { pickOne, type PickOption } from './pick';
import { useFinance } from './store';

export function useCategoryPicker() {
  const { state, setCategoryOrder } = useFinance();

  return async (type: 'income' | 'expense', selected: string, onChange: (id: string) => void) => {
    const categories = getOrderedCategories(type, state.customCategories, state.categoryOrder?.[type]);
    const hidden = new Set(state.hiddenCategoryIds);
    const options: PickOption[] = categories.filter((category) => !hidden.has(category.id)).map((category) => ({
      id: category.id, label: category.name, icon: categoryIcon(category.icon ?? category.id),
      color: category.color, selected: category.id === selected,
    }));
    options.push(
      { id: 'add', label: 'カテゴリを追加', icon: { ios: 'plus.circle.fill', android: 'add_circle' }, reorderable: false },
      { id: 'manage', label: 'カテゴリを管理', icon: { ios: 'list.bullet', android: 'list' }, reorderable: false },
    );
    const choice = await pickOne('カテゴリ', options, {
      layout: 'divided',
      searchLabel: 'カテゴリ名を検索',
      reorderTitle: 'カテゴリの並び替え',
      onReorder: (ids) => {
        let index = 0;
        setCategoryOrder(type, categories.map(({ id }) => hidden.has(id) ? id : ids[index++]));
      },
    });
    if (choice === 'add') router.push({ pathname: '/category-editor', params: { type } });
    else if (choice === 'manage') router.push({ pathname: '/categories', params: { type } });
    else if (choice) onChange(choice);
  };
}
