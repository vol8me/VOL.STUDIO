package com.volstudio.orientation

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OrientationPolicyTest {
  @Test
  fun `telefonun tek penceresinde yön isteği desteklenir`() {
    assertTrue(OrientationPolicy.isSupported(television = false, multiWindow = false))
  }

  @Test
  fun `televizyonda yön isteği desteklenmez`() {
    assertFalse(OrientationPolicy.isSupported(television = true, multiWindow = false))
  }

  @Test
  fun `çoklu pencerede yön isteği desteklenmez`() {
    assertFalse(OrientationPolicy.isSupported(television = false, multiWindow = true))
  }
}
