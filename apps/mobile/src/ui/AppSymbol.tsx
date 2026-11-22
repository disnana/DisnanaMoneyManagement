import { Platform } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

/** Expo Web accepts the same Material Symbols names as Android. */
export function AppSymbol({ name, ...props }: SymbolViewProps) {
  const symbol = Platform.OS === 'web' && typeof name === 'object' && !name.web
    ? { ...name, web: name.android } : name;
  return <SymbolView name={symbol} {...props} />;
}
