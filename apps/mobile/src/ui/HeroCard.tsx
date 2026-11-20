import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { computeMonthMetrics } from '@dmm/core/utils/metrics';
import { formatJPY } from '@dmm/core/utils/format';
import { tick } from '@/lib/haptics';
import { useHomeAssetVisibility } from '@/lib/homeAssetVisibility';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { LedgerPill } from '@/ui/LedgerPill';
import { MonthBar } from '@/ui/kit';
import { CardHeader, CardSurface } from './CardSurface';

export function HeroCard({ assets }: { assets: number }) {
  const p = usePalette();
  const [hidden, toggle] = useHomeAssetVisibility();

  return (
    <CardSurface>
      <View style={{ backgroundColor: `${p.tint}0A`, paddingHorizontal: 18, paddingVertical: 14, gap: 8 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
            <Text accessibilityRole="header" style={{ color: p.text, flexShrink: 1, fontSize: 15, fontWeight: '700' }}>現在の総資産</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={hidden ? '総資産を表示' : '総資産を隠す'}
              onPress={() => { tick(); toggle(); }}
              style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.65 : 1 })}>
              <SymbolView name={hidden ? { ios: 'eye.slash', android: 'visibility_off' } : { ios: 'eye', android: 'visibility' }}
                size={17} tintColor={p.textSecondary} />
            </Pressable>
          </View>
          <LedgerPill />
        </View>
        <Text accessibilityLabel={hidden ? '総資産は非表示' : undefined} numberOfLines={1} adjustsFontSizeToFit
          style={{ color: hidden ? p.text : assets < 0 ? p.danger : p.income,
            fontSize: 37, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
          {hidden ? '¥・・・・・・' : formatJPY(assets)}
        </Text>
      </View>
    </CardSurface>
  );
}

export function MonthlyCashFlow({ month, showNetSign = true }: { month: string; showNetSign?: boolean }) {
  const p = usePalette();
  const { visibleState, setMonth } = useFinance();
  const { income, expense, net } = useMemo(() => computeMonthMetrics(visibleState, month), [visibleState, month]);
  const stats = [
    { label: '収入', amount: income, color: income < 0 ? p.danger : p.income },
    { label: '支出', amount: expense, color: expense > 0 ? p.danger : p.income },
    { label: '収支', amount: net, color: net < 0 ? p.danger : p.income },
  ];

  return (
    <CardSurface>
      <CardHeader>
        <MonthBar month={month} onChange={setMonth} />
      </CardHeader>
      <View style={{ flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 11 }}>
        {stats.map(({ label, amount, color }, index) => (
          <View key={label} style={{ flex: 1, alignItems: 'center', paddingHorizontal: 4, gap: 3,
            borderLeftColor: p.separator, borderLeftWidth: index > 0 ? StyleSheet.hairlineWidth : 0 }}>
            <Text style={{ color: p.textSecondary, fontSize: 12, fontWeight: '600' }}>{label}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit
              style={{ color, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {showNetSign && label === '収支' && amount > 0 ? '+' : ''}{formatJPY(amount)}
            </Text>
          </View>
        ))}
      </View>
    </CardSurface>
  );
}
