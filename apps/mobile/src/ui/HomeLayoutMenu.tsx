import { homeLayouts, useHomeLayout } from '@/lib/homePreferences';
import { pickOne } from '@/lib/pick';
import { HeaderAction } from './HeaderAction';

export function HomeLayoutMenu() {
  const [layout, setLayout] = useHomeLayout();

  const open = async () => {
    const choice = await pickOne('ホームのレイアウト', homeLayouts.map((item) => ({
      ...item, selected: item.id === layout,
    })), { layout: 'divided' });
    const selected = homeLayouts.find(({ id }) => id === choice);
    if (selected) setLayout(selected.id);
  };

  return (
    <HeaderAction name={{ ios: 'rectangle.3.group', android: 'dashboard_customize' }} label="ホームのレイアウト"
      circular inContent onPress={open} />
  );
}
