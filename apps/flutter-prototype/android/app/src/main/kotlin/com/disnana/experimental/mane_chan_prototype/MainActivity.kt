package com.disnana.experimental.mane_chan_prototype

import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterFragmentActivity() {
    private val aliasPrefix get() = "$packageName.LauncherIcon_"

    @Suppress("DEPRECATION")
    private fun aliases(flags: Int): Map<String, ComponentName> {
        val launcher = Intent(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .setPackage(packageName)
        return packageManager.queryIntentActivities(launcher, flags)
            .map { it.activityInfo.name }
            .filter { it.startsWith(aliasPrefix) }
            .associate { it.removePrefix(aliasPrefix) to ComponentName(packageName, it) }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "mane/launcher").setMethodCallHandler { call, result ->
            try {
                when (call.method) {
                    "selected" -> result.success(aliases(0).keys.firstOrNull())
                    "select" -> {
                        val options = aliases(PackageManager.MATCH_DISABLED_COMPONENTS)
                        val target = options[call.argument<String>("id")]
                        if (target == null) {
                            result.error("UNKNOWN_ICON", "Unknown launcher icon", null)
                        } else {
                            select(target, options.values)
                            result.success(null)
                        }
                    }
                    else -> result.notImplemented()
                }
            } catch (error: Exception) {
                result.error("LAUNCHER_ICON", error.message, null)
            }
        }
    }

    private fun select(target: ComponentName, components: Collection<ComponentName>) {
        val flags = PackageManager.DONT_KILL_APP
        val enabled = PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        val disabled = PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        if (Build.VERSION.SDK_INT >= 33) {
            packageManager.setComponentEnabledSettings(components.map { component ->
                PackageManager.ComponentEnabledSetting(component, if (component == target) enabled else disabled, flags)
            })
        } else {
            packageManager.setComponentEnabledSetting(target, enabled, flags)
            for (component in components.filter { it != target }) {
                packageManager.setComponentEnabledSetting(component, disabled, flags)
            }
        }
    }
}
