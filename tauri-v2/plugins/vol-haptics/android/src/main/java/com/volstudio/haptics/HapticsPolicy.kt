package com.volstudio.haptics

object HapticsPolicy {
  fun valid(timings: LongArray, amplitudes: IntArray): Boolean =
    timings.isNotEmpty() && timings.size <= 32 && timings.size == amplitudes.size &&
      timings.all { it in 1..1000 } && timings.sum() <= 5000 &&
      amplitudes.all { it in 0..255 } && amplitudes.any { it > 0 }

  fun legacyPattern(timings: LongArray, amplitudes: IntArray): LongArray {
    val result = mutableListOf(0L)
    var vibrating = false
    for (index in timings.indices) {
      val next = amplitudes[index] > 0
      if (next == vibrating) result[result.lastIndex] += timings[index]
      else {
        result.add(timings[index])
        vibrating = next
      }
    }
    return result.toLongArray()
  }
}
