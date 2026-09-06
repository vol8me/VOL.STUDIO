/** Oyun içi UI parametreleri. Mesafeler piksel, süreler ms. */
export const uiConfig = {
  /** Bar bu oranın altında kırmızıya döner. */
  lowHealthThreshold: 0.25,
  hud: {
    barWidth: 200,
    dashBarTopOffset: 36,
    sparkBarTopOffset: 72,
    dashBar: {
      /** 0 = animasyon yok; her frame rAF zinciri kurmamak için. */
      animateMs: 0,
      /** Bu eşikten az değişirse bar güncellenmez. */
      updateThreshold: 0.005,
    },
    /** Sayaç JS'te yürür, CSS'te değil: oyun duraklayınca duyuru da donar. */
    waveAnnounceMs: 1600,
  },
  /** Hareket/ateş niyetini düşük kontrastlı saha çizgileriyle anlatır. */
  playerFeedback: {
    direction: {
      /** Renkler BURADA yaşar; runtime'a gömülen hex palet turunda gözden kaçar. */
      color: 0xffc857,
      radiusPx: 14,
      lengthPx: 29,
      smoothingMs: 42,
      lineWidthPx: 1.75,
      /** Hareketsizken görünürlük. */
      alpha: 0.4,
      headPx: 5.5,
    },
    aim: {
      color: 0xffb347,
      startRadiusPx: 10,
      lengthPx: 38,
      lifespanMs: 140,
      fadeMs: 105,
      lineWidthPx: 1.75,
      alpha: 0.46,
    },
  },
  loading: {
    durationMs: 1200,
    indicatorSizePx: 140,
    titleFontSizePx: 28,
    /** 0 = rAF yok, anında günceller. */
    progressMs: 0,
    progressIntervalMs: 200,
    /** Her intervalde artan yüzde puanı aralığı. */
    progressStepMin: 10,
    progressStepMax: 30,
    /** Yüzde tavanı; gerçek yükleme bitene kadar buraya kadar artar. */
    progressCap: 90,
  },
} as const;
