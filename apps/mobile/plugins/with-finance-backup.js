const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

module.exports = function withFinanceBackup(config) {
  return withAndroidManifest(config, (result) => {
    const attributes = AndroidConfig.Manifest.getMainApplicationOrThrow(result.modResults).$;
    attributes['android:allowBackup'] = 'true';
    attributes['android:backupAgent'] = 'expo.modules.financebackup.FinanceBackupAgent';
    attributes['android:fullBackupOnly'] = 'true';
    attributes['android:fullBackupContent'] = '@xml/dmm_finance_backup';
    attributes['android:dataExtractionRules'] = '@xml/dmm_finance_data_extraction';
    return result;
  });
};
