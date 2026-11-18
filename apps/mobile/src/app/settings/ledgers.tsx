import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { Ledger } from '@dmm/core/types/finance';
import { pickOne } from '@/lib/pick';
import { useFinance } from '@/lib/store';
import { usePalette } from '@/lib/theme';
import { HeaderAction } from '@/ui/HeaderAction';
import { Group, IconBadge, Screen, Segmented } from '@/ui/kit';

const LEDGER_KINDS: { id: Ledger['kind']; label: string }[] = [
  { id: 'personal', label: '個人' },
  { id: 'household', label: '家庭' },
  { id: 'business', label: '事業' },
];
const ICONS: Record<Ledger['kind'], SymbolViewProps['name']> = {
  personal: { ios: 'person.fill', android: 'person' },
  household: { ios: 'house.fill', android: 'home' },
  business: { ios: 'briefcase.fill', android: 'work' },
};

export default function Ledgers() {
  const p = usePalette();
  const { ledgers, activeLedger, setActiveLedgerId, addLedger, renameLedger, deleteLedger } = useFinance();
  const [editing, setEditing] = useState<Ledger>();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Ledger['kind']>('personal');
  const [error, setError] = useState('');
  const swipeRows = useRef(new Map<string, SwipeableMethods>());
  const openRow = useRef<string | null>(null);
  const canDelete = ledgers.length > 1;

  const reset = () => {
    setEditing(undefined);
    setCreating(false);
    setName('');
    setKind('personal');
    setError('');
  };

  const displayEditor = (ledger?: Ledger) => {
    if (openRow.current) swipeRows.current.get(openRow.current)?.close();
    setEditing(ledger);
    setCreating(!ledger);
    setName(ledger?.name ?? '');
    setKind(ledger?.kind ?? 'personal');
    setError('');
  };

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === 'すべて' || ledgers.some((ledger) => ledger.id !== editing?.id && ledger.name === trimmed)) {
      setError('他のグループと重複しない名前を入力してください');
      return;
    }
    if (editing) renameLedger(editing.id, trimmed);
    else addLedger(trimmed, kind);
    reset();
  };

  const remove = async (ledger: Ledger) => {
    swipeRows.current.get(ledger.id)?.close();
    const destination = await pickOne(
      `「${ledger.name}」を削除し、口座と記録を移動`,
      ledgers.filter((item) => item.id !== ledger.id).map(({ id, name }) => ({ id, label: name }))
    );
    if (!destination) return;
    deleteLedger(ledger.id, destination);
    if (activeLedger?.id === ledger.id) setActiveLedgerId(destination);
    if (editing?.id === ledger.id) reset();
  };

  return (
    <>
      <Stack.Screen options={{
        title: '家計グループ',
        headerRight: () => (
          <HeaderAction name={{ ios: 'plus', android: 'add' }} label="グループを追加" accent onPress={() => displayEditor()} />
        ),
      }} />
      <Screen keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Group>
          {ledgers.map((ledger) => {
            const selected = editing?.id === ledger.id;
            const label = LEDGER_KINDS.find((item) => item.id === ledger.kind)?.label;
            return (
              <Swipeable key={ledger.id} enabled={canDelete} overshootRight={false} rightThreshold={36}
                ref={(ref) => { if (ref) swipeRows.current.set(ledger.id, ref); else swipeRows.current.delete(ledger.id); }}
                onSwipeableWillOpen={() => {
                  if (openRow.current && openRow.current !== ledger.id) swipeRows.current.get(openRow.current)?.close();
                  openRow.current = ledger.id;
                }}
                onSwipeableClose={() => { if (openRow.current === ledger.id) openRow.current = null; }}
                renderRightActions={canDelete ? () => (
                  <Pressable accessibilityRole="button" accessibilityLabel={`${ledger.name}を削除`}
                    onPress={() => void remove(ledger)}
                    style={{ width: 76, backgroundColor: '#B91C1C', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <SymbolView name={{ ios: 'trash', android: 'delete' }} size={19} tintColor="#fff" />
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>削除</Text>
                  </Pressable>
                ) : undefined}>
                <Pressable accessibilityRole="button" accessibilityLabel={ledger.name} accessibilityState={{ selected }}
                  accessibilityHint={canDelete ? '左にスワイプで削除を表示' : undefined}
                  onPress={() => displayEditor(ledger)}
                  style={({ pressed }) => ({
                    minHeight: 58, paddingHorizontal: 14, paddingVertical: 8, gap: 12, flexDirection: 'row',
                    alignItems: 'center', backgroundColor: selected || pressed ? p.fill : p.card,
                  })}>
                  <IconBadge name={ICONS[ledger.kind]} color={p.tint} size={34} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: selected ? p.tint : p.text, fontSize: 16, fontWeight: '700' }}>{ledger.name}</Text>
                    {label !== ledger.name ? <Text style={{ color: p.textSecondary, fontSize: 12 }}>{label}</Text> : null}
                  </View>
                  <SymbolView name={selected ? { ios: 'checkmark.circle.fill', android: 'check_circle' }
                    : { ios: 'chevron.right', android: 'chevron_right' }} size={17} tintColor={selected ? p.tint : p.textSecondary} />
                </Pressable>
              </Swipeable>
            );
          })}
        </Group>
        {editing || creating ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: p.text, fontSize: 17, fontWeight: '700' }}>{editing ? `${editing.name}を編集` : '新しいグループ'}</Text>
              <View style={{ flexDirection: 'row' }}>
                {editing && canDelete ? (
                  <HeaderAction name={{ ios: 'trash', android: 'delete' }} label="編集中のグループを削除" onPress={() => void remove(editing)} />
                ) : null}
                <HeaderAction name={{ ios: 'xmark', android: 'close' }} label="編集を閉じる" onPress={reset} />
              </View>
            </View>
            {creating ? <Segmented value={kind} onChange={setKind} options={LEDGER_KINDS} /> : null}
            <Group>
              <TextInput accessibilityLabel="グループ名" placeholder="グループ名" placeholderTextColor={p.textSecondary}
                value={name} onChangeText={setName} maxLength={40}
                style={{ minHeight: 52, paddingHorizontal: 16, color: p.text, fontSize: 16 }} />
            </Group>
            {error ? <Text accessibilityLiveRegion="polite" style={{ color: p.danger }}>{error}</Text> : null}
            <Pressable accessibilityRole="button" onPress={save}
              style={({ pressed }) => ({ alignItems: 'center', justifyContent: 'center', minHeight: 48,
                borderRadius: 14, backgroundColor: p.tint, opacity: pressed ? 0.8 : 1 })}>
              <Text style={{ color: p.onTint, fontWeight: '700', fontSize: 15 }}>{editing ? '変更を保存' : '作成'}</Text>
            </Pressable>
          </>
        ) : null}
      </Screen>
    </>
  );
}
