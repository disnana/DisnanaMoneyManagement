import { Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { usePalette } from '@/lib/theme';

export interface Slice {
  id: string;
  value: number;
  color: string;
}

/** Donut chart drawn with SVG strokes (works on iOS, Android and web). */
export function DonutChart({ slices, size = 200, thickness = 26, centerLabel, centerValue }: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
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
                const el = (
                  <Circle
                    key={s.id}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    stroke={s.color}
                    strokeWidth={thickness}
                    fill="none"
                    strokeDasharray={`${Math.max(len - gap, 0.5)} ${c}`}
                    strokeDashoffset={-offset}
                  />
                );
                offset += len;
                return el;
              })
            : null}
        </G>
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }} pointerEvents="none">
        {centerLabel ? <Text style={{ color: p.textSecondary, fontSize: 12 }}>{centerLabel}</Text> : null}
        {centerValue ? (
          <Text style={{ color: p.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{centerValue}</Text>
        ) : null}
      </View>
    </View>
  );
}
