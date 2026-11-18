import type { SymbolViewProps } from 'expo-symbols';

type IconName = Extract<SymbolViewProps['name'], object>;

/** SF Symbols on iOS, Material Symbols on Android — one table, platform-specific names. */
const ICONS: Record<string, IconName> = {
  food: { ios: 'fork.knife', android: 'restaurant' },
  dining: { ios: 'cup.and.saucer.fill', android: 'local_cafe' },
  daily: { ios: 'basket.fill', android: 'shopping_basket' },
  housing: { ios: 'house.fill', android: 'home' },
  utilities: { ios: 'bolt.fill', android: 'bolt' },
  transport: { ios: 'tram.fill', android: 'train' },
  hobby: { ios: 'gamecontroller.fill', android: 'sports_esports' },
  clothing: { ios: 'tshirt.fill', android: 'checkroom' },
  medical: { ios: 'heart.fill', android: 'favorite' },
  education: { ios: 'book.fill', android: 'menu_book' },
  business_ops: { ios: 'briefcase.fill', android: 'work' },
  other_expense: { ios: 'ellipsis.circle.fill', android: 'more_horiz' },
  salary: { ios: 'yensign.circle.fill', android: 'payments' },
  side_income: { ios: 'laptopcomputer', android: 'laptop' },
  misc_income: { ios: 'gift.fill', android: 'redeem' },
  investment_income: { ios: 'chart.line.uptrend.xyaxis', android: 'trending_up' },
  other_income: { ios: 'arrow.down.circle.fill', android: 'south_west' },
  transfer: { ios: 'arrow.left.arrow.right', android: 'swap_horiz' },
};

const FALLBACK: IconName = { ios: 'circle.fill', android: 'circle' };

export function categoryIcon(categoryId: string): IconName {
  return ICONS[categoryId] ?? FALLBACK;
}
