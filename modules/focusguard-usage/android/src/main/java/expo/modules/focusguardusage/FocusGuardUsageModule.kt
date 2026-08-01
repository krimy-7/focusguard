package expo.modules.focusguardusage

import android.app.AppOpsManager
import android.app.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class FocusGuardUsageModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FocusGuardUsage")

    AsyncFunction("hasUsageAccess") {
      hasUsageAccess()
    }

    AsyncFunction("openUsageAccessSettings") {
      openUsageAccessSettings()
    }

    AsyncFunction("getForegroundPackage") {
      foregroundPackage()
    }

    AsyncFunction("getLaunchableApps") {
      launchableApps()
    }

    AsyncFunction("startBeastGuard") { packages: List<String>, endsAtMs: Long ->
      startBeastGuard(packages, endsAtMs)
    }

    AsyncFunction("stopBeastGuard") {
      stopBeastGuard()
    }

    AsyncFunction("consumeBeastBlock") {
      BeastGuardService.consumeBlockedPackage()
    }
  }

  private fun appContext(): Context {
    return appContext.reactContext ?: appContext.throwingActivity
  }

  private fun hasUsageAccess(): Boolean {
    val appOps = appContext().getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), appContext().packageName)
    } else {
      @Suppress("DEPRECATION")
      appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), appContext().packageName)
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }

  private fun openUsageAccessSettings() {
    val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    appContext().startActivity(intent)
  }

  private fun foregroundPackage(): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return null
    val usm = appContext().getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager ?: return null
    val now = System.currentTimeMillis()
    val events = usm.queryEvents(now - 30_000, now)
    val event = android.app.usage.UsageEvents.Event()
    var last: String? = null
    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      if (event.eventType == android.app.usage.UsageEvents.Event.MOVE_TO_FOREGROUND) {
        last = event.packageName
      }
    }
    return last
  }

  private fun launchableApps(): List<Map<String, String>> {
    val pm = appContext().packageManager
    val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    val selfPackage = appContext().packageName
    return pm.queryIntentActivities(intent, 0)
      .mapNotNull { ri ->
        val pkg = ri.activityInfo.packageName
        if (pkg == selfPackage) return@mapNotNull null
        mapOf("package" to pkg, "name" to ri.loadLabel(pm).toString())
      }
      .distinctBy { it["package"] }
      .sortedBy { it["name"] }
  }

  private fun startBeastGuard(packages: List<String>, endsAtMs: Long) {
    val ctx = appContext()
    val intent = Intent(ctx, BeastGuardService::class.java)
    intent.action = BeastGuardService.ACTION_START
    intent.putStringArrayListExtra(BeastGuardService.EXTRA_PACKAGES, ArrayList(packages))
    intent.putExtra(BeastGuardService.EXTRA_ENDS_AT, endsAtMs)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      ctx.startForegroundService(intent)
    } else {
      ctx.startService(intent)
    }
  }

  private fun stopBeastGuard() {
    val ctx = appContext()
    ctx.stopService(Intent(ctx, BeastGuardService::class.java))
  }
}
