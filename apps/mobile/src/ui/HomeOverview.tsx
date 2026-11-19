import { StyleSheet, Text, View } from 'react-native';
import { formatJPY } from '@dmm/core/utils/format';
import { computeMonthMetrics } from '@dmm/core/utils/metrics';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { useAppearanceStyle } from '@/lib/themePref';
import { CardHeader, CardSurface } from './CardSurface';
import { HeroCard, MonthlyCashFlow } from './HeroCard';
import { MonthBar, SectionTitle } from './kit';
import { useHomeAssetVisibility } from '@/lib/homePreferences';
import { HomeAssetsHeading, hiddenAssetsLabel } from './HomeAssets';

export function HomeOverview({ month, assets }: { month: string; assets: number }) {
  const [appearance] = useAppearanceStyle();

  if (appearance === 'classic' || appearance === 'soft') {
    return <StyledOverview appearance={appearance} month={month} assets={assets} />;
  }

  return (
    <>
      <HeroCard assets={assets} />
      <SectionTitle>月の収支</SectionTitle>
      <MonthlyCashFlow month={month} />
    </>
  );
}

function StyledOverview({ appearance, month, assets }: {
  appearance: 'classic' | 'soft';
  month: string;
  assets: number;
}) {
  const p = usePalette();
  const [hidden] = useHomeAssetVisibility();
  const { visibleState, setMonth } = useFinance();
  const { income, expense, net } = computeMonthMetrics(visibleState, month);
  const activity = [
    { label: '収入', amount: income, color: income < 0 ? p.danger : p.income },
    { label: '支出', amount: expense, color: expense > 0 ? p.danger : p.income },
  ];
  const netColor = net < 0 ? p.danger : p.income;
  const netAmount = `${net > 0 ? '+' : ''}${formatJPY(net)}`;
  const assetsColor = hidden ? p.textSecondary : assets < 0 ? p.danger : p.income;
  const moneyStyle = { fontWeight: '800' as const, fontVariant: ['tabular-nums'] as ['tabular-nums'] };

  if (appearance === 'classic') {
    return (
      <CardSurface>
        <View style={{ paddingHorizontal: 14 }}>
          <HomeAssetsHeading />
        </View>
        <Text accessibilityLabel={hidden ? hiddenAssetsLabel : undefined} numberOfLines={1} adjustsFontSizeToFit
          style={[moneyStyle, { color: assetsColor, fontSize: 29, paddingHorizontal: 14, paddingBottom: 12 }]}>
          {hidden ? '••••••' : formatJPY(assets)}
        </Text>
        <CardHeader style={{ borderTopColor: p.outline, borderTopWidth: StyleSheet.hairlineWidth }}>
          <MonthBar month={month} onChange={setMonth} />
        </CardHeader>
        {activity.map(({ label, amount, color }) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.separator,
            paddingHorizontal: 14, paddingVertical: 9 }}>
            <Text style={{ color: p.textSecondary, fontSize: 13 }}>{label}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit
              style={[moneyStyle, { flexShrink: 1, textAlign: 'right', color, fontSize: 16 }]}>
              {formatJPY(amount)}
            </Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, backgroundColor: p.fill, paddingHorizontal: 14, paddingVertical: 10 }}>
          <Text style={{ color: p.text, fontSize: 13, fontWeight: '700' }}>月の収支</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit
            style={[moneyStyle, { flexShrink: 1, textAlign: 'right', color: netColor, fontSize: 18 }]}>{netAmount}</Text>
        </View>
      </CardSurface>
    );
  }

  return (
    <>
      <CardSurface style={{ padding: 18, gap: 10, backgroundColor: p.sectionHeader }}>
        <HomeAssetsHeading />
        <Text accessibilityLabel={hidden ? hiddenAssetsLabel : undefined} numberOfLines={1} adjustsFontSizeToFit
          style={[moneyStyle, { color: assetsColor, fontSize: 35 }]}>{hidden ? '••••••' : formatJPY(assets)}</Text>
      </CardSurface>
      <CardSurface style={{ paddingHorizontal: 16, paddingBottom: 15 }}>
        <MonthBar month={month} onChange={setMonth} />
        <View style={{ alignItems: 'center', gap: 4, paddingBottom: 12 }}>
          <Text accessibilityRole="header" style={{ color: p.text, fontSize: 13, fontWeight: '700' }}>月の収支</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit
            style={[moneyStyle, { color: netColor, fontSize: 26, alignSelf: 'stretch', textAlign: 'center' }]}>{netAmount}</Text>
        </View>
        <View style={{ flexDirection: 'row', borderRadius: p.cardRadius, backgroundColor: p.fill, paddingVertical: 10 }}>
          {activity.map(({ label, amount, color }, index) => (
            <View key={label} style={{ flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 5,
              borderLeftColor: p.outline, borderLeftWidth: index ? StyleSheet.hairlineWidth : 0 }}>
              <Text style={{ color: p.textSecondary, fontSize: 12, fontWeight: '600' }}>{label}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit
                style={[moneyStyle, { color, fontSize: 16, alignSelf: 'stretch', textAlign: 'center' }]}>{formatJPY(amount)}</Text>
            </View>
          ))}
        </View>
      </CardSurface>
    </>
  );
}
