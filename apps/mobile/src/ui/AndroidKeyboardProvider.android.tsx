import type { ReactNode } from 'react';
import { KeyboardProvider } from 'react-native-keyboard-controller';

export function AndroidKeyboardProvider({ children }: { children: ReactNode }) {
  return <KeyboardProvider statusBarTranslucent navigationBarTranslucent>{children}</KeyboardProvider>;
}
