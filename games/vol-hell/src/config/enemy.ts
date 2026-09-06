/** Düşman parametreleri. */
export const enemyConfig = {
  /** Mermi hasarının tam katı — iki vuruşluk (bkz. `bulletConfig`). */
  healthPoints: 44,
  /** Oyuncudan YAVAŞ. */
  speedPxPerSec: 90,
  scoreValue: 100,
  contactDamage: 12,
  /** Aynı düşman arka arkaya hasar veremez. */
  contactDamageCooldownMs: 600,
  radiusPx: 14,
  spawnIntervalMs: 1400,
  maxCount: 24,
  /**
   * Ayrılma mesafesi `r1 + r2 + separationGapPx`: katalogdaki türler farklı
   * boyutta olduğu için sabit bir mesafe iri düşmanları iç içe geçirirdi.
   */
  separationGapPx: 2,
  separationForce: 0.5,
  /** Bar genişliği = yarıçap × bu oran; iri düşman iri bar. */
  healthBarWidthRatio: 2,
  /** Sıfıra inip kaybolmasın. */
  healthBarMinWidthPx: 2,
  healthBarHeightPx: 4,
  healthBarGapPx: 8,
  deathParticleCount: 12,
  deathParticleSpeedPxPerSec: 120,
  deathParticleLifespanMs: 400,
  color: 0xcc3333,
  fillAlpha: 1,
  strokeColor: 0xff6666,
  strokeWidthPx: 2,
  strokeAlpha: 0.6,
  healthBarBgColor: 0x333333,
  healthBarBgAlpha: 0.8,
  healthBarFillColor: 0xff4444,
  healthBarFillAlpha: 1,
  deathParticleColor: 0xff4444,
  deathParticleSizePx: 3,
  deathParticleAlpha: 0.9,
  spawnRetryIntervalFactor: 0.5,
  /** Dikdörtgen arena = 4. */
  spawnEdgeCount: 4,
  spawnMinPlayerDistancePx: 120,
} as const;
