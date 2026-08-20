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
    /** Pickup yarıçapı (piksel). */
    radius: 5,
    /** Pickup rengi (0xRRGGBB). */
    color: 0x66ffcc,
    /** Pickup kenar rengi (0xRRGGBB). */
    strokeColor: 0xaaffee,
    /** Pickup kenar kalınlığı (piksel). */
    strokeWidth: 1,
    /** Oyuncu bu mesafeye girince pickup ona doğru çekilmeye başlar (piksel). */
    magnetRadius: 90,
    /** Çekim hızı (piksel/saniye) — mıknatıs menzilinde. */
    magnetSpeed: 340,
    /** Toplama mesafesi (piksel, oyuncu hitbox'ına ek). */
    collectDistance: 6,
    /** Düşme anındaki saçılma yarıçapı (piksel). */
    scatterRadius: 14,
    /** Aynı ölümden düşebilecek maksimum pickup sayısı — sahne dolmasın. */
    maxDropsPerDeath: 4,
    /**
     * Sahnede aynı anda durabilecek maksimum pickup sayısı. Flux'un ömrü
     * YOKTUR (toplanana kadar durur), bu yüzden tavana ulaşıldığında yeni
     * düşen miktar en eski parçanın üzerine eklenir — hiçbir Flux kaybolmaz.
     */
    maxActive: 120,
    /** Ölüm noktasından yere düşme animasyonu. */
    drop: {
      /** Düşüşün süresi (ms). Bu süre boyunca toplanmaz ve mıknatıs çalışmaz. */
      durationMs: 280,
      /** Düşerken çizilen yayın yüksekliği (piksel). */
      arcHeight: 14,
      /** Fırlama anındaki büyüme çarpanı — yere inerken 1'e döner. */
      popScale: 1.6,
    },
    /** Yere indikten sonra hafif süzülme (nefes alma) hareketi. */
    bob: {
      /** Kapatılabilir: false ise parça yerinde sabit durur. */
      enabled: true,
      /** Salınım genliği (piksel). */
      amplitudePx: 2.5,
      /** Bir tam salınımın süresi (ms). */
      periodMs: 1600,
    },
  },
  /** Dükkan reroll maliyeti. Her reroll maliyet artar; yanlış teklifi
   * kilitlemek reroll kullanımını ödüllendirir. */
  reroll: {
    baseCost: 5,
    costStep: 3,
  },
  spark: {
    /** Koşu başlangıcındaki seviye. */
    startLevel: 1,
    /**
     * İlk seviye atlaması için gereken Spark.
     *
     * Ölçek bir dalgadan toplanan Spark'a göre kurulur: 40 saniyelik ilk
     * dalgada ~25 grunt (3 Spark) ≈ 75 Spark toplanır. 30 + 38 = 68 eşiğiyle
     * ilk dalga İKİ seviye verir; sonraki dalgalar aynı öldürme sayısıyla
     * giderek daha az seviye verir, ileride bir dalga hiç seviye atlatmadan
     * bitebilir.
     */
    baseThreshold: 30,
    /** Her seviyede eşiğin büyüme çarpanı. */
    thresholdGrowth: 1.28,
  },
} as const;

export type EconomyConfig = typeof economyConfig;
