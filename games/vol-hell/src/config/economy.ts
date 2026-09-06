/**
 * Ekonomi parametreleri.
 *
 * İki para birimi vardır ve KAZANIM BİÇİMLERİ bilinçli olarak farklıdır:
 * - **Flux** (kalıcı): düşman ölünce yere PICKUP olarak düşer, oyuncunun gidip
 *   toplaması gerekir. Riski ödüle çeviren şey budur.
 * - **Spark** (koşu içi): düşman öldüğü anda doğrudan sayaca eklenir; yerde
 *   bir nesne oluşmaz, zamanla pasif kazanç da yoktur.
 */
export const economyConfig = {
  flux: {
    radiusPx: 5,
    color: 0x66ffcc,
    strokeColor: 0xaaffee,
    strokeWidthPx: 1,
    /** Oyuncu bu mesafeye girince pickup ona doğru çekilir. */
    magnetRadiusPx: 90,
    magnetSpeedPxPerSec: 340,
    /** Oyuncu hitbox'ına EK mesafe. */
    collectDistancePx: 6,
    scatterRadiusPx: 14,
    maxDropsPerDeath: 4,
    /** Tavana ulaşıldığında yeni miktar en eskisine EKLENİR; Flux kaybolmaz. */
    maxActive: 120,
    drop: {
      /** Bu süre boyunca toplanmaz ve mıknatıs çalışmaz. */
      durationMs: 280,
      arcHeightPx: 14,
      /** Fırlama anındaki büyüme; yere inerken 1'e döner. */
      popScale: 1.6,
    },
    bob: {
      enabled: true,
      amplitudePx: 2.5,
      periodMs: 1600,
    },
  },
  /** Her reroll pahalanır; kilitlemek reroll kullanımını ödüllendirir. */
  reroll: {
    baseCost: 5,
    costStep: 3,
  },
  spark: {
    startLevel: 1,
    /** İlk dalga İKİ seviye verecek biçimde ölçüldü; sonrakiler giderek azalır. */
    baseThreshold: 30,
    thresholdGrowth: 1.28,
  },
} as const;
