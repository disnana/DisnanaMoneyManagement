import { Pressable, Text } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { ALL_LEDGER_ICON, ledgerColor, ledgerIcon } from '@/lib/ledgerAppearance';
import { useLedgerPicker } from '@/lib/ledgerPicker';
import { tick } from '@/lib/haptics';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { featureColors } from './ModernHero';

/** Compact household-group switcher for the home summary. */
export function LedgerPill({ onDark = false }: { onDark?: boolean }) {
  const p = usePalette();
  const pickLedger = useLedgerPicker();
  const { activeLedger, setActiveLedgerId } = useFinance();
  const foreground = onDark ? featureColors.text : p.text;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`家計グループ: ${activeLedger?.name ?? 'すべて'}`} hitSlop={8}
      onPress={async () => {
        tick();
        const choice = await pickLedger(activeLedger?.id, 'すべて');
        if (choice !== null) setActiveLedgerId(choice || null);
      }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingVertical: 4, paddingHorizontal: 12, borderRadius: 16,
        backgroundColor: onDark ? (pressed ? featureColors.pressed : featureColors.control) : pressed ? p.separator : p.fill })}>
      <SymbolView name={activeLedger ? ledgerIcon(activeLedger) : ALL_LEDGER_ICON} size={13} tintColor={onDark ? foreground : ledgerColor(activeLedger) ?? p.tint} />
      <Text numberOfLines={1} style={{ color: foreground, fontSize: 13, fontWeight: '700', maxWidth: 120 }}>{activeLedger?.name ?? 'すべて'}</Text>
      <SymbolView name={{ ios: 'chevron.down', android: 'expand_more' }} size={10} tintColor={onDark ? foreground : p.textSecondary} />
    </Pressable>
  );
}
