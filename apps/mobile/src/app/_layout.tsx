import { useEffect } from 'react';
import { Platform } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { FinanceProvider } from '@/lib/store';
import { PickerHost } from '@/lib/pick';
import { KeyboardDone } from '@/ui/KeyboardDone';
import { usePalette } from '@/lib/theme';
import '@/lib/themePref';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();
  const p = usePalette();

  useEffect(() => {
    // Storage is synchronous, so the first frame already has data
    void SplashScreen.hideAsync();
  }, []);

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <FinanceProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="add"
            options={Platform.select({
              // iOS: native form sheet (UISheetPresentationController) with grabber
              ios: {
                presentation: 'formSheet',
                sheetAllowedDetents: [1],
                sheetGrabberVisible: true,
                headerShown: false,
              },
              // Android: full-screen modal with a Material top app bar
              default: {
                presentation: 'modal',
                headerShown: true,
                title: '収支を記録',
                headerStyle: { backgroundColor: p.bg },
                headerTintColor: p.text,
                headerShadowVisible: false,
              },
            })}
          />
        </Stack>
        <PickerHost />
        <KeyboardDone />
      </FinanceProvider>
    </ThemeProvider>
  );
}
