package expo.modules.buildinfo

import android.content.pm.PackageManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BuildInfoModule : Module() {
  @Suppress("DEPRECATION")
  override fun definition() = ModuleDefinition {
    Name("ManeBuildInfo")

    Function("getCommit") {
      appContext.reactContext?.let { context ->
        context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
          .metaData?.getString("com.disnana.mane_chan.BUILD_COMMIT")
      }
    }
  }
}
