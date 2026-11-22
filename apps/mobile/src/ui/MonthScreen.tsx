import { useEffect, useLayoutEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { shiftMonth } from '@dmm/core/utils/format';
import { useAppReducedMotion } from '@/lib/motionPref';
import { tick } from '@/lib/haptics';
import { useFinance } from '@/lib/store';
import { MonthBar, Screen } from './kit';

type MonthContent = (month: string, isPreview: boolean) => ReactNode;

export function MonthScreen({ children, showMonthBar = true, ...props }: Omit<ComponentProps<typeof Screen>, 'children'> & {
  children: MonthContent;
  showMonthBar?: boolean;
}) {
  const { setMonth } = useFinance();
  return (
    <MonthPager>
      {(month, isPreview) => (
        <Screen directionalLockEnabled scrollEnabled={!isPreview} {...props}>
          {showMonthBar ? <MonthBar month={month} onChange={setMonth} /> : null}
          {children(month, isPreview)}
        </Screen>
      )}
    </MonthPager>
  );
}

/** A page owns its vertical scroller. The pager owns horizontal motion and month selection. */
export function MonthPager({ children }: { children: MonthContent }) {
  const { month, setMonth } = useFinance();
  const reduceMotion = useAppReducedMotion();
  const animateSwipe = Platform.OS === 'android' || !reduceMotion;
  const deferPreviews = Platform.OS === 'android' && reduceMotion;
  const [previewsReady, setPreviewsReady] = useState(false);
  const renderPreviews = animateSwipe && (!deferPreviews || previewsReady);
  const { width } = useWindowDimensions();
  // The active page stays inside the middle third of the native parent, even many months from today.
  const offset = useSharedValue(0);
  const settling = useSharedValue(false);
  const track = useAnimatedStyle(() => ({ transform: [{ translateX: (offset.get() - 1) * width }] }));

  useLayoutEffect(() => {
    cancelAnimation(offset);
    offset.set(0);
    settling.set(false);
  }, [month, offset, settling]);

  useEffect(() => {
    if (!deferPreviews || previewsReady) return;
    const request = requestIdleCallback(() => setPreviewsReady(true), { timeout: 180 });
    return () => cancelIdleCallback(request);
  }, [deferPreviews, previewsReady]);

  const preparePreviews = () => setPreviewsReady(true);

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
      if (!settling.get()) cancelAnimation(offset);
      if (animateSwipe && !renderPreviews) scheduleOnRN(preparePreviews);
    },
    onUpdate: ({ translationX }) => {
      'worklet';
      if (animateSwipe && !settling.get()) offset.set(Math.min(1, Math.max(-1, translationX / width)));
    },
    onDeactivate: ({ canceled, translationX, translationY, velocityX }) => {
      'worklet';
      if (settling.get()) return;
      const distance = Math.abs(translationX);
      const flick = distance >= 12 && Math.abs(velocityX) >= 340;
      const turn = !canceled && (distance >= 28 || flick) && distance > Math.abs(translationY) * 1.15;
      const direction = translationX > 0 ? -1 : 1;
      settling.set(turn);
      if (!animateSwipe) {
        if (turn) scheduleOnRN(changeMonth, direction);
        return;
      }
      offset.set(withTiming(turn ? -direction : 0, {
        duration: turn ? 165 : 135,
        easing: Easing.out(Easing.cubic),
      }, (finished) => {
        if (finished && turn) scheduleOnRN(changeMonth, direction);
      }));
    },
  });

  return (
    <GestureDetector gesture={swipe} touchAction="pan-y">
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <Animated.View style={[{ flex: 1, width: 3 * width }, track]}>
          {(renderPreviews ? [-1, 0, 1] : [0]).map((delta) => {
            const pageMonth = shiftMonth(month, delta);
            const isPreview = delta !== 0;
            return (
              <View key={pageMonth} style={{ position: 'absolute', top: 0, bottom: 0, left: (1 + delta) * width, width }}
                {...(Platform.OS === 'web' ? { inert: isPreview } : {})}
                pointerEvents={isPreview ? 'none' : 'auto'} aria-hidden={isPreview}
                accessibilityElementsHidden={isPreview} importantForAccessibility={isPreview ? 'no-hide-descendants' : 'auto'}>
                {children(pageMonth, isPreview)}
              </View>
            );
          })}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
