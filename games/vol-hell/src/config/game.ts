/** Genel oyun ayarları. `title` tek kaynak — index.html'deki `<title>` yalnızca ilk boyamadan önce statik yedek. */
export const gameConfig = {
  title: 'VOL.HELL',
  viewport: {
    strategy: 'resize',
    // `maxDpr` BURADA DEĞİL: kalite ayarı çalışma anında değişebildiği için
    // `bootstrap` DPR'ı `videoSettings.getMaxDpr()` sağlayıcısıyla veriyor.
    // Sabit bir kopya burada dursaydı hiç okunmayan, ama DPR'ın kaynağıymış
    // gibi görünen ikinci bir gerçek olurdu (bkz. config/video.ts).
  },
  /** Düşük FPS'te gerçek zamanı geri kazanmak için sabit simülasyon adımı. */
  fixedStepMs: 1000 / 60,
  /** Tek render frame'inde yapılabilecek sabit adım sayısı. */
  maxSimulationStepsPerFrame: 8,
  /** Timer'ların tek frame'de yetişebileceği üst sınır. */
  maxTimerCatchUpSteps: 8,
} as const;

export type GameConfig = typeof gameConfig;
