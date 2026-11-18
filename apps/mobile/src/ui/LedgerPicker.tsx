import { pickOne } from '@/lib/pick';
import { useFinance } from '@/lib/store';
import { Group, Row } from '@/ui/kit';

export function LedgerPicker() {
  const { ledgers, activeLedger, setActiveLedgerId } = useFinance();

  return (
    <Group>
      <Row title="家計グループ" right={activeLedger?.name ?? 'すべて'} chevron onPress={async () => {
        const choice = await pickOne('家計グループ', [
          { id: '', label: 'すべて', selected: !activeLedger },
          ...ledgers.map(({ id, name }) => ({ id, label: name, selected: activeLedger?.id === id })),
        ]);
        if (choice !== null) setActiveLedgerId(choice || null);
      }} />
    </Group>
  );
}
