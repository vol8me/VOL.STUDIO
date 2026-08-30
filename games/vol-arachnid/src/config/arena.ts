import { VOL_COLORS } from '@volstudio/core';

/** Arena kamera içine bütünüyle sığdırılır; sınır çizgisi her zaman görünür kalır. */
export const arenaConfig = {
  widthPx: 1600,
  heightPx: 1100,
  /** Örümceğin gövde merkezinin duvara yaklaşabileceği en küçük mesafe. */
  bodyRadiusPx: 180,
  borderColor: 0x3a4b5c,
  borderWidthPx: 3,
  gridColor: 0x1a2129,
  gridStepPx: 100,
  backgroundColor: VOL_COLORS.uiBg,
} as const;
