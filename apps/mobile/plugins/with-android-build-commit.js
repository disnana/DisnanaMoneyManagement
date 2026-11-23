const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

module.exports = function withAndroidBuildCommit(config) {
  const commit = process.env.MANE_ANDROID_BUILD_COMMIT;
  if (!commit) return config;
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('Invalid Android build commit SHA');

  return withAndroidManifest(config, (result) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(result.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      application, 'com.disnana.mane_chan.BUILD_COMMIT', commit,
    );
    return result;
  });
};
