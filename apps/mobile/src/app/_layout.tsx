import { useEffect, useMemo } from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type NativeStackNavigationOptions } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { Platform, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { FinanceProvider } from '@/lib/store';
import { AndroidKeyboardProvider } from '@/ui/AndroidKeyboardProvider';
import { PickerHost } from '@/lib/pick';
import { KeyboardDone } from '@/ui/KeyboardDone';
import { LockGate } from '@/ui/LockGate';
import { androidSettingsTransition, useAppReducedMotion } from '@/lib/motionPref';
import { usePalette } from '@/lib/theme';
import '@/lib/themePref';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();
  const p = usePalette();
  const reduceMotion = useAppReducedMotion();
  const settingsTransition = androidSettingsTransition(reduceMotion);
  // Keep the native navigator underneath attached while a settings entry covers it.
  // Reattaching its nested fragments on Back can leave Android with an empty frame.
  const settingsEntryOptions: NativeStackNavigationOptions | undefined = Platform.OS === 'android'
    ? { ...settingsTransition, presentation: 'transparentModal', contentStyle: { backgroundColor: p.bg } }
    : undefined;
  const detailOptions: NativeStackNavigationOptions = {
    headerShown: true, headerBackButtonDisplayMode: 'minimal', headerShadowVisible: false,
    headerStyle: { backgroundColor: p.bg }, headerTintColor: p.text, contentStyle: { backgroundColor: p.bg },
  };
  const navigationTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return Platform.OS === 'android'
      ? { ...base, colors: { ...base.colors, background: p.bg } }
      : base;
  }, [scheme, p.bg]);

  useEffect(() => {
    if (Platform.OS === 'android') {
      // Android can expose the activity window before the next native screen draws.
      void SystemUI.setBackgroundColorAsync(p.bg).catch((error: unknown) => {
        if (__DEV__) console.warn('Could not update the Android window background', error);
      });
    }
  }, [p.bg]);

  useEffect(() => {
    // The finance provider shows loading or recovery until the saved ledger is available.
    void SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Platform.OS === 'android' ? p.bg : undefined }}>
    <AndroidKeyboardProvider>
    <LockGate>
    <ThemeProvider value={navigationTheme}>
      <FinanceProvider>
        <Stack screenOptions={{ headerShown: false, animation: reduceMotion ? 'none' : 'default' }}>
          {/* Back from a direct settings link replaces the route with /accounts. */}
          <Stack.Screen name="(tabs)" options={Platform.OS === 'android' ? { animationTypeForReplace: 'pop' } : undefined} />
          <Stack.Screen name="settings" options={settingsEntryOptions} />
          <Stack.Screen name="categories" options={{ ...detailOptions, ...settingsEntryOptions }} />
          {(['category-editor', 'category-detail'] as const).map((name) => (
            <Stack.Screen key={name} name={name} options={{ ...detailOptions, ...settingsTransition }} />
          ))}
          {(['planning/savings-editor', 'budget-editor', 'purchase-editor', 'purchase-compare', 'purchase-confirm', 'planning', 'search'] as const).map((name) => (
            <Stack.Screen key={name} name={name} options={detailOptions} />
          ))}
          <Stack.Screen
            name="add"
            options={{
              presentation: 'card',
              gestureEnabled: true,
              fullScreenGestureEnabled: false,
              headerShown: true,
              headerBackButtonDisplayMode: 'minimal',
              title: '収支を記録',
              contentStyle: { backgroundColor: p.bg },
              headerStyle: { backgroundColor: p.bg },
              headerTintColor: p.text,
              headerShadowVisible: false,
            }}
          />
        </Stack>
        <PickerHost />
        <KeyboardDone />
      </FinanceProvider>
    </ThemeProvider>
    </LockGate>
    </AndroidKeyboardProvider>
    </GestureHandlerRootView>
  );
}
