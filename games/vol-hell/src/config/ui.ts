/** Oyun içi UI parametreleri. */
export const uiConfig = {
  /** HUD kenar boşluğu (piksel). */
  hudPadding: 16,
  /** Oyun içi toast görünürlük süresi (ms). */
  toastDurationMs: 3000,
  /** Düşük can eşiği (0-1 oranı). Bar bu değerin altında kırmızıya döner. */
  lowHealthThreshold: 0.25,
  /** HUD barları. */
  hud: {
    /** Can/dash barı genişliği (piksel). */
    barWidth: 200,
    /** Dash barının can barının altındaki dikey kayması (piksel). */
    dashBarTopOffset: 36,
    /** Dash bar animasyonu; 0 = anında güncelle (her frame rAF zinciri yaratmamak için). */
    dashBar: {
      /** 0 = animasyon yok. */
      animateMs: 0,
      /** Bu eşikten az değişirse bar güncellenmez. */
      updateThreshold: 0.005,
    },
  },
  /** Loading ekranı geçiş parametreleri. */
  loading: {
    /** Toplam gösterim süresi (ms). */
    durationMs: 1200,
    /** İndikatör boyutu (piksel). */
    indicatorSize: 140,
    /** Başlık font boyutu (piksel). */
    titleFontSize: 28,
    /** İlerleme animasyon süresi; 0 = rAF yok, anında günceller. */
    progressMs: 0,
    /** İlerleme simülasyonu intervali (ms). */
    progressIntervalMs: 200,
    /** Her intervalde artan minimum yüzde puanı. */
    progressStepMin: 10,
    /** Her intervalde artan maksimum yüzde puanı. */
    progressStepMax: 30,
    /** Yüzde sınırı — bu değere ulaşıncaya kadar artar. */
    progressCap: 90,
  },
} as const;

export type UiConfig = typeof uiConfig;
