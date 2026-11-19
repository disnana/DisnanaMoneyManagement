import { useMemo, useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ACCOUNT_TYPE_LABELS } from '@dmm/core/data/categories';
import { computeAccountBalances } from '@dmm/core/store/finance';
import type { Account } from '@dmm/core/types/finance';
import { formatJPY, getTodayString, shiftMonth } from '@dmm/core/utils/format';
import { computeMonthMetrics } from '@dmm/core/utils/metrics';
import { ACCOUNT_ICONS } from '@/lib/accountIcons';
import { tick } from '@/lib/haptics';
import { homeLayouts, useHomeAssetVisibility, useHomeLayout } from '@/lib/homePreferences';
import { pickOne } from '@/lib/pick';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { HeaderAction } from './HeaderAction';
import { AccountSummaryGroup, AccountSummaryRow } from './AccountSummaryRow';
import { HomeAssetsHeading, hiddenAssetsLabel } from './HomeAssets';
import { ModernFeature, ModernHeroAmount, featureColors } from './ModernHero';
import { IconBadge, MonthBar } from './kit';

const money = { fontWeight: '800' as const, fontVariant: ['tabular-nums'] as ['tabular-nums'] };

function AssetsTrend({ assets }: { assets: number }) {
  const { state, visibleState } = useFinance();
  const today = getTodayString();
  const currentMonth = today.slice(0, 7);
  const [plotWidth, setPlotWidth] = useState(0);
  const points = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const month = shiftMonth(currentMonth, index - 5);
    if (index === 5) return { month, amount: assets };
    const cutoff = shiftMonth(month, 1) + '-01';
    const balances = computeAccountBalances({ ...state, transactions: state.transactions.filter((tx) => tx.date < cutoff) });
    return { month, amount: visibleState.accounts.reduce((sum, account) => sum + (balances[account.id] ?? 0), 0) };
  }), [state, visibleState.accounts, currentMonth, assets]);

  const amounts = points.map(({ amount }) => amount);
  const minimum = Math.min(...amounts);
  const span = Math.max(...amounts) - minimum;
  if (!span) return null;

  const plotHeight = 55;
  const step = Math.max(0, plotWidth - 12) / (points.length - 1);
  const measurements = points.map(({ amount }, index) => ({
    x: 6 + step * index,
    y: plotHeight - 7 - (amount - minimum) / span * (plotHeight - 14),
  }));
  const last = measurements[measurements.length - 1];

  return (
    <View accessible accessibilityRole="image"
      accessibilityLabel={points.map(({ month, amount }, index) =>
        (index === points.length - 1 ? '現在' : Number(month.slice(5)) + '月末') + 'の総資産 ' + formatJPY(amount)).join('、')}
      style={{ gap: 5, marginTop: 4 }}>
      <View onLayout={(event) => setPlotWidth(event.nativeEvent.layout.width)} style={{ height: plotHeight }}>
        {[0, 0.5, 1].map((position) => (
          <View key={position} style={{ position: 'absolute', top: 7 + position * (plotHeight - 14), left: 0, right: 0,
            borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#B8D9FF33' }} />
        ))}
        {step > 0 && measurements.slice(1).map((point, index) => {
          const from = measurements[index];
          const length = Math.hypot(point.x - from.x, point.y - from.y);
          return <View key={points[index].month} style={{
            position: 'absolute', height: 2.5, width: length + 1, borderRadius: 2, backgroundColor: featureColors.positive,
            left: (point.x + from.x - length) / 2, top: (point.y + from.y) / 2 - 1,
            transform: [{ rotate: Math.atan2(point.y - from.y, point.x - from.x) + 'rad' }],
          }} />;
        })}
        {step > 0 ? (
          <View style={{ position: 'absolute', left: last.x - 4, top: last.y - 4, width: 8, height: 8,
            borderRadius: 4, backgroundColor: featureColors.positive, borderWidth: 1, borderColor: featureColors.text }} />
        ) : null}
      </View>
      <View aria-hidden style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {points.map(({ month }, index) => (
          <Text key={month} style={{ fontSize: 11, color: index === points.length - 1 ? featureColors.text : featureColors.secondary }}>
            {index === points.length - 1 ? '現在' : Number(month.slice(5)) + '月'}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function ModernHomeSections({ assets, accounts, balances, onOpen }: {
  assets: number; accounts: Account[]; balances: Record<string, number>; onOpen: (id: string) => void;
}) {
  const p = usePalette();
  const [layout, setLayout] = useHomeLayout();
  const { state } = useFinance();
  const switchLayout = async () => {
    const choice = await pickOne('ホームのレイアウト', homeLayouts.map((item) => ({
      ...item, selected: item.id === layout,
    })), { layout: 'divided' });
    const selected = homeLayouts.find(({ id }) => id === choice);
    if (selected) setLayout(selected.id);
  };
  const rail = <ModernAccountRail accounts={accounts} balances={balances} onOpen={onOpen} />;

  return (
    <>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 5 }}>
        <Text accessibilityRole="header" style={{ flex: 1, fontSize: 34, fontWeight: '800', color: p.text, letterSpacing: -0.8 }}>ホーム</Text>
        <HeaderAction name={{ ios: 'rectangle.3.group', android: 'dashboard_customize' }} label="ホームのレイアウト" circular inContent
          onPress={switchLayout} />
        <HeaderAction name={{ ios: 'list.clipboard', android: 'assignment' }} label="予算・計画" circular inContent
          onPress={() => router.push('/planning')} />
        <HeaderAction name={{ ios: 'gearshape', android: 'settings' }} label="設定" circular inContent
          onPress={() => router.push('/settings')} />
      </SafeAreaView>

      {layout === 'trend' ? (
        <>
          <ModernAssets assets={assets} emphasis="trend" />
          <ModernCashFlow />
          {rail}
        </>
      ) : layout === 'month' ? (
        <>
          <ModernCashFlow prominent />
          <View style={{ backgroundColor: p.card, borderRadius: 18, borderCurve: 'continuous', paddingHorizontal: 14, paddingBottom: 13 }}>
            <ModernAssets assets={assets} emphasis="compact" />
          </View>
          {rail}
        </>
      ) : (
        <>
          <View style={{ backgroundColor: p.card, borderRadius: 25, borderCurve: 'continuous', paddingHorizontal: 10, paddingBottom: 7 }}>
            <View style={{ paddingHorizontal: 8, paddingTop: 7, paddingBottom: 13 }}>
              <ModernAssets assets={assets} emphasis="wallet" />
            </View>
            <WalletAccounts
              accounts={accounts}
              balances={balances}
              bankAccounts={state.accounts}
              onOpen={onOpen}
            />
          </View>
          <ModernCashFlow />
        </>
      )}
    </>
  );
}

function ModernAssets({ assets, emphasis }: { assets: number; emphasis: 'trend' | 'compact' | 'wallet' }) {
  const p = usePalette();
  const [hidden] = useHomeAssetVisibility();

  if (emphasis === 'trend') {
    return (
      <ModernFeature>
        <HomeAssetsHeading onDark />
        {hidden ? (
          <Text accessibilityLabel={hiddenAssetsLabel} style={[money, { color: featureColors.secondary, fontSize: 32 }]}>••••••</Text>
        ) : (
          <>
            <ModernHeroAmount amount={assets} color={assets < 0 ? featureColors.negative : featureColors.positive} />
            <AssetsTrend assets={assets} />
          </>
        )}
      </ModernFeature>
    );
  }

  return (
    <>
      <HomeAssetsHeading />
      <Text accessibilityLabel={hidden ? hiddenAssetsLabel : undefined} numberOfLines={1} adjustsFontSizeToFit
        style={[money, { color: hidden ? p.textSecondary : assets < 0 ? p.danger : p.income,
          fontSize: emphasis === 'wallet' ? 36 : 25, letterSpacing: -0.4 }]}>
        {hidden ? '••••••' : formatJPY(assets)}
      </Text>
    </>
  );
}

function ModernCashFlow({ prominent = false }: { prominent?: boolean }) {
  const p = usePalette();
  const { month, setMonth, setTransactionFilter, visibleState } = useFinance();
  const { income, expense, net } = computeMonthMetrics(visibleState, month);
  const activity = [
    { label: '収入', amount: income, color: p.income, icon: { ios: 'arrow.down.right', android: 'south_east' } },
    { label: '支出', amount: expense, color: p.danger, icon: { ios: 'arrow.up.right', android: 'north_east' } },
  ] as const;
  const plotted = activity.filter(({ amount }) => amount !== 0);
  const { width, fontScale } = useWindowDimensions();
  const stacked = width / fontScale < 310;

  return (
      <View style={[{ paddingHorizontal: 3, gap: 8 }, prominent && {
        backgroundColor: p.card, borderRadius: 24, borderCurve: 'continuous', padding: 15, borderLeftWidth: 4, borderLeftColor: p.tint,
      }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 4 }}>
          <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: '800', color: p.text }}>月の収支</Text>
          <MonthBar month={month} onChange={setMonth} compact />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', columnGap: 8 }}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[money, { flexShrink: 1, color: net < 0 ? p.danger : p.income,
            fontSize: prominent ? 38 : 30, letterSpacing: -0.5 }]}>
            {net > 0 ? '+' : ''}{formatJPY(net)}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="選択月の取引を見る"
            onPress={() => { tick(); setTransactionFilter('all'); router.navigate('/transactions'); }}
            style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, opacity: pressed ? 0.65 : 1 })}>
            <Text style={{ color: p.tint, fontWeight: '700', fontSize: 13 }}>取引を見る</Text>
            <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} tintColor={p.tint} size={12} />
          </Pressable>
        </View>
        <View aria-hidden style={{ height: 7, backgroundColor: p.fill, flexDirection: 'row',
          gap: plotted.length > 1 ? 4 : 0, borderRadius: 6, overflow: 'hidden' }}>
          {plotted.map(({ label, amount, color }) => (
            <View key={label} style={{ flex: Math.abs(amount), flexBasis: 0, backgroundColor: color, borderRadius: 6 }} />
          ))}
        </View>
        <View style={{ flexDirection: stacked ? 'column' : 'row', gap: 10 }}>
          {activity.map(({ label, amount, icon, color }) => (
            <View key={label} style={[{ flex: stacked ? undefined : 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
              prominent && { backgroundColor: p.fill, borderRadius: 13, padding: 7 }]}>
              <IconBadge name={icon} color={color} size={31} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: p.textSecondary, fontSize: 12 }}>{label}</Text>
                <Text numberOfLines={1} adjustsFontSizeToFit style={[money, {
                  color: (label === '収入' ? amount < 0 : amount > 0) ? p.danger : p.income, fontSize: 16 }]}>{formatJPY(amount)}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
  );
}

