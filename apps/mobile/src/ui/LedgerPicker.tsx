import { Pressable, Text } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { ALL_LEDGER_ICON, ledgerColor, ledgerIcon, ledgerOptions } from '@/lib/ledgerAppearance';
import { pickOne } from '@/lib/pick';
import { tick } from '@/lib/haptics';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';

/**
 * Household-group switcher as a compact chip, right-aligned (the setting rarely changes, so it shouldn't cost a full card of
 * screen height). The chip is 36pt tall with a 44pt hit area.
 */
export function LedgerPicker() {
  const p = usePalette();
  const { ledgers, activeLedger, setActiveLedgerId } = useFinance();
  const color = ledgerColor(activeLedger) ?? p.tint;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`家計グループ: ${activeLedger?.name ?? 'すべて'}`}
      hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
      onPress={async () => {
        tick();
        const choice = await pickOne('家計グループ', [
          { id: '', label: 'すべて', icon: ALL_LEDGER_ICON, selected: !activeLedger },
          ...ledgerOptions(ledgers, activeLedger?.id),
        ]);
        if (choice !== null) setActiveLedgerId(choice || null);
      }}
      style={({ pressed }) => ({
        alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 36, paddingHorizontal: 14,
        borderRadius: 18, backgroundColor: pressed ? p.separator : p.fill,
      })}>
      <SymbolView name={activeLedger ? ledgerIcon(activeLedger) : ALL_LEDGER_ICON} size={14} tintColor={color} />
      <Text numberOfLines={1} style={{ color: p.text, fontSize: 15, fontWeight: '600', maxWidth: 200 }}>{activeLedger?.name ?? 'すべて'}</Text>
      <SymbolView name={{ ios: 'chevron.down', android: 'expand_more' }} size={11} tintColor={p.textSecondary} />
    </Pressable>
  );
}
