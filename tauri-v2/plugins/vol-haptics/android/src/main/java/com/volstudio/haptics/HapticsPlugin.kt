package com.volstudio.haptics

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class PlayArgs {
  var timings: LongArray = longArrayOf()
  var amplitudes: IntArray = intArrayOf()
}

@TauriPlugin
class HapticsPlugin(private val activity: Activity) : Plugin(activity) {
  private val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= 31) {
    (activity.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
  } else {
    @Suppress("DEPRECATION")
    activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
  }

  private fun supported(): Boolean =
    activity.checkSelfPermission(Manifest.permission.VIBRATE) == PackageManager.PERMISSION_GRANTED &&
      vibrator?.hasVibrator() == true

  @Command
  fun status(invoke: Invoke) {
    invoke.resolve(JSObject().apply { put("supported", supported()) })
  }

  @Command
  fun play(invoke: Invoke) {
    val args = invoke.parseArgs(PlayArgs::class.java)
    if (!HapticsPolicy.valid(args.timings, args.amplitudes)) {
      invoke.reject("Geçersiz titreşim deseni")
      return
    }
    if (!supported()) {
      invoke.reject("Titreşim motoru veya VIBRATE izni yok")
      return
    }
    try {
      val motor = vibrator ?: return
      if (Build.VERSION.SDK_INT >= 26) {
        val amplitudes = if (motor.hasAmplitudeControl()) args.amplitudes else {
          args.amplitudes.map { if (it == 0) 0 else VibrationEffect.DEFAULT_AMPLITUDE }.toIntArray()
        }
        motor.vibrate(VibrationEffect.createWaveform(args.timings, amplitudes, -1))
      } else {
        @Suppress("DEPRECATION")
        motor.vibrate(HapticsPolicy.legacyPattern(args.timings, args.amplitudes), -1)
      }
      invoke.resolve()
    } catch (error: SecurityException) {
      invoke.reject(error.message ?: "Titreşim izni reddedildi")
    }
  }

  @Command
  fun cancel(invoke: Invoke) {
    vibrator?.cancel()
    invoke.resolve()
  }

  @Suppress("DEPRECATION")
  override fun onPause() {
    vibrator?.cancel()
  }
}
