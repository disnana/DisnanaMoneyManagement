import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { formatMonthLabel } from '@dmm/core/utils/format';
import { tick } from '@/lib/haptics';
import { metrics, usePalette } from '@/lib/theme';

const GRID_SIZE = 12;
const GRID_COLUMNS = 4;

export function MonthPicker({ month, onCancel, onPick }: {
  month: string;
  onCancel: () => void;
  onPick: (value: string) => void;
}) {
  const p = usePalette();
  const [initialYear, initialMonth] = month.split('-').map(Number);
  const [year, setYear] = useState(initialYear);
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [yearPage, setYearPage] = useState<number>();
  const choosingYear = yearPage !== undefined;
  const selected = `${year}-${String(selectedMonth).padStart(2, '0')}`;
  const pageLabel = choosingYear ? `${yearPage}〜${yearPage + GRID_SIZE - 1}年` : `${year}年`;

  const stepper = (direction: -1 | 1) => {
    const previous = direction === -1;
    const label = choosingYear ? (previous ? '前の12年' : '次の12年') : (previous ? '前年' : '翌年');
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label}
        onPress={() => {
          tick();
          if (yearPage === undefined) setYear(year + direction);
          else setYearPage(yearPage + direction * GRID_SIZE);
        }}
        style={({ pressed }) => ({
          width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
          borderRadius: metrics.controlRadius, backgroundColor: pressed ? p.fill : 'transparent',
        })}>
        <SymbolView name={previous ? { ios: 'chevron.left', android: 'chevron_left' } : { ios: 'chevron.right', android: 'chevron_right' }}
          size={17} tintColor={p.tint} />
      </Pressable>
    );
  };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Pressable accessible={false} onPress={onCancel} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.58)' }]} />
        <View accessibilityViewIsModal role="dialog" aria-label="年月を選ぶ"
          style={{ width: '100%', maxWidth: 360, padding: 16, gap: 10, borderRadius: metrics.cardRadius + 8,
            borderCurve: 'continuous', backgroundColor: p.card }}>
          <Text style={{ color: p.textSecondary, fontSize: 13, fontWeight: '600' }}>年月を選ぶ</Text>
          <Text accessibilityLiveRegion="polite" style={{ color: p.text, fontSize: 26, fontWeight: '800',
            fontVariant: ['tabular-nums'] }}>{formatMonthLabel(selected)}</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            {stepper(-1)}
            <Pressable accessibilityRole="button" accessibilityLabel={choosingYear ? '月の選択に戻る' : `${year}年。年を変更`}
              accessibilityState={{ expanded: choosingYear }}
              onPress={() => { tick(); setYearPage(choosingYear ? undefined : year - (GRID_SIZE - 2)); }}
              style={({ pressed }) => ({
                paddingHorizontal: 12, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: pressed ? p.fill : 'transparent', borderRadius: metrics.controlRadius,
              })}>
              <Text style={{ color: p.text, fontSize: 16, fontWeight: '700' }}>{pageLabel}</Text>
              <SymbolView name={choosingYear ? { ios: 'chevron.up', android: 'expand_less' } : { ios: 'chevron.down', android: 'expand_more' }}
                size={12} tintColor={p.tint} />
            </Pressable>
            {stepper(1)}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 }}>
            {Array.from({ length: GRID_SIZE }, (_, i) => {
              const value = yearPage === undefined ? i + 1 : yearPage + i;
              const active = value === (choosingYear ? year : selectedMonth);
              return (
                <View key={value} style={{ width: `${100 / GRID_COLUMNS}%`, paddingHorizontal: 2 }}>
                  <Pressable accessibilityRole="button" accessibilityState={{ selected: active }}
                    onPress={() => {
                      tick();
                      if (choosingYear) {
                        setYear(value);
                        setYearPage(undefined);
                      } else {
                        setSelectedMonth(value);
                      }
                    }}
                    style={({ pressed }) => ({
                      minHeight: 48, alignItems: 'center', justifyContent: 'center',
                      borderRadius: metrics.controlRadius + 4, backgroundColor: active ? p.tint : pressed ? p.fill : 'transparent',
                    })}>
                    <Text style={{ color: active ? p.onTint : p.text, fontSize: 15, fontWeight: active ? '700' : '500' }}>
                      {value}{choosingYear ? '年' : '月'}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
            <Pressable accessibilityRole="button" onPress={onCancel}
              style={({ pressed }) => ({
                minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: metrics.controlRadius,
                backgroundColor: pressed ? p.fill : 'transparent',
              })}>
              <Text style={{ color: p.textSecondary, fontWeight: '600' }}>キャンセル</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => { tick(); onPick(selected); }}
              style={({ pressed }) => ({
                minHeight: 44, paddingHorizontal: 18, justifyContent: 'center', borderRadius: metrics.controlRadius,
                backgroundColor: p.tint, opacity: pressed ? 0.8 : 1,
              })}>
              <Text style={{ color: p.onTint, fontWeight: '700' }}>適用</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
