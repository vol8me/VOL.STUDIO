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
} as const;

export type GameConfig = typeof gameConfig;
