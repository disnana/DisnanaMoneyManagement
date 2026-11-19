import { getOrderedLedgers } from '@dmm/core/utils/ledgers';
import { ALL_LEDGER_ICON, ledgerOptions } from './ledgerAppearance';
import { pickOne } from './pick';
import { useFinance } from './store';

export function useLedgerPicker() {
  const { state, setLedgerOrder } = useFinance();

  return (selectedId?: string, emptyLabel?: string) => {
    const options = ledgerOptions(getOrderedLedgers(state), selectedId);
    if (emptyLabel) {
      options.unshift({ id: '', label: emptyLabel, icon: ALL_LEDGER_ICON, selected: !selectedId, reorderable: false });
    }
    return pickOne('家計グループ', options, {
      layout: 'divided',
      searchLabel: '家計グループ名を検索',
      reorderTitle: '家計グループの並べ替え',
      onReorder: setLedgerOrder,
    });
  };
}
