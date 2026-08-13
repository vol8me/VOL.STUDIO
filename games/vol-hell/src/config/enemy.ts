/** Düşman parametreleri. Hızlar piksel/saniye cinsinden. */
export const enemyConfig = {
  /** Düşman canı. */
  health: 50,
  /** Düşman hareket hızı (piksel/saniye). Oyuncudan yavaş. */
  speed: 90,
  /** Düşman öldürülünce verilen temel skor. */
  scoreValue: 100,
  /** Düşman temas hasarı. */
  contactDamage: 12,
  /** Düşman temas hasarı tekrar süresi (ms) — aynı düşman arka arkaya hasar veremez. */
  contactDamageCooldownMs: 600,
  /** Düşman yarıçapı (piksel). */
  radius: 14,
  /** Spawn aralığı (ms). */
  spawnIntervalMs: 1400,
  /** Maksimum eşzamanlı düşman sayısı. */
  maxCount: 24,
  /**
   * İki düşmanın arasında istenen boşluk (piksel). Ayrılma mesafesi
   * `r1 + r2 + separationGap` olarak hesaplanır: katalogdaki her tür farklı
   * boyutta olduğu için sabit bir mesafe iri düşmanları iç içe geçirirdi.
   */
  separationGap: 2,
  /** Düşman ayrılma gücü (0-1, yüksek = daha güçlü itme). */
  separationForce: 0.5,
  /** Can barı genişliği = düşman yarıçapı x bu oran — iri düşman, iri bar. */
  healthBarWidthRatio: 2,
  /** Can barı dolu kısmının minimum genişliği (piksel) — sıfıra inip kaybolmasın. */
  healthBarMinWidth: 2,
  /** Düşman can barı yüksekliği (piksel). */
  healthBarHeight: 4,
  /** Can barının düşman kenarıyla arasındaki boşluk (piksel). */
  healthBarGap: 8,
  /** Düşman ölüm partikül sayısı. */
  deathParticleCount: 12,
  /** Düşman ölüm partikül yayılma hızı (piksel/saniye). */
  deathParticleSpeed: 120,
  /** Düşman ölüm partikül ömrü (ms). */
  deathParticleLifespanMs: 400,
  /** Düşman rengi (0xRRGGBB). */
  color: 0xcc3333,
  /** Düşman fill alpha (0-1). */
  fillAlpha: 1,
  /** Düşman stroke rengi (0xRRGGBB). */
  strokeColor: 0xff6666,
  /** Düşman stroke kalınlığı (piksel). */
  strokeWidth: 2,
  /** Düşman stroke alpha (0-1). */
  strokeAlpha: 0.6,
  /** Düşman can barı arka plan rengi (0xRRGGBB). */
  healthBarBgColor: 0x333333,
  /** Düşman can barı arka plan alpha (0-1). */
  healthBarBgAlpha: 0.8,
  /** Düşman can barı dolu kısım rengi (0xRRGGBB). */
  healthBarFillColor: 0xff4444,
  /** Düşman can barı dolu kısım alpha (0-1). */
  healthBarFillAlpha: 1,
  /** Düşman ölüm partikül rengi (0xRRGGBB). */
  deathParticleColor: 0xff4444,
  /** Düşman ölüm partikül boyutu (piksel). */
  deathParticleSize: 3,
  /** Düşman ölüm partikül alpha (0-1). */
  deathParticleAlpha: 0.9,
  /** Spawn başarısız olunca bekleme süresinin çarpanı (0-1). */
  spawnRetryIntervalFactor: 0.5,
  /** Spawn kenar sayısı (dikdörtgen = 4). */
  spawnEdgeCount: 4,
  /** Spawn pozisyonunun oyuncudan minimum uzaklığı (piksel). */
  spawnMinPlayerDistance: 120,
} as const;

export type EnemyConfig = typeof enemyConfig;
