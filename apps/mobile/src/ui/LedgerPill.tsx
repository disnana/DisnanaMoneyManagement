import { Pressable, Text } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { ALL_LEDGER_ICON, ledgerIcon, ledgerOptions } from '@/lib/ledgerAppearance';
import { pickOne } from '@/lib/pick';
import { tick } from '@/lib/haptics';
import { useFinance } from '@/lib/store';

/** Compact household-group switcher for sitting on top of a coloured card. */
export function LedgerPill() {
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
        backgroundColor: pressed ? 'rgba(0,0,0,0.34)' : 'rgba(0,0,0,0.24)' })}>
      <SymbolView name={activeLedger ? ledgerIcon(activeLedger) : ALL_LEDGER_ICON} size={13} tintColor="#fff" />
      <Text numberOfLines={1} style={{ color: '#fff', fontSize: 13, fontWeight: '700', maxWidth: 120 }}>{activeLedger?.name ?? 'すべて'}</Text>
      <SymbolView name={{ ios: 'chevron.down', android: 'expand_more' }} size={10} tintColor="#fff" />
    </Pressable>
  );
}
