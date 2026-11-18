package expo.modules.financebackup

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

internal fun Context.financeBackupPreferences() =
  getSharedPreferences("dmm_finance_backup", Context.MODE_PRIVATE)

internal const val BACKUP_ENABLED = "enabled"

class FinanceBackupModule : Module() {
  private val context: Context
    get() = checkNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("FinanceBackup")

    Function("isEnabled") {
      context.financeBackupPreferences().getBoolean(BACKUP_ENABLED, false)
    }

    Function("setEnabled") { enabled: Boolean ->
      context.financeBackupPreferences().edit().putBoolean(BACKUP_ENABLED, enabled).commit()
    }
  }
}
