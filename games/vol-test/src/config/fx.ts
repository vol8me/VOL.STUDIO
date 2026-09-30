/** Sunum efektlerinin ayarları; renkler `palette.ts`ten gelir. */
export const FX = {
  tracerLength: 16,
  /** Egzoz ve tozun gövde merkezinin arkasındaki kaynağı (birim). */
  exhaustOffset: 22,
  /** Bu hızın üstünde paletler toz kaldırır (birim/s). */
  dustSpeed: 90,
  marks: {
    capacity: 360,
    lifeMs: 9000,
    /** İki iz arası yer yolu (birim). */
    spacing: 9,
    alpha: 0.26,
  },
  /** Kayma izi: kayan paletin temas noktasının yerde bıraktığı sürekli çizgi. */
  skid: {
    capacity: 900,
    /** Bu kayma hızının altında palet tutunur, çizgi kesilir (birim/s). */
    minSlide: 35,
    /** Çizginin tam koyuluğa çıktığı kayma hızı. */
    fullSlide: 90,
    minStrength: 0.35,
    /**
     * Parça boyu, uç örtüşmesi ve çizgi eni (birim). Örtüşme 0'dır: yarı saydam
     * parçalar üst üste binince eklerde koyu bant (merdiven) oluşur.
     */
    segment: 6,
    overlap: 0,
    width: 9,
    alpha: 0.5,
    /** İz 20 s yerde kalır; ömrün ilk yarısı tam, sonra söner. */
    lifeMs: 20000,
    holdShare: 0.5,
    /** Palet izinin altında, zeminin üstünde. */
    depth: 1.9,
  },
  wallFlash: { span: 260, width: 7, durationMs: 260 },
} as const;
