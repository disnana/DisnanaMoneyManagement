const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withOptionalPortraitFeature(config) {
  return withAndroidManifest(config, (result) => {
    const portrait = 'android.hardware.screen.portrait';
    const manifest = result.modResults.manifest;
    const features = (manifest['uses-feature'] ?? [])
      .filter(({ $ }) => $['android:name'] !== portrait);

    // Keep the activity orientation without using it as a Play device filter.
    manifest['uses-feature'] = [...features, {
      $: { 'android:name': portrait, 'android:required': 'false' },
    }];
    return result;
  });
};
