import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { computeMonthCashFlow } from '@dmm/core/utils/metrics';
import { formatJPY } from '@dmm/core/utils/format';
import { tick } from '@/lib/haptics';
import { useHomeAssetVisibility } from '@/lib/homeAssetVisibility';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { LedgerPill } from '@/ui/LedgerPill';
import { MonthBar } from '@/ui/kit';
import { CardHeader, CardSurface } from './CardSurface';

export function HeroCard({ assets, expressive = false }: { assets: number; expressive?: boolean }) {
  const p = usePalette();
  const [hidden, toggle] = useHomeAssetVisibility();

  const content = (
    <View style={{
      backgroundColor: expressive ? p.sectionHeader : `${p.tint}0A`,
      paddingHorizontal: expressive ? 22 : 18, paddingVertical: 14, gap: 8,
      ...(expressive ? { borderTopLeftRadius: 28, borderTopRightRadius: 28,
        borderBottomLeftRadius: 28, borderBottomRightRadius: 10 } : {}),
    }}>
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
          fontSize: expressive ? 46 : 37, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
        {hidden ? '¥・・・・・・' : formatJPY(assets)}
      </Text>
    </View>
  );
  return expressive ? content : <CardSurface>{content}</CardSurface>;
}

export function MonthlyCashFlow({ month, showNetSign = true, expressive = false }: {
  month: string; showNetSign?: boolean; expressive?: boolean;
}) {
  const p = usePalette();
  const { visibleState, setMonth } = useFinance();
  const { income, expense, net } = useMemo(() => computeMonthCashFlow(visibleState, month), [visibleState, month]);
  const stats = [
    { label: '収入', amount: income, color: income < 0 ? p.danger : p.income },
    { label: '支出', amount: expense, color: expense > 0 ? p.danger : p.income },
    { label: '収支', amount: net, color: net < 0 ? p.danger : p.income },
  ];

  if (expressive) {
    const largestFlow = Math.max(Math.abs(income), Math.abs(expense), 1);
    return (
      <View style={{ gap: 8 }}>
        <MonthBar month={month} onChange={setMonth} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 }}>
          <Text accessibilityRole="header" style={{ color: p.text, fontSize: 15, fontWeight: '700' }}>月の収支</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{
            flex: 1, textAlign: 'right', color: net < 0 ? p.danger : p.income,
            fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'],
          }}>{showNetSign && net > 0 ? '+' : ''}{formatJPY(net)}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {stats.slice(0, 2).map(({ label, amount, color }, index) => (
            <View key={label} style={{
              flex: 1, minWidth: 0, gap: 4, paddingHorizontal: 14, paddingVertical: 10,
              backgroundColor: p.fill, borderRadius: 18,
              borderTopRightRadius: index === 0 ? 6 : 18, borderTopLeftRadius: index === 1 ? 6 : 18,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <SymbolView name={index === 0 ? { ios: 'arrow.up.right', android: 'north_east' }
                  : { ios: 'arrow.down.right', android: 'south_east' }} size={14} tintColor={color} />
                <Text style={{ color: p.textSecondary, fontSize: 13, fontWeight: '600' }}>{label}</Text>
              </View>
              <Text numberOfLines={1} adjustsFontSizeToFit style={{
                color, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'],
              }}>{formatJPY(amount)}</Text>
              <View aria-hidden style={{ backgroundColor: p.bg, height: 4, borderRadius: 2, overflow: 'hidden' }}>
                <View style={{ backgroundColor: color, height: 4, borderRadius: 2, width: `${100 * Math.abs(amount) / largestFlow}%` }} />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

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
