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
  /** Hasar alınca invulnerability süresi (ms) — şu an kullanılmıyor, dash i-frame ayrı yönetilir. */
  invulnerabilityMs: 500,
  /** Dash ghost sayısı — dash süresince bırakılan yarı saydam kopya. */
  dashGhostCount: 6,
  /** Dash ghost ömrü (ms). */
  dashGhostLifespanMs: 350,
  /** Dash ghost alpha başlangıç (0-1). */
  dashGhostAlpha: 0.4,
} as const;

export type PlayerConfig = typeof playerConfig;
