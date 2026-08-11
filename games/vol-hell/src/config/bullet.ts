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
  /**
   * Sekme sonrasi KORUNAN hiz orani (0-1). Hiz bu degerle carpilir:
   * 1 = kayip yok, 0 = tam dur. 0.8 -> her sekmede %20 hiz kaybi.
   */
  bounceDamping: 0.8,
  /** Ateşler arası bekleme süresi (ms) — tek tek ateş. */
  fireCooldownMs: 180,
  /** Mermi partikül trail yayılma açısı (radyan). */
  trailSpread: 0.3,
  /** Mermi partikül trail hızı (piksel/saniye). */
  trailSpeed: 40,
  /** Mermi partikül trail ömrü (ms). */
  trailLifespanMs: 120,
  /** Mermi partikül trail sıklığı (ms) — 40 FPS'de bir partikül. */
  trailFrequencyMs: 1000 / 40,
  /** Mermi partikül trail boyutu (piksel). */
  trailParticleSize: 3,
  /** Mermi fill rengi (0xRRGGBB). */
  color: 0xffee66,
  /** Mermi stroke rengi (0xRRGGBB). */
  strokeColor: 0xffaa00,
  /** Mermi stroke kalınlığı (piksel). */
  strokeWidth: 1,
  /** Mermi stroke alpha (0-1). */
  strokeAlpha: 0.8,
  /** Mermi fill alpha (0-1). */
  fillAlpha: 1,
  /** Mermi trail alpha (0-1). */
  trailAlpha: 0.6,
  /** Sekme sesi için minimum bekleme süresi (ms) — spam önler. */
  bounceSoundCooldownMs: 60,
  /** Sekme anında patlayan partikül renkleri (0xRRGGBB array). */
  bounceColors: [0xffee66, 0xffaa00],
  /** Sekme anında patlayan partikül sayısı. */
  bounceParticleCount: 4,
  /** Sekme anında patlayan partikül boyutu (piksel). */
  bounceParticleSize: 2,
  /** Sekme partikül minimum hızı (piksel/saniye). */
  bounceParticleSpeedMin: 20,
  /** Sekme partikül maksimum hızı (piksel/saniye). */
  bounceParticleSpeedMax: 40,
  /** Sekme partikül ömrü (ms). */
  bounceParticleLifespanMs: 200,
  /** Sekme partikül alpha (0-1). */
  bounceParticleAlpha: 0.8,
} as const;

export type BulletConfig = typeof bulletConfig;
