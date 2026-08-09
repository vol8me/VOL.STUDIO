/** Mermi parametreleri. Hızlar piksel/saniye cinsinden. */
export const bulletConfig = {
  /** Mermi hızı (piksel/saniye). */
  speed: 520,
  /** Mermi yarıçapı (piksel). */
  radius: 4,
  /** Mermi hasarı. */
  damage: 25,
  /** Mermi ömrü (ms) — süre dolunca yok edilir. */
  lifetimeMs: 2000,
  /** Border duvarından sekme hız kaybı (0-1, 0=kayıp yok, 1=tam dur). */
  bounceDamping: 0.8,
  /** Ateşler arası bekleme süresi (ms) — tek tek ateş. */
  fireCooldownMs: 180,
  /** Mermi partikül trail yayılma açısı (radyan). */
  trailSpread: 0.3,
  /** Mermi partikül trail hızı (piksel/saniye). */
  trailSpeed: 40,
  /** Mermi partikül trail ömrü (ms). */
  trailLifespanMs: 180,
  /** Mermi partikül trail sıklığı (ms). */
  trailFrequencyMs: 16,
  /** Mermi partikül boyutu (piksel). */
  trailParticleSize: 3,
} as const;

export type BulletConfig = typeof bulletConfig;
