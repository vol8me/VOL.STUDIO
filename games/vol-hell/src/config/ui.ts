/** Oyun içi UI parametreleri. */
export const uiConfig = {
  /** Düşük can eşiği (0-1 oranı). Bar bu değerin altında kırmızıya döner. */
  lowHealthThreshold: 0.25,
  /** HUD barları. */
  hud: {
    /** Can/dash barı genişliği (piksel). */
    barWidth: 200,
    /** Dash barının can barının altındaki dikey kayması (piksel). */
    dashBarTopOffset: 36,
    /** Spark (deneyim) barının can barının altındaki dikey kayması (piksel). */
    sparkBarTopOffset: 72,
    /** Dash bar animasyonu; 0 = anında güncelle (her frame rAF zinciri yaratmamak için). */
    dashBar: {
      /** 0 = animasyon yok. */
      animateMs: 0,
      /** Bu eşikten az değişirse bar güncellenmez. */
      updateThreshold: 0.005,
    },
    /**
     * Yeni dalga duyurusunun ekranda kalma süresi (ms).
     * Sayaç JS tarafında yürür (CSS animasyonu değil): oyun duraklayınca
     * duyuru da donmalı.
     */
    waveAnnounceMs: 1600,
  },
  /** Oyuncunun hareket/ateş niyetini düşük kontrastlı saha çizgileriyle anlatır. */
  playerFeedback: {
    direction: {
      /**
       * Saha okunun rengi.
       *
       * Diğer tüm oyun renkleri gibi BURADA yaşar: runtime dosyasına gömülü
       * bir hex, tema/palet turunda gözden kaçan tek yer olur.
       */
      color: 0xffc857,
      /** Oyuncudan okunabilir uzaklık (piksel). */
      radiusPx: 14,
      /** Ok ucunun oyuncudan uzaklığı (piksel). */
      lengthPx: 29,
      /** Hedef yöne görsel yaklaşma süresi (ms). */
      smoothingMs: 42,
      /** Görsel çizgi kalınlığı (piksel). */
      lineWidthPx: 1.75,
      /** Hareketsizken görünürlük. */
      alpha: 0.4,
      /** Hedef yöne göre önden çizilen başlık uzunluğu (piksel). */
      headPx: 5.5,
    },
    aim: {
      /** Ateş yönü çizgisinin rengi. */
      color: 0xffb347,
      /** Ateş çizgisinin başlangıç yarıçapı (piksel). */
      startRadiusPx: 10,
      /** Ateş çizgisinin uzunluğu (piksel). */
      lengthPx: 38,
      /** Atış yönü geri bildirim ömrü (ms). */
      lifespanMs: 140,
      /** Çizgi sönme süresi (ms). */
      fadeMs: 105,
      /** Görsel çizgi kalınlığı (piksel). */
      lineWidthPx: 1.75,
      /** Başlangıç görünürlüğü. */
      alpha: 0.46,
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
