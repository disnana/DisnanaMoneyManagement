const { AndroidConfig, withAndroidManifest, withDangerousMod, withStringsXml } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../assets/launcher-icons/catalog.json');

const main = 'android.intent.action.MAIN';
const launcher = 'android.intent.category.LAUNCHER';
const artDir = path.resolve(__dirname, '../assets/launcher-icons');
const characterIcons = catalog.filter(({ id }) => id !== 'classic');
const fixedIcons = characterIcons.filter(({ id }) => !id.endsWith('_auto'));
const automaticIcons = characterIcons.filter(({ id }) => id.endsWith('_auto'));
const defaultId = characterIcons[0].id;
const entryActivity = 'expo.modules.launchericons.LauncherEntryActivity';

function withLauncherAliases(config) {
  return withAndroidManifest(config, (result) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(result.modResults);
    app.$['android:icon'] = '@mipmap/mane_' + defaultId;
    app.$['android:roundIcon'] = '@mipmap/mane_' + defaultId;
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(result.modResults);
    const filters = activity['intent-filter'] ?? [];
    const launcherFilters = filters.filter((filter) =>
      filter.action?.some(({ $ }) => $['android:name'] === main) &&
      filter.category?.some(({ $ }) => $['android:name'] === launcher)
    );
    if (launcherFilters.length > 0) {
      activity['intent-filter'] = filters.filter((filter) => !launcherFilters.includes(filter));
    }

    const activities = (app.activity ?? []).filter(({ $ }) => $['android:name'] !== entryActivity);
    app.activity = [...activities, {
      $: {
        'android:name': entryActivity,
        'android:exported': 'false',
        'android:excludeFromRecents': 'true',
        'android:taskAffinity': '',
        'android:theme': '@android:style/Theme.NoDisplay',
      },
    }];

    const otherAliases = (app['activity-alias'] ?? []).filter(({ $ }) =>
      !$['android:name'].startsWith('.LauncherIcon_')
    );
    app['activity-alias'] = [...otherAliases, ...catalog.map(({ id }) => ({
      $: {
        'android:name': '.LauncherIcon_' + id,
        'android:targetActivity': entryActivity,
        'android:exported': 'true',
        'android:enabled': id === defaultId ? 'true' : 'false',
        'android:icon': id === 'classic' ? '@mipmap/ic_launcher' : '@mipmap/mane_' + id,
        'android:label': '@string/launcher_app_name',
      },
      'intent-filter': [{
        action: [{ $: { 'android:name': main } }],
        category: [{ $: { 'android:name': launcher } }],
      }],
    }))];
    return result;
  });
}

function withIconResources(config) {
  return withDangerousMod(config, ['android', (result) => {
    const res = path.join(result.modRequest.platformProjectRoot, 'app/src/main/res');
    const bitmap = path.join(res, 'drawable-nodpi');
    const legacy = path.join(res, 'mipmap-nodpi');
    const adaptive = path.join(res, 'mipmap-anydpi-v26');
    [bitmap, legacy, adaptive].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

    for (const { id } of fixedIcons) {
      const name = 'mane_' + id;
      const background = id.endsWith('_mint') ? '#ACF1DB' : '#124D55';
      fs.copyFileSync(path.join(artDir, id + '.png'), path.join(legacy, name + '.png'));
      fs.copyFileSync(path.join(artDir, id + '-foreground.png'), path.join(bitmap, name + '_foreground.png'));
      fs.writeFileSync(path.join(adaptive, name + '.xml'), `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background>
    <color android:color="${background}" />
  </background>
  <foreground android:drawable="@drawable/${name}_foreground" />
</adaptive-icon>
`);
    }

    // Keep the launcher component stable across theme changes and reuse the fixed artwork.
    for (const [directory, tone] of [['values', 'mint'], ['values-night', 'teal']]) {
      const values = path.join(res, directory);
      fs.mkdirSync(values, { recursive: true });
      const entries = automaticIcons.map(({ id }) => {
        const fixedId = id.replace(/_auto$/, '_' + tone);
        return `  <item type="mipmap" name="mane_${id}">@mipmap/mane_${fixedId}</item>`;
      });
      fs.writeFileSync(path.join(values, 'mane_automatic_icons.xml'),
        `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${entries.join('\n')}\n</resources>\n`);
    }
    return result;
  }]);
}

module.exports = function withLauncherIcons(config) {
  config = withStringsXml(config, (result) => {
    result.modResults = AndroidConfig.Strings.setStringItem([
      { $: { name: 'app_name' }, _: 'マネーちゃん' },
      { $: { name: 'launcher_app_name' }, _: 'マネちゃん' },
    ], result.modResults);
    return result;
  });
  const files = fixedIcons.flatMap(({ id }) => [id + '.png', id + '-foreground.png']);
  const missing = files.filter((file) => !fs.existsSync(path.join(artDir, file)));
  if (missing.length) throw new Error('Missing launcher artwork: ' + missing.join(', '));
  return withIconResources(withLauncherAliases(config));
};
