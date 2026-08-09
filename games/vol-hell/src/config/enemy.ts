/** Düşman parametreleri. Hızlar piksel/saniye cinsinden. */
export const enemyConfig = {
  /** Düşman canı. */
  health: 50,
  /** Düşman hareket hızı (piksel/saniye). Oyuncudan yavaş. */
  speed: 90,
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
  /** Düşmanlar arası minimum mesafe (piksel) — overlap engeli. */
  separationRadius: 30,
  /** Düşman ayrılma gücü (0-1, yüksek = daha güçlü itme). */
  separationForce: 0.5,
  /** Düşman can barı genişliği (piksel). */
  healthBarWidth: 28,
  /** Düşman can barı yüksekliği (piksel). */
  healthBarHeight: 4,
  /** Düşman can barı offset (piksel, düşman merkezinden yukarı). */
  healthBarOffset: 22,
  /** Düşman ölüm partikül sayısı. */
  deathParticleCount: 12,
  /** Düşman ölüm partikül yayılma hızı (piksel/saniye). */
  deathParticleSpeed: 120,
  /** Düşman ölüm partikül ömrü (ms). */
  deathParticleLifespanMs: 400,
} as const;

export type EnemyConfig = typeof enemyConfig;
