package expo.modules.launchericons

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LauncherIconsModule : Module() {
  private val context: Context
    get() = checkNotNull(appContext.reactContext)

  private val prefix: String
    get() = "${context.packageName}.LauncherIcon_"

  @Suppress("DEPRECATION")
  private fun aliases(flags: Int): Map<String, ComponentName> {
    val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      .setPackage(context.packageName)
    return context.packageManager
      .queryIntentActivities(intent, flags)
      .map { it.activityInfo.name }
      .filter { it.startsWith(prefix) }
      .associate { it.removePrefix(prefix) to ComponentName(context.packageName, it) }
  }

  override fun definition() = ModuleDefinition {
    Name("LauncherIcons")

    Function("available") { aliases(PackageManager.MATCH_DISABLED_COMPONENTS).keys.toList() }

    Function("selected") {
      val manager = context.packageManager
      val enabled = aliases(0)
      enabled.entries.firstOrNull {
        manager.getComponentEnabledSetting(it.value) == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
      }?.key ?: enabled.keys.firstOrNull()
    }

    Function("select") { id: String ->
      val components = aliases(PackageManager.MATCH_DISABLED_COMPONENTS)
      val target = requireNotNull(components[id]) { "Unknown launcher icon" }
      val manager = context.packageManager
      val dontKill = PackageManager.DONT_KILL_APP
      val enabled = PackageManager.COMPONENT_ENABLED_STATE_ENABLED
      val disabled = PackageManager.COMPONENT_ENABLED_STATE_DISABLED

      if (Build.VERSION.SDK_INT >= 33) {
        manager.setComponentEnabledSettings(components.values.map { component ->
          PackageManager.ComponentEnabledSetting(component, if (component == target) enabled else disabled, dontKill)
        })
      } else {
        // Always enable the replacement first so a launcher entry remains available on failure.
        manager.setComponentEnabledSetting(target, enabled, dontKill)
        components.values.filter { it != target }.forEach { component ->
          manager.setComponentEnabledSetting(component, disabled, dontKill)
        }
      }
    }
  }
}
