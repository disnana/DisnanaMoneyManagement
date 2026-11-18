import { Pressable, Text } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { ALL_LEDGER_ICON, ledgerColor, ledgerIcon, ledgerOptions } from '@/lib/ledgerAppearance';
import { pickOne } from '@/lib/pick';
import { tick } from '@/lib/haptics';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';

/** Compact household-group switcher for the home summary. */
export function LedgerPill() {
  const p = usePalette();
  const { ledgers, activeLedger, setActiveLedgerId } = useFinance();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`家計グループ: ${activeLedger?.name ?? 'すべて'}`} hitSlop={8}
      onPress={async () => {
        tick();
        const choice = await pickOne('家計グループ', [
          { id: '', label: 'すべて', icon: ALL_LEDGER_ICON, selected: !activeLedger },
          ...ledgerOptions(ledgers, activeLedger?.id),
        ]);
        if (choice !== null) setActiveLedgerId(choice || null);
      }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16,
        backgroundColor: pressed ? p.separator : p.fill })}>
      <SymbolView name={activeLedger ? ledgerIcon(activeLedger) : ALL_LEDGER_ICON} size={13} tintColor={ledgerColor(activeLedger) ?? p.tint} />
      <Text numberOfLines={1} style={{ color: p.text, fontSize: 13, fontWeight: '700', maxWidth: 120 }}>{activeLedger?.name ?? 'すべて'}</Text>
      <SymbolView name={{ ios: 'chevron.down', android: 'expand_more' }} size={10} tintColor={p.textSecondary} />
    </Pressable>
  );
}
