const { AndroidConfig, withAndroidManifest, withDangerousMod, withStringsXml } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../assets/launcher-icons/catalog.json');

const main = 'android.intent.action.MAIN';
const launcher = 'android.intent.category.LAUNCHER';
const artDir = path.resolve(__dirname, '../assets/launcher-icons');
const characterIcons = catalog.filter(({ id }) => id !== 'classic');
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

    for (const { id } of characterIcons) {
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
    return result;
  }]);
}

module.exports = function withLauncherIcons(config) {
  config = withStringsXml(config, (result) => {
    const appName = result.modResults.resources.string.find(({ $ }) => $.name === 'app_name');
    if (appName) appName._ = 'マネーちゃん';
    return result;
  });
  const files = characterIcons.flatMap(({ id }) => [id + '.png', id + '-foreground.png']);
  const missing = files.filter((file) => !fs.existsSync(path.join(artDir, file)));
  if (missing.length) throw new Error('Missing launcher artwork: ' + missing.join(', '));
  return withIconResources(withLauncherAliases(config));
};
