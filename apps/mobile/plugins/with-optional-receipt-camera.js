const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withOptionalReceiptCamera(config) {
  return withAndroidManifest(config, (result) => {
    const features = ['android.hardware.camera', 'android.hardware.camera.autofocus'];
    const manifest = result.modResults.manifest;
    const otherFeatures = (manifest['uses-feature'] ?? [])
      .filter(({ $ }) => !features.includes($['android:name']));

    // Play otherwise treats the camera permission as requiring both a rear camera
    // and autofocus. The photo picker and the rest of the app work without them.
    manifest['uses-feature'] = [
      ...otherFeatures,
      ...features.map((name) => ({ $: { 'android:name': name, 'android:required': 'false' } })),
    ];
    return result;
  });
};
