/** Oyuncu parametreleri. Hızlar piksel/saniye cinsinden. */
export const playerConfig = {
  /** Normal hareket hızı (piksel/saniye). */
  moveSpeed: 220,
  /** Maksimum can. */
  maxHealth: 100,
  /** Çarpışma yarıçapı (piksel) — bullet-hell'de küçük hitbox klasiktir. */
  hitboxRadius: 8,
  /** Dash hızı (piksel/saniye). */
  dashSpeed: 520,
  /** Dash süresi (ms). */
  dashDurationMs: 300,
  /** Dash cooldown süresi (ms) — dash sonrası bu süre dolmadan tekrar dash atılamaz. */
  dashChargeMs: 1500,
  /** Dash i-frame süresi (ms) — dash süresince hasar almaz. */
  dashIFrameMs: 350,
  /** Dash ghost sayısı — dash süresince bırakılan yarı saydam kopya. */
  dashGhostCount: 6,
  /** Dash ghost ömrü (ms). */
  dashGhostLifespanMs: 350,
  /** Dash ghost başlangıç alpha (0-1). */
  dashGhostAlpha: 0.4,
  /** Dash ghost stroke alpha çarpanı (0-1). */
  dashGhostStrokeAlphaFactor: 0.5,
  /** Dash ghost son scale değeri. */
  dashGhostScaleEnd: 0.5,
  /** Dash ghost çizgi kalınlığı (piksel). */
  dashGhostStrokeWidth: 2,
  /** Normal durumda oyuncu rengi (0xRRGGBB). */
  color: 0x4488ff,
  /** Dash sırasında oyuncu rengi (0xRRGGBB). */
  dashColor: 0x88ccff,
  /** Hasar alınca yanıp sönen renk (0xRRGGBB). */
  hitColor: 0xff4444,
  /** Dash ghost stroke rengi (0xRRGGBB). */
  ghostStrokeColor: 0xaaddff,
  /** Oyuncu fill alpha (0-1). */
  fillAlpha: 1,
  /** Dash sırasında fill alpha (0-1). */
  dashAlpha: 0.7,
  /** Hareket yönü dead-zone eşiği (0-1). Bu değerin altındaki hareket yönü yok sayılır. */
  moveDirectionThreshold: 0.01,
  /** Hasar alınca yanıp sönme süresi (ms). */
  hitFlashDurationMs: 150,
  /** Invulnerability yanıp sönme aralığı (ms). */
  invulnerabilityFlashIntervalMs: 80,
} as const;

export type PlayerConfig = typeof playerConfig;
