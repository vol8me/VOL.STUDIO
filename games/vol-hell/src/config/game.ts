/** Genel oyun ayarları. `title` tek kaynak — index.html'deki `<title>` yalnızca ilk boyamadan önce statik yedek. */
export const gameConfig = {
  title: 'VOL.HELL',
  viewport: {
    strategy: 'resize',
    /** Yüksek DPR ekranlarda GPU fill-rate'i sınırlar. */
    maxDpr: 1.5,
  },
  /** Bir frame'in hesaplayacağı maksimum delta; 30 FPS eşdeğeri. */
  maxDeltaMs: 1000 / 30,
  /** Ekran sarsıntısı parametreleri (ms, şiddet 0-1). */
  shake: {
    enemyDeath: { durationMs: 60, intensity: 0.006, cooldownMs: 180 },
    playerDamage: { durationMs: 100, intensity: 0.009, cooldownMs: 400 },
  },
  /** Partikül havuzu başlangıç kapasitesi — enemy ölüm, bullet trail/bounce için. */
  particlePoolSize: 256,
} as const;

export type GameConfig = typeof gameConfig;
