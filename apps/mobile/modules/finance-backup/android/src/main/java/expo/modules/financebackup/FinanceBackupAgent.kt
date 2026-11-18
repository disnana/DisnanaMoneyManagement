package expo.modules.financebackup

import android.app.backup.BackupAgent
import android.app.backup.BackupDataInput
import android.app.backup.BackupDataOutput
import android.app.backup.FullBackupDataOutput
import android.os.ParcelFileDescriptor

class FinanceBackupAgent : BackupAgent() {
  override fun onFullBackup(data: FullBackupDataOutput) {
    if (financeBackupPreferences().getBoolean(BACKUP_ENABLED, false)) {
      super.onFullBackup(data)
    }
  }

  // fullBackupOnly uses Android's file-based mechanism.
  override fun onBackup(oldState: ParcelFileDescriptor?, data: BackupDataOutput?, newState: ParcelFileDescriptor?) = Unit

  override fun onRestore(data: BackupDataInput?, appVersionCode: Int, newState: ParcelFileDescriptor?) = Unit
}
