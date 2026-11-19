import type { ScrollViewProps } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

export function FormScrollView({ automaticallyAdjustKeyboardInsets: _iosInsets, ...props }: ScrollViewProps) {
  return <KeyboardAwareScrollView {...props} bottomOffset={16} />;
}
