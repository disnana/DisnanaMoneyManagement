import { ALL_LEDGER_ICON, ledgerColor, ledgerIcon, ledgerOptions } from '@/lib/ledgerAppearance';
import { pickNear } from '@/lib/pick';
import { useFinance } from '@/lib/store';
import { Group, Row } from '@/ui/kit';

export function LedgerPicker() {
  const { ledgers, activeLedger, setActiveLedgerId } = useFinance();

  return (
    <Group>
      <Row title="家計グループ" right={activeLedger?.name ?? 'すべて'} chevron
        icon={activeLedger ? ledgerIcon(activeLedger) : ALL_LEDGER_ICON} iconColor={ledgerColor(activeLedger)} onPress={async (event) => {
        const choice = await pickNear(event, '家計グループ', [
          { id: '', label: 'すべて', icon: ALL_LEDGER_ICON, selected: !activeLedger },
          ...ledgerOptions(ledgers, activeLedger?.id),
        ]);
        if (choice !== null) setActiveLedgerId(choice || null);
      }} />
    </Group>
  );
}
