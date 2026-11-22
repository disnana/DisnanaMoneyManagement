import { Pressable, Text } from 'react-native';
import { AppSymbol } from './AppSymbol';
import { ALL_LEDGER_ICON, ledgerColor, ledgerIcon } from '@/lib/ledgerAppearance';
import { useLedgerPicker } from '@/lib/ledgerPicker';
import { tick } from '@/lib/haptics';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';

/** Compact household-group switcher for the home summary. */
export function LedgerPill() {
  const p = usePalette();
  const pickLedger = useLedgerPicker();
  const { activeLedger, setActiveLedgerId } = useFinance();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`家計グループ: ${activeLedger?.name ?? 'すべて'}`} hitSlop={8}
      onPress={async () => {
        tick();
        const choice = await pickLedger(activeLedger?.id, 'すべて');
        if (choice !== null) setActiveLedgerId(choice || null);
      }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16,
        backgroundColor: pressed ? p.separator : p.fill })}>
      <AppSymbol name={activeLedger ? ledgerIcon(activeLedger) : ALL_LEDGER_ICON} size={13} tintColor={ledgerColor(activeLedger) ?? p.tint} />
      <Text numberOfLines={1} style={{ color: p.text, fontSize: 13, fontWeight: '700', maxWidth: 120 }}>{activeLedger?.name ?? 'すべて'}</Text>
      <AppSymbol name={{ ios: 'chevron.down', android: 'expand_more' }} size={10} tintColor={p.textSecondary} />
    </Pressable>
  );
}
