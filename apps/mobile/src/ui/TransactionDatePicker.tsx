import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { formatFullDate, formatMonthLabel, formatShortDate, getTodayString, shiftMonth } from '@dmm/core/utils/format';
import { tick } from '@/lib/haptics';
import { metrics, usePalette } from '@/lib/theme';
import { CalendarDialog } from './CalendarDialog';

const WEEK = ['月', '火', '水', '木', '金', '土', '日'];
const COLUMN_WIDTH = '14.285714%';

export function TransactionDatePicker({ date, onCancel, onPick }: {
  date: string;
  onCancel: () => void;
  onPick: (date: string) => void;
}) {
  const p = usePalette();
  const today = getTodayString();
  const [selected, setSelected] = useState(date);
  const [month, setMonth] = useState(date.slice(0, 7));
  const [year, monthNumber] = month.split('-').map(Number);
  const offset = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;
  const days = new Date(year, monthNumber, 0).getDate();

  const stepper = (direction: -1 | 1) => (
    <Pressable accessibilityRole="button" accessibilityLabel={direction < 0 ? '前月' : '翌月'}
      onPress={() => { tick(); setMonth((current) => shiftMonth(current, direction)); }}
      style={({ pressed }) => ({
        width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
        borderRadius: metrics.controlRadius, backgroundColor: pressed ? p.fill : 'transparent',
      })}>
      <SymbolView name={direction < 0 ? { ios: 'chevron.left', android: 'chevron_left' } : { ios: 'chevron.right', android: 'chevron_right' }}
        size={17} tintColor={p.tint} />
    </Pressable>
  );

  return (
    <CalendarDialog title="取引日を選ぶ" value={formatShortDate(selected)} onCancel={onCancel} onApply={() => onPick(selected)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {stepper(-1)}
        <Text accessibilityLiveRegion="polite" style={{ color: p.text, fontSize: 16, fontWeight: '700' }}>{formatMonthLabel(month)}</Text>
        {stepper(1)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {WEEK.map((day) => (
          <Text key={day} style={{ width: COLUMN_WIDTH, paddingBottom: 8, textAlign: 'center', color: p.textSecondary, fontSize: 12 }}>{day}</Text>
        ))}
        {Array.from({ length: 42 }, (_, index) => {
          const day = index - offset + 1;
          const value = `${month}-${String(day).padStart(2, '0')}`;
          const active = value === selected;
          if (day < 1 || day > days) return <View key={index} style={{ width: COLUMN_WIDTH, height: 44 }} />;
          return (
            <Pressable key={index} accessibilityRole="button" accessibilityLabel={formatFullDate(value)}
              accessibilityState={{ selected: active }} aria-pressed={active}
              onPress={() => { tick(); setSelected(value); }}
              style={({ pressed }) => ({
                width: COLUMN_WIDTH, height: 44, alignItems: 'center', justifyContent: 'center', padding: 2,
                borderRadius: metrics.controlRadius + 4, backgroundColor: active ? p.tint : pressed ? p.fill : 'transparent',
              })}>
              <Text style={{ color: active ? p.onTint : value === today ? p.tint : p.text,
                fontSize: 15, fontWeight: active || value === today ? '700' : '500' }}>{day}</Text>
            </Pressable>
          );
        })}
      </View>
    </CalendarDialog>
  );
}
