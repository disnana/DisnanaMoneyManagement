import { Pressable, Text, View } from 'react-native';
import { AppSymbol } from '@/ui/AppSymbol';
import { ALL_LEDGER_ICON, ledgerColor, ledgerIcon } from '@/lib/ledgerAppearance';
import { useLedgerPicker } from '@/lib/ledgerPicker';
import { tick } from '@/lib/haptics';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { historyMetrics, historyStyles } from './historyStyles';

/**
 * Household-group switcher as a compact chip, right-aligned (the setting rarely changes, so it shouldn't cost a full card of
 * screen height). The chip is 36pt tall with a 44pt hit area.
 */
export function LedgerPicker({ inline = false }: { inline?: boolean }) {
  const p = usePalette();
  const pickLedger = useLedgerPicker();
  const { activeLedger, setActiveLedgerId } = useFinance();
  const color = ledgerColor(activeLedger) ?? p.tint;

  const button = (
    <Pressable accessibilityRole="button" accessibilityLabel={`家計グループ: ${activeLedger?.name ?? 'すべて'}`}
      hitSlop={inline ? undefined : { top: 4, bottom: 4, left: 8, right: 8 }}
      onPress={async () => {
        tick();
        const choice = await pickLedger(activeLedger?.id, 'すべて');
        if (choice !== null) setActiveLedgerId(choice || null);
      }}
      style={({ pressed }) => inline ? [historyStyles.scope, { opacity: pressed ? 0.7 : 1 }] : ({
        flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 36, paddingHorizontal: 14,
        borderRadius: 18, backgroundColor: pressed ? p.separator : p.fill,
      })}>
      <AppSymbol name={activeLedger ? ledgerIcon(activeLedger) : ALL_LEDGER_ICON} size={inline ? historyMetrics.icon : 14} tintColor={color} />
      <Text numberOfLines={inline ? 2 : 1} style={inline ? [historyStyles.scopeText, { color: p.textSecondary }] :
        { color: p.text, fontSize: 15, fontWeight: '600', maxWidth: 200 }}>{activeLedger?.name ?? (inline ? '全グループ' : 'すべて')}</Text>
      <AppSymbol name={{ ios: 'chevron.down', android: 'expand_more' }} size={11} tintColor={p.textSecondary} />
    </Pressable>
  );
  return inline ? button : <View style={{ width: '100%', flexDirection: 'row', justifyContent: 'flex-end' }}>{button}</View>;
}
