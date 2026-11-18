import { ActionSheetIOS } from 'react-native';

export interface PickOption {
  id: string;
  label: string;
  destructive?: boolean;
}

/** iOS: the native action sheet (UIAlertController). */
export function pickOne(title: string | undefined, options: PickOption[]): Promise<string | null> {
  return new Promise((resolve) => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...options.map((o) => o.label), 'キャンセル'],
        cancelButtonIndex: options.length,
        destructiveButtonIndex: options.findIndex((o) => o.destructive) >= 0
          ? options.findIndex((o) => o.destructive)
          : undefined,
      },
      (index) => resolve(index >= 0 && index < options.length ? options[index].id : null)
    );
  });
}

/** Nothing to mount on iOS: the action sheet is system UI. */
export const PickerHost = () => null;
