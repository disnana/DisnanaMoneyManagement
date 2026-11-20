import { Alert, Platform, type AlertButton } from 'react-native';

/** Expo Web uses the browser's interactive confirmation dialog. */
export function confirmAction(title: string, message: string, confirm: AlertButton, cancel = 'キャンセル') {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n${message}`)) confirm.onPress?.();
    return;
  }
  Alert.alert(title, message, [{ text: cancel, style: 'cancel' }, confirm]);
}
