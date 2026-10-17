package com.volstudio.orientation

import android.app.Activity
import android.content.res.Configuration
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject

@InvokeArg
class SetOrientationArgs {
  lateinit var orientation: String
  var family: String = OrientationStore.FAMILY_USER
}

/**
 * Yön seçimini Activity'ye uygular ve saklar. Komutlar ana iş parçacığında
 * koşar: `requestedOrientation` pencereye dokunur.
 */
@TauriPlugin
class OrientationPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun getState(invoke: Invoke) {
    activity.runOnUiThread { invoke.resolve(state()) }
  }

  @Command
  fun setOrientation(invoke: Invoke) {
    val args = invoke.parseArgs(SetOrientationArgs::class.java)
    if (!OrientationStore.isOrientation(args.orientation) || !OrientationStore.isFamily(args.family)) {
      invoke.reject("Geçersiz yön isteği: ${args.orientation} / ${args.family}")
      return
    }
    activity.runOnUiThread {
      OrientationStore.save(activity, args.orientation, args.family)
      // Uygulanamayan kipte istek yine saklanır: tercih bir sonraki uygun
      // açılışta geçerlidir, ama çoklu pencerede pencereyi zorlamaz.
      if (OrientationStore.isSupported(activity)) {
        activity.requestedOrientation = OrientationStore.requestedFor(args.orientation, args.family)
      }
      invoke.resolve(state())
    }
  }

  private fun state(): JSObject {
    val result = JSObject()
    result.put("current", currentOrientation())
    result.put("preferred", OrientationStore.load(activity) ?: JSONObject.NULL)
    result.put("supported", OrientationStore.isSupported(activity))
    return result
  }

  private fun currentOrientation(): String =
    if (activity.resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE) {
      OrientationStore.LANDSCAPE
    } else {
      OrientationStore.PORTRAIT
    }
}
