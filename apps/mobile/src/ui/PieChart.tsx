import type { KeyboardEvent } from 'react';
import { Platform, Text, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { usePalette } from '@/lib/theme';

export interface Slice {
  id: string;
  value: number;
  color: string;
  label?: string;
}

function arc(center: number, radius: number, start: number, sweep: number) {
  const point = (angle: number) => `${center + radius * Math.cos(angle)} ${center + radius * Math.sin(angle)}`;
  if (sweep >= 2 * Math.PI) {
    return `M ${point(start)} A ${radius} ${radius} 0 0 1 ${point(start + Math.PI)} A ${radius} ${radius} 0 0 1 ${point(start)}`;
  }
  return `M ${point(start)} A ${radius} ${radius} 0 ${sweep > Math.PI ? 1 : 0} 1 ${point(start + sweep)}`;
}

/** Donut chart drawn with SVG strokes (works on iOS, Android and web). */
export function DonutChart({ slices, size = 200, thickness = 26, centerLabel, centerValue, centerDetail, selectedId, onSlicePress }: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  centerDetail?: string;
  selectedId?: string;
  onSlicePress?: (id: string) => void;
}) {
  const p = usePalette();
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const gap = slices.length > 1 ? 2 : 0;
  let offset = 0;
  return (
    <View style={{ width: size, height: size, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={p.fill} strokeWidth={thickness} fill="none" />
          {total > 0
            ? slices.map((s) => {
                const len = (s.value / total) * c;
                const strokeLength = Math.max(len - gap, 0.5);
                const el = onSlicePress ? (
                  <Path key={s.id} d={arc(size / 2, r, offset / r, strokeLength / r)}
                    stroke={s.color} strokeWidth={thickness} fill="none"
                    strokeOpacity={selectedId && s.id !== selectedId ? 0.35 : 1}
                    accessible accessibilityLabel={s.label}
                    {...(Platform.OS === 'web' ? {
                      tabIndex: 0, 'aria-current': s.id === selectedId ? 'true' : undefined,
                      onKeyDown: (event: KeyboardEvent<SVGPathElement>) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        onSlicePress(s.id);
                      },
                    } : {})}
                    onPress={() => onSlicePress(s.id)} />
                ) : (
                  <Circle
                    key={s.id}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    stroke={s.color}
                    strokeWidth={thickness}
                    fill="none"
                    strokeDasharray={`${strokeLength} ${c}`}
                    strokeDashoffset={-offset}
                  />
                );
                offset += len;
                return el;
              })
            : null}
        </G>
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center', width: size - 2 * thickness - 10 }}
        pointerEvents="none" accessibilityLiveRegion={onSlicePress ? 'polite' : undefined}>
        {centerLabel ? <Text numberOfLines={2} style={{ color: p.textSecondary, fontSize: 12, textAlign: 'center' }}>{centerLabel}</Text> : null}
        {centerValue ? (
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: p.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{centerValue}</Text>
        ) : null}
        {centerDetail ? <Text style={{ color: p.textSecondary, fontSize: 12 }}>{centerDetail}</Text> : null}
      </View>
    </View>
  );
}
