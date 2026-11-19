import { StyleSheet, Text, View } from 'react-native';
import { formatJPY } from '@dmm/core/utils/format';
import { computeMonthMetrics } from '@dmm/core/utils/metrics';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { useAppearanceStyle } from '@/lib/themePref';
import { CardHeader, CardSurface } from './CardSurface';
import { HeroCard, MonthlyCashFlow } from './HeroCard';
import { IconBadge, MonthBar, SectionTitle } from './kit';
import { LedgerPill } from './LedgerPill';
import { ModernHero } from './ModernHero';

export function HomeOverview({ month, assets }: { month: string; assets: number }) {
  const [appearance] = useAppearanceStyle();

  if (appearance !== 'standard') {
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
  appearance: 'classic' | 'modern' | 'soft';
  month: string;
  assets: number;
}) {
  const p = usePalette();
  const { visibleState, setMonth } = useFinance();
  const { income, expense, net } = computeMonthMetrics(visibleState, month);
  const activity = [
    { label: '収入', amount: income, color: income < 0 ? p.danger : p.income },
    { label: '支出', amount: expense, color: expense > 0 ? p.danger : p.income },
  ];
  const netColor = net < 0 ? p.danger : p.income;
  const netAmount = `${net > 0 ? '+' : ''}${formatJPY(net)}`;
  const assetsColor = assets < 0 ? p.danger : p.income;
  const moneyStyle = { fontWeight: '800' as const, fontVariant: ['tabular-nums'] as ['tabular-nums'] };

  if (appearance === 'classic') {
    return (
      <CardSurface>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 }}>
          <Text accessibilityRole="header" style={{ flex: 1, color: p.text, fontSize: 15, fontWeight: '700' }}>現在の総資産</Text>
          <LedgerPill />
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit
          style={[moneyStyle, { color: assetsColor, fontSize: 29, paddingHorizontal: 14, paddingBottom: 12 }]}>
          {formatJPY(assets)}
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

  if (appearance === 'modern') {
    const hasActivity = income !== 0 || expense !== 0;
    const flowIcons = [
      { ios: 'arrow.down.left', android: 'south_west' },
      { ios: 'arrow.up.right', android: 'north_east' },
    ] as const;

    return (
      <>
        <ModernHero>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <IconBadge name={{ ios: 'wallet.pass', android: 'account_balance_wallet' }} color={p.tint} size={34} />
              <Text accessibilityRole="header" style={{ color: p.text, fontSize: 14, fontWeight: '700', flexShrink: 1 }}>現在の総資産</Text>
            </View>
            <LedgerPill />
          </View>
          <Text numberOfLines={1} adjustsFontSizeToFit
            style={[moneyStyle, { color: assetsColor, fontSize: 45, letterSpacing: -1.5 }]}>{formatJPY(assets)}</Text>
        </ModernHero>

        <View style={{ backgroundColor: p.card, borderRadius: 25, borderCurve: 'continuous', paddingHorizontal: 16, paddingBottom: 15, gap: 8 }}>
          <MonthBar month={month} onChange={setMonth} />
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <Text accessibilityRole="header" style={{ flexShrink: 0, color: p.text, fontSize: 16, fontWeight: '700' }}>月の収支</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit
              style={[moneyStyle, { flexShrink: 1, color: netColor, fontSize: 24 }]}>{netAmount}</Text>
          </View>
          <View aria-hidden style={{ height: 10, flexDirection: 'row', backgroundColor: p.fill, borderRadius: 15,
            overflow: 'hidden', gap: income !== 0 && expense !== 0 ? 4 : 0 }}>
            {hasActivity ? activity.filter(({ amount }) => amount !== 0).map(({ label, amount, color }) => (
              <View key={label} style={{ flex: Math.abs(amount), flexBasis: 0, backgroundColor: color, borderRadius: 15 }} />
            )) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, paddingTop: 2 }}>
            {activity.map(({ label, amount, color }, index) => (
              <View key={label} style={{ flex: 1, gap: 3, paddingHorizontal: 10, paddingVertical: 7,
                backgroundColor: p.fill, borderRadius: 15 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <IconBadge name={flowIcons[index]} color={color} size={22} />
                  <Text style={{ color: p.textSecondary, fontSize: 12, flexShrink: 1 }}>{label}</Text>
                </View>
                <Text numberOfLines={1} adjustsFontSizeToFit
                  style={[moneyStyle, { color, fontSize: 16 }]}>{formatJPY(amount)}</Text>
              </View>
            ))}
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <CardSurface style={{ padding: 18, gap: 10, backgroundColor: p.sectionHeader }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
          <Text accessibilityRole="header" style={{ color: p.text, fontSize: 15, fontWeight: '700', flexShrink: 1 }}>現在の総資産</Text>
          <LedgerPill />
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit
          style={[moneyStyle, { color: assetsColor, fontSize: 35 }]}>{formatJPY(assets)}</Text>
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
