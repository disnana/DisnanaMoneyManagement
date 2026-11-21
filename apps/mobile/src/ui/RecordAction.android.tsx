import { Button, ExtendedFloatingActionButton, Host, Text } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, height, semantics } from '@expo/ui/jetpack-compose/modifiers';
import { usePalette } from '@/lib/theme';

export function RecordAction({ label, onPress, floating = false }: {
  label: string;
  onPress: () => void;
  floating?: boolean;
}) {
  const p = usePalette();
  const description = semantics({ contentDescription: label });
  if (floating) {
    return (
      <Host matchContents>
        <ExtendedFloatingActionButton containerColor={p.tint} onClick={onPress} modifiers={[description]}>
          <ExtendedFloatingActionButton.Icon>
            <Text color={p.onTint} style={{ fontSize: 23 }}>＋</Text>
          </ExtendedFloatingActionButton.Icon>
          <ExtendedFloatingActionButton.Text>
            <Text color={p.onTint}>{label}</Text>
          </ExtendedFloatingActionButton.Text>
        </ExtendedFloatingActionButton>
      </Host>
    );
  }
  return (
    <Host matchContents={{ vertical: true }}>
      <Button colors={{ containerColor: p.tint, contentColor: p.onTint }}
        modifiers={[fillMaxWidth(), height(52), description]} onClick={onPress}>
        <Text color={p.onTint}>{label}</Text>
      </Button>
    </Host>
  );
}
