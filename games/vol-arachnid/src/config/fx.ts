import { VOL_COLORS } from '@volstudio/core';

const hex = (value: string): number => Number.parseInt(value.slice(1), 16);

/** Çizim derinlikleri — arena zemini −100'de, rig 0'da. */
export const FX_DEPTH = {
  shadow: -20,
  ghost: -10,
  dust: -5,
} as const;

export const fxConfig = {
  /**
   * Atılım izi. Kaynak ağacın pozu yakalandığı için iz gövdeyi VE uzuvları
   * taşır; tek bir siluet kopyası atılımın bacak salınımını gösteremezdi.
   */
  ghostTrail: {
    maxGhosts: 3,
    lifespanMs: 150,
    captureIntervalMs: 38,
    startAlpha: 0.36,
    endAlpha: 0,
    tint: hex(VOL_COLORS.brandHover),
    depth: FX_DEPTH.ghost,
  },

  /**
   * Rig şeklinde gölge. Gövdenin altına konan bir elips, uzuvlar açıldıkça
   * yalan söylerdi; gölge kaynağın pozundan üretilir.
   */
  shadow: {
    offsetX: 7,
    offsetY: 10,
    alpha: 0.24,
    tint: 0x000000,
    depth: FX_DEPTH.shadow,
  },

  /** Pençe temasında kalkan toz. */
  dust: {
    textureRadiusPx: 6,
    depth: FX_DEPTH.dust,
    tint: hex(VOL_COLORS.uiBorderStrong),
    countMin: 2,
    countMax: 4,
    speedMin: 12,
    speedMax: 46,
    lifespanMinMs: 180,
    lifespanMaxMs: 380,
    scaleStart: 0.5,
    scaleEnd: 0,
    alphaStart: 0.5,
    alphaEnd: 0,
    /** Bu hızın altında basan ayak toz kaldırmaz. */
    minSpeedPxPerSec: 45,
    /** Toz sayısının hızla tam ölçeğe ulaştığı eşik. */
    fullSpeedPxPerSec: 320,
    /**
     * Atılım inişinde her ayağa uygulanan "hız". Gövdenin o karedeki gerçek
     * hızı değildir: iniş bir ÇARPMADIR, tozu da tam ölçekte olmalıdır.
     */
    landingSpeedPxPerSec: 340,
    /** İnişin kısa, hafif yer sarsıntısı. */
    landingShakeMs: 110,
    landingShakeIntensity: 0.0035,
  },
} as const;
