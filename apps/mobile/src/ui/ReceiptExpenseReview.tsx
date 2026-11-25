import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { formatJPY } from '@dmm/core/utils/format';
import type { ReceiptDocument } from '@/lib/androidReceiptClient';
import { newReceiptID } from '@/lib/receiptDraftFiles';
import { initialReceiptItems, receiptImportDraft, stageReceiptImport, type ReceiptImportMode, type ReceiptItemEdit } from '@/lib/receiptImport';
import { metrics, usePalette } from '@/lib/theme';
import { Segmented } from './kit';

const importModes: { id: ReceiptImportMode; label: string }[] = [
  { id: 'merchant', label: '店舗でまとめる' },
  { id: 'items', label: '商品ごと' },
];

export function ReceiptExpenseReview({ document }: { document: ReceiptDocument }) {
  const p = usePalette();
  const [mode, setMode] = useState<ReceiptImportMode>('merchant');
  const [items, setItems] = useState(() => initialReceiptItems(document));
  const [editing, setEditing] = useState<number>();
  const draft = receiptImportDraft(document, mode, items);
  const hasSelection = items.some((item) => item.included);
  const printedTotal = document.total_minor;

  function updateItem(index: number, update: Partial<ReceiptItemEdit>) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...update } : item));
  }

  function continueImport() {
    if (!draft) return;
    Keyboard.dismiss();
    const id = newReceiptID();
    stageReceiptImport(id, draft);
    router.push({ pathname: '/add', params: { receiptImportId: id } });
  }

  return (
    <View style={styles.editor}>
      {items.length > 0 ? <>
        <Segmented<ReceiptImportMode> value={mode} onChange={setMode} options={importModes} />
        <View style={styles.items}>
          {items.map((item, index) => {
            const title = item.name.trim() || `商品 ${index + 1}`;
            const open = editing === index && item.included;
            return (
              <View key={index} style={[styles.item, { backgroundColor: p.card }]}>
                <View style={styles.line}>
                  <View style={styles.itemText}>
                    <Text style={{ color: item.included ? p.text : p.textSecondary, fontSize: 14, fontWeight: '600' }}>{title}</Text>
                    <Text style={{ color: p.textSecondary, fontSize: 13, fontVariant: ['tabular-nums'] }}>
                      {item.included ? item.amount ? formatJPY(Number(item.amount)) : '金額未入力' : '登録から除外'}
                    </Text>
                  </View>
                  {item.included ? <Pressable accessibilityRole="button" accessibilityLabel={`${title}を${open ? '閉じる' : '修正'}`}
                    onPress={() => {
                      if (open) Keyboard.dismiss();
                      setEditing(open ? undefined : index);
                    }} style={styles.itemAction}>
                    <Text style={{ color: p.tint, fontWeight: '600' }}>{open ? '完了' : '修正'}</Text>
                  </Pressable> : null}
                  <Pressable accessibilityRole="button" accessibilityLabel={`${title}を${item.included ? '除外' : '戻す'}`}
                    onPress={() => updateItem(index, { included: !item.included })} style={styles.itemAction}>
                    <Text style={{ color: p.tint, fontWeight: '600' }}>{item.included ? '除外' : '戻す'}</Text>
                  </Pressable>
                </View>
                {open ? <View style={styles.fields}>
                  <TextInput accessibilityLabel="商品名" placeholder="商品名" placeholderTextColor={p.textSecondary}
                    value={item.name} onChangeText={(name) => updateItem(index, { name })}
                    maxLength={256} style={[styles.input, { color: p.text, backgroundColor: p.fill }]} />
                  <TextInput accessibilityLabel="商品金額（円）" placeholder="金額（円）" placeholderTextColor={p.textSecondary}
                    value={item.amount} onChangeText={(amount) => updateItem(index, { amount: amount.normalize('NFKC').replace(/[^0-9]/g, '') })}
                    keyboardType="number-pad" maxLength={15} style={[styles.input, { color: p.text, backgroundColor: p.fill }]} />
                </View> : null}
              </View>
            );
          })}
        </View>
      </> : null}
      {draft ? <View style={styles.total}>
        <Text style={{ color: p.textSecondary, fontSize: 13 }}>登録する金額</Text>
        <Text style={{ color: p.text, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
          {formatJPY(draft.total)} · {mode === 'items' ? draft.entries.length : 1}件
        </Text>
      </View> : null}
      {draft && printedTotal !== null && draft.total !== printedTotal ? (
        <Text accessibilityLiveRegion="polite" style={{ color: p.textSecondary, fontSize: 13, lineHeight: 20 }}>
          選んだ商品の合計です。レシート記載の合計 {formatJPY(printedTotal)} と差があるので、税・値引きもご確認ください。
        </Text>
      ) : null}
      {!draft && items.length > 0 ? <Text accessibilityLiveRegion="polite" style={{ color: p.textSecondary, fontSize: 13 }}>
        {hasSelection ? '登録する商品の金額を確認してください。' : '取り込む商品を選んでください。'}
      </Text> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !draft }} disabled={!draft}
        onPress={continueImport} style={({ pressed }) => [styles.continue, {
          backgroundColor: p.tint, opacity: !draft ? 0.45 : pressed ? 0.8 : 1,
        }]}>
        <Text style={{ color: p.onTint, fontSize: 14, fontWeight: '700' }}>登録内容を確認</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  editor: { gap: 10, marginTop: 6 },
  items: { gap: 6 },
  item: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  line: { flexDirection: 'row', alignItems: 'center' },
  itemText: { flex: 1, minWidth: 0, gap: 2, paddingLeft: 4 },
  itemAction: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' },
  fields: { gap: 6, padding: 4 },
  input: { minHeight: 46, paddingHorizontal: 10, borderRadius: 10, fontSize: 16 },
  total: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 },
  continue: { minHeight: 48, borderRadius: metrics.controlRadius, alignItems: 'center', justifyContent: 'center' },
});
