package com.volstudio.orientation

import android.app.Activity
import android.app.UiModeManager
import android.content.Context
import android.content.pm.ActivityInfo
import android.content.res.Configuration

/**
 * Yön tercihinin native kaydı.
 *
 * Tercih JS deposunda değil burada durur: Activity açılışında, sayfa yüklenmeden
 * okunabilmesi gerekir. Sayfadan sonra uygulanan bir yön her açılışta ekranı bir
 * kez döndürürdü.
 */
object OrientationStore {
  const val PORTRAIT = "portrait"
  const val LANDSCAPE = "landscape"
  const val FAMILY_USER = "user"
  const val FAMILY_SENSOR = "sensor"

  private const val PREFERENCES = "vol_orientation"
  private const val KEY_ORIENTATION = "orientation"
  private const val KEY_FAMILY = "family"

  fun load(context: Context): String? =
    preferences(context).getString(KEY_ORIENTATION, null)?.takeIf { isOrientation(it) }

  fun save(context: Context, orientation: String, family: String) {
    preferences(context).edit().putString(KEY_ORIENTATION, orientation).putString(KEY_FAMILY, family).apply()
  }

  /** Kayıtlı yönü içerik çizilmeden uygular; kayıt yoksa manifestteki varsayılan geçerli kalır. */
  @JvmStatic
  fun applySaved(activity: Activity) {
    if (!isSupported(activity)) return
    val orientation = load(activity) ?: return
    val family = preferences(activity).getString(KEY_FAMILY, FAMILY_USER) ?: FAMILY_USER
    activity.requestedOrientation = requestedFor(orientation, family)
  }

  fun requestedFor(orientation: String, family: String): Int {
    val sensor = family == FAMILY_SENSOR
    return if (orientation == LANDSCAPE) {
      if (sensor) ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE else ActivityInfo.SCREEN_ORIENTATION_USER_LANDSCAPE
    } else {
      if (sensor) ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT else ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT
    }
  }

  fun isOrientation(value: String): Boolean = value == PORTRAIT || value == LANDSCAPE

  fun isFamily(value: String): Boolean = value == FAMILY_USER || value == FAMILY_SENSOR

  fun isSupported(activity: Activity): Boolean {
    val uiMode = activity.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
    val television = uiMode?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION
    return OrientationPolicy.isSupported(television, activity.isInMultiWindowMode)
  }

  private fun preferences(context: Context) =
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
}
