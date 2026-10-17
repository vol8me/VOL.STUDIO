package com.volstudio.haptics

import org.junit.Assert.*
import org.junit.Test

class HapticsPolicyTest {
  @Test
  fun firstPulseIsNotMistakenForAndroidInitialDelay() {
    assertArrayEquals(
      longArrayOf(0, 26, 60, 26),
      HapticsPolicy.legacyPattern(longArrayOf(26, 60, 26), intArrayOf(64, 0, 64))
    )
  }

  @Test
  fun adjacentPulseStatesAreMerged() {
    assertArrayEquals(
      longArrayOf(10, 30, 40, 50),
      HapticsPolicy.legacyPattern(longArrayOf(10, 10, 20, 40, 50), intArrayOf(0, 40, 64, 0, 255))
    )
  }

  @Test
  fun malformedAndUnboundedPatternsAreRejected() {
    assertTrue(HapticsPolicy.valid(longArrayOf(12), intArrayOf(64)))
    assertFalse(HapticsPolicy.valid(longArrayOf(), intArrayOf()))
    assertFalse(HapticsPolicy.valid(longArrayOf(12), intArrayOf(64, 0)))
    assertFalse(HapticsPolicy.valid(longArrayOf(0), intArrayOf(64)))
    assertFalse(HapticsPolicy.valid(longArrayOf(1001), intArrayOf(64)))
    assertFalse(HapticsPolicy.valid(LongArray(33) { 12 }, IntArray(33) { 64 }))
    assertFalse(HapticsPolicy.valid(LongArray(6) { 1000 }, IntArray(6) { 64 }))
    assertFalse(HapticsPolicy.valid(longArrayOf(12), intArrayOf(0)))
    assertFalse(HapticsPolicy.valid(longArrayOf(12), intArrayOf(256)))
    assertFalse(HapticsPolicy.valid(longArrayOf(12), intArrayOf(-1)))
  }
}
