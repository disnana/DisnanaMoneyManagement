package expo.modules.launchericons

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/** Keep the app's task independent of the launcher component that can be disabled. */
class LauncherEntryActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    startActivity(Intent()
      .setClassName(packageName, "$packageName.MainActivity")
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    finish()
  }
}
