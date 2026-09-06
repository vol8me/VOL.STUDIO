/** Mermi parametreleri. */
export const bulletConfig = {
  speedPxPerSec: 520,
  radiusPx: 4,
  damage: 22,
  lifetimeMs: 2000,
  /** Sekmede korunan hız oranı: 1 = kayıpsız, 0.8 = her sekmede %20 kayıp. */
  bounceDamping: 0.8,
  /**
   * Taban tempo bilerek YAVAŞ: kartlar ateş hızını %40'a kadar artırıyor.
   * Taban hızlı olsaydı kart katkısı hissedilmez, geç oyunda mermi seli olurdu.
   */
  fireCooldownMs: 260,
  /** Alt sınır: üst üste binen kartlar cooldown'u sıfırlarsa üretim FPS'e bağlanır. */
  minFireCooldownMs: 90,
  trailSpeedPxPerSec: 40,
  trailLifespanMs: 120,
  trailFrequencyMs: 1000 / 40,
  trailParticleSizePx: 3,
  color: 0xffee66,
  strokeColor: 0xffaa00,
  strokeWidthPx: 1,
  strokeAlpha: 0.8,
  fillAlpha: 1,
  trailAlpha: 0.6,
  /** Spam önler: hızlı ardışık sekmeler tek ses üretir. */
  bounceSoundCooldownMs: 60,
  bounceColors: [0xffee66, 0xffaa00],
  bounceParticleCount: 4,
  bounceParticleSizePx: 2,
  bounceParticleSpeedMinPxPerSec: 20,
  bounceParticleSpeedMaxPxPerSec: 40,
  bounceParticleLifespanMs: 200,
  bounceParticleAlpha: 0.8,
} as const;
