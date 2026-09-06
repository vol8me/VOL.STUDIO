/**
 * Hareket İVMELİDİR, anlık hız ataması değil: tuş bırakılınca gövde sürtünmeyle
 * yavaşlar, basılınca hıza rampayla çıkar. Kütle hissi buradan gelir.
 */
export const playerConfig = {
  maxSpeedPxPerSec: 210,
  /** Tam hıza ~0.38 sn'de ulaşılır. */
  accelerationPxPerSec2: 560,
  /** İvmeden YAVAŞ: gövde süzülerek durur. */
  brakePxPerSec2: 760,
  /** Yumuşak tutulur; sert bir yay büyük açı farkında ilk karelerde fırlar. */
  facingSpring: { stiffness: 44, damping: 10 },
  /** Yayın üstünde ayrı bir tavan: 180°'lik dönüş bunun altına inemez. */
  maxTurnRateRadPerSec: 2.7,

  /** Sert dönüşte hız kesilir; ağır gövde yönünü tam hızda değiştiremez. */
  turnRateForFullPenalty: 2.4,
  maxTurnSpeedPenalty: 0.42,

  /**
   * KONTROLSÜZ atılım: yön başta kilitlenir, bakış da o yöne sabitlenir.
   * Atılım sürerken dümen kırmak ağırlık hissini öldürüyor ve uzuvları
   * gövdenin gitmediği yöne bastırıyordu.
   */
  dash: {
    speedPxPerSec: 900,
    durationMs: 140,
    cooldownMs: 700,
  },

  /**
   * Bu hızın üstünde çarpan gövde SEKER; hız sıfırlanmaz, normalde tersine
   * çevrilip sönümlenir. Sıfırlamak sınırı yapışkan bir yüzeye çeviriyordu.
   *
   * Eşik `maxSpeedPxPerSec`in ÜSTÜNDE: yürüyerek dayanmak çarpma değildir.
   * Düşük eşikte duvara basılı tutulan tuş sürekli sekme üretiyordu.
   */
  wall: {
    impactSpeedPxPerSec: 300,
    restitution: 0.55,
    recoveryMs: 130,
  },
} as const;
