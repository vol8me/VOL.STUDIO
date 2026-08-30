/**
 * Hareket, anlık hız ataması değil İVMELİ bir modeldir: yön tuşu bırakıldığında
 * gövde sürtünmeyle yavaşlar, tuşa basıldığında hıza rampayla çıkar. Kütlesi
 * olan bir yaratık hissi buradan gelir.
 */
export const playerConfig = {
  /** Sürekli yürüyüş hızı (px/s). */
  maxSpeed: 260,
  /** Hıza çıkış ivmesi (px/s²). */
  accelerationPxPerSec2: 1500,
  /** Girdi yokken yavaşlama (px/s²). */
  brakePxPerSec2: 2200,
  /** Gövdenin görsel yöne dönüş yayı — yumuşak ama gecikmesiz. */
  facingSpring: { stiffness: 150, damping: 17 },

  /** Dash: kısa süreli, kontrolsüz bir atılım. */
  dash: {
    speedPxPerSec: 900,
    durationMs: 170,
    cooldownMs: 620,
  },
} as const;
