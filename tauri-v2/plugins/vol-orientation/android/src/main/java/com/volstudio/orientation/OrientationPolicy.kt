package com.volstudio.orientation

internal object OrientationPolicy {
  fun isSupported(television: Boolean, multiWindow: Boolean): Boolean =
    !television && !multiWindow
}
