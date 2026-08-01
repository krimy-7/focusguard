package expo.modules.focusguardusage

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import java.util.concurrent.ConcurrentHashMap

class BeastGuardService : Service() {
  companion object {
    const val ACTION_START = "expo.modules.focusguardusage.START"
    const val ACTION_STOP = "expo.modules.focusguardusage.STOP"
    const val EXTRA_PACKAGES = "blocked_packages"
    const val EXTRA_ENDS_AT = "ends_at_ms"
    const val CHANNEL_ID = "beast_mode"
    const val NOTIFICATION_ID = 1001

    @Volatile
    private var lastBlockedPackage: String? = null

    @Volatile
    private var blockedPackages: Set<String> = emptySet()

    fun consumeBlockedPackage(): String? {
      val pkg = lastBlockedPackage
      lastBlockedPackage = null
      return pkg
    }
  }

  private val handler = Handler(Looper.getMainLooper())
  private val pollIntervalMs = 1000L
  private var endsAtMs = 0L
  private var running = false

  private val pollRunnable = object : Runnable {
    override fun run() {
      if (!running) return
      if (endsAtMs > 0 && System.currentTimeMillis() >= endsAtMs) {
        stopSelf()
        return
      }
      val foreground = foregroundPackage()
      if (foreground != null && foreground in blockedPackages && foreground != packageName) {
        lastBlockedPackage = foreground
        launchFocusGuard(foreground)
      }
      handler.postDelayed(this, pollIntervalMs)
    }
  }

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START -> {
        blockedPackages = intent.getStringArrayListExtra(EXTRA_PACKAGES)?.toSet() ?: emptySet()
        endsAtMs = intent.getLongExtra(EXTRA_ENDS_AT, 0L)
        startForeground(NOTIFICATION_ID, buildNotification())
        if (!running) {
          running = true
          handler.post(pollRunnable)
        }
      }
      ACTION_STOP -> stopSelf()
    }
    return START_STICKY
  }

  override fun onDestroy() {
    running = false
    handler.removeCallbacks(pollRunnable)
    blockedPackages = emptySet()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun foregroundPackage(): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return null
    val usm = getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager ?: return null
    val now = System.currentTimeMillis()
    val events = usm.queryEvents(now - 15_000, now)
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

  private fun launchFocusGuard(blockedPackage: String) {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: return
    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    launchIntent.putExtra(EXTRA_PACKAGES, blockedPackage)
    try {
      startActivity(launchIntent)
    } catch (_: Exception) {
    }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL_ID, "Beast Mode", NotificationManager.IMPORTANCE_LOW)
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
  }

  private fun buildNotification(): Notification {
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    val contentIntent = PendingIntent.getActivity(
      this,
      0,
      packageManager.getLaunchIntentForPackage(packageName)?.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    return builder
      .setContentTitle("Beast Mode is active")
      .setContentText("${blockedPackages.size} app(s) blocked — stay focused.")
      .setSmallIcon(android.R.drawable.ic_lock_lock)
      .setOngoing(true)
      .setContentIntent(contentIntent)
      .build()
  }
}
