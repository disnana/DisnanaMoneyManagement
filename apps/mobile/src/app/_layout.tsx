import { useEffect, useMemo } from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { FinanceProvider } from '@/lib/store';
import { PickerHost } from '@/lib/pick';
import { KeyboardDone } from '@/ui/KeyboardDone';
import { LockGate } from '@/ui/LockGate';
import { usePalette } from '@/lib/theme';
import { useAppearanceStyle, useThemeColorScheme } from '@/lib/themePref';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useThemeColorScheme();
  const p = usePalette();
  const [style] = useAppearanceStyle();
  const navigationTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return style === 'standard' ? base : {
      ...base,
      colors: { background: p.bg, card: p.card, text: p.text, primary: p.tint, border: p.outline, notification: p.danger },
    };
  }, [p, scheme, style]);

  useEffect(() => {
    // Storage is synchronous, so the first frame already has data
    void SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <LockGate>
    <ThemeProvider value={navigationTheme}>
      <FinanceProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="settings" />
          {(['categories', 'category-editor', 'category-detail', 'planning/savings-editor', 'budget-editor', 'purchase-editor', 'purchase-compare', 'purchase-confirm'] as const).map((name) => (
            <Stack.Screen key={name} name={name} options={{
              headerShown: true, headerBackButtonDisplayMode: 'minimal', headerShadowVisible: false,
              headerStyle: { backgroundColor: p.bg }, headerTintColor: p.text, contentStyle: { backgroundColor: p.bg },
            }} />
          ))}
          <Stack.Screen name="planning" options={{
            headerShown: true, headerBackButtonDisplayMode: 'minimal', headerShadowVisible: false,
            headerStyle: { backgroundColor: p.bg }, headerTintColor: p.text, contentStyle: { backgroundColor: p.bg },
          }} />
          <Stack.Screen name="search" options={{
            headerShown: true, headerBackButtonDisplayMode: 'minimal', headerShadowVisible: false,
            headerStyle: { backgroundColor: p.bg }, headerTintColor: p.text, contentStyle: { backgroundColor: p.bg },
          }} />
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
    </GestureHandlerRootView>
  );
}
