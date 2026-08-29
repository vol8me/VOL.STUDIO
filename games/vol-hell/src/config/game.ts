/** Genel oyun ayarları. `title` tek kaynak — index.html'deki `<title>` yalnızca ilk boyamadan önce statik yedek. */
export const gameConfig = {
  title: 'VOL.HELL',
  viewport: {
    strategy: 'resize',
    /** Yüksek DPR ekranlarda GPU fill-rate'i sınırlar. */
    maxDpr: 1.5,
  },
  /** Düşük FPS'te gerçek zamanı geri kazanmak için sabit simülasyon adımı. */
  fixedStepMs: 1000 / 60,
  /** Tek render frame'inde yapılabilecek sabit adım sayısı. */
  maxSimulationStepsPerFrame: 8,
  /** Timer'ların tek frame'de yetişebileceği üst sınır. */
  maxTimerCatchUpSteps: 8,
} as const;

export type GameConfig = typeof gameConfig;