function ModernAccountRail({ accounts, balances, onOpen }: {
  accounts: Account[]; balances: Record<string, number>; onOpen: (id: string) => void;
}) {
  const p = usePalette();
  const { width, fontScale } = useWindowDimensions();
  const tileWidth = Math.min(218, Math.round(width * (fontScale > 1.3 ? 0.62 : 0.415)));
  return (
    <View style={{ gap: 10 }}>
      <AccountsHeading />
      {accounts.length ? (
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 9 }}
          snapToInterval={tileWidth + 9} decelerationRate="fast">
          {accounts.map((account) => {
            const amount = balances[account.id] ?? 0;
            const tone = account.type === 'bank' || account.type === 'foreign_bank' ? p.income : p.tint;
            return (
              <Pressable key={account.id} accessibilityRole="button" accessibilityLabel={account.name + ' ' + formatJPY(amount)}
                onPress={() => { tick(); onOpen(account.id); }}
                style={({ pressed }) => ({ backgroundColor: pressed ? p.fill : p.card, width: tileWidth, padding: 11, gap: 8,
                  borderRadius: 19, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, borderColor: p.separator })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <IconBadge name={ACCOUNT_ICONS[account.type]} color={tone} size={32} />
                  <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} tintColor={p.textSecondary} size={13} />
                </View>
                <View style={{ gap: 3 }}>
                  <Text style={{ color: p.textSecondary, fontSize: 11 }}>{ACCOUNT_TYPE_LABELS[account.type]}</Text>
                  <Text numberOfLines={2} style={{ color: p.text, fontSize: 13, fontWeight: '700' }}>{account.name}</Text>
                </View>
                <Text numberOfLines={1} adjustsFontSizeToFit style={[money, { color: amount < 0 ? p.danger : p.income, fontSize: 19 }]}>
                  {formatJPY(amount)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <Text style={{ color: p.textSecondary, fontSize: 14 }}>この家計グループに表示する口座がありません</Text>
      )}
    </View>
  );
}

function AccountsHeading() {
  const p = usePalette();
  return (
    <View style={{ paddingHorizontal: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <Text accessibilityRole="header" style={{ color: p.text, fontSize: 20, fontWeight: '800', flexShrink: 1 }}>口座別残高</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="口座を見る" onPress={() => router.navigate('/accounts')}
        style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.65 : 1 })}>
        <Text style={{ color: p.tint, fontWeight: '700', fontSize: 13 }}>口座を見る</Text>
      </Pressable>
    </View>
  );
}

function WalletAccounts({ accounts, balances, bankAccounts, onOpen }: {
  accounts: Account[]; balances: Record<string, number>; bankAccounts: Account[]; onOpen: (id: string) => void;
}) {
  const p = usePalette();
  const [expanded, setExpanded] = useState(false);
  const rows: ReactNode = (expanded ? accounts : accounts.slice(0, 3)).map((account) => (
    <AccountSummaryRow key={account.id} account={account} balance={balances[account.id] ?? 0}
      linkedBank={bankAccounts.find(({ id }) => id === account.linkedBankAccountId)} flat onPress={() => onOpen(account.id)} />
  ));

  return (
    <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.separator, paddingHorizontal: 6 }}>
      <AccountsHeading />
      {accounts.length ? <AccountSummaryGroup flat>{rows}</AccountSummaryGroup> : (
        <Text style={{ color: p.textSecondary, paddingHorizontal: 4, paddingBottom: 10 }}>この家計グループに表示する口座がありません</Text>
      )}
      {accounts.length > 3 ? (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)}
          style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', alignItems: 'center', opacity: pressed ? 0.65 : 1 })}>
          <Text style={{ color: p.tint, fontWeight: '700', fontSize: 13 }}>
            {expanded ? '口座を折りたたむ' : `残りの${accounts.length - 3}口座を見る`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
