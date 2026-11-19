import { useLayoutEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { shiftMonth } from '@dmm/core/utils/format';
import { tick } from '@/lib/haptics';
import { useFinance } from '@/lib/store';
import { MonthBar, Screen } from './kit';

function monthNumber(month: string): number {
  const [year, number] = month.split('-').map(Number);
  return year * 12 + number;
}

export function MonthScreen({ children, showMonthBar = true, ...props }: Omit<ComponentProps<typeof Screen>, 'children'> & {
  children: (month: string, isPreview: boolean) => ReactNode;
  showMonthBar?: boolean;
}) {
  const { month, setMonth } = useFinance();
  const { width } = useWindowDimensions();
  const [firstMonth] = useState(() => monthNumber(month));
  const pageIndex = monthNumber(month) - firstMonth;
  const position = useSharedValue(pageIndex);
  const settling = useSharedValue(false);
  const track = useAnimatedStyle(() => ({ transform: [{ translateX: -position.value * width }] }));

  useLayoutEffect(() => {
    cancelAnimation(position);
    position.value = pageIndex;
    settling.value = false;
  }, [pageIndex, position, settling]);

  const changeMonth = (delta: number) => {
    tick();
    setMonth((current) => shiftMonth(current, delta));
  };

  const swipe = usePanGesture({
    maxPointers: 1,
    activeOffsetX: [-11, 11],
    failOffsetY: [-17, 17],
    hitSlop: { left: -24, right: -24 },
    onActivate: () => {
      'worklet';
      if (!settling.value) cancelAnimation(position);
    },
    onUpdate: ({ translationX }) => {
      'worklet';
      if (!settling.value) position.value = pageIndex - Math.min(1, Math.max(-1, translationX / width));
    },
    onDeactivate: ({ canceled, translationX, translationY, velocityX }) => {
      'worklet';
      if (settling.value) return;
      const distance = Math.abs(translationX);
      const flick = distance >= 12 && Math.abs(velocityX) >= 340;
      const turn = !canceled && (distance >= 28 || flick) && distance > Math.abs(translationY) * 1.15;
      const direction = translationX > 0 ? -1 : 1;
      settling.value = turn;
      position.value = withTiming(turn ? pageIndex + direction : pageIndex, {
        duration: turn ? 165 : 135,
        easing: Easing.out(Easing.cubic),
      }, (finished) => {
        if (finished && turn) scheduleOnRN(changeMonth, direction);
      });
    },
  });

  return (
    <GestureDetector gesture={swipe} touchAction="pan-y">
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <Animated.View style={[{ flex: 1 }, track]}>
          {[-1, 0, 1].map((delta) => {
            const pageMonth = shiftMonth(month, delta);
            const isPreview = delta !== 0;
            return (
              <View key={pageMonth} style={{ position: 'absolute', top: 0, bottom: 0, left: (pageIndex + delta) * width, width }}
                pointerEvents={isPreview ? 'none' : 'auto'} aria-hidden={isPreview}
                accessibilityElementsHidden={isPreview} importantForAccessibility={isPreview ? 'no-hide-descendants' : 'auto'}>
                <Screen directionalLockEnabled scrollEnabled={!isPreview} {...props}>
                  {showMonthBar ? <MonthBar month={pageMonth} onChange={setMonth} /> : null}
                  {children(pageMonth, isPreview)}
                </Screen>
              </View>
            );
          })}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
