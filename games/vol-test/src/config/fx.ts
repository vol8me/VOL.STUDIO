/** Sunum efektlerinin ayarları; renkler `palette.ts`ten gelir. */
export const FX = {
  /** Mermi: parlak gövde, incelen iz ve havada kısa kalan duman izi. */
  shell: {
    headLength: 7,
    headWidth: 3.2,
    tracerLength: 34,
    /** Duman izi bu uzaklıkta bir kabarcık bırakır (birim). */
    trailSpacing: 30,
  },
  /** Egzoz ve tozun gövde merkezinin arkasındaki kaynağı (birim). */
  exhaustOffset: 22,
  /** Bu hızın üstünde paletler toz kaldırır (birim/s). */
  dustSpeed: 90,
  /**
   * Palet izi: paletin temas yolunu izleyen sürekli bant; her parça bir pabuç
   * adımıdır ve enine pabuç (grouser) izini taşır.
   */
  marks: {
    capacity: 1400,
    /** Pabuç adımı: iki parça arası yer yolu (birim). */
    spacing: 6,
    /** Bant eni: palet eni (birim). */
    width: 11,
    alpha: 0.34,
    lifeMs: 16000,
    holdShare: 0.4,
    depth: 2,
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
  /** Namlu patlaması: namlu freni yan jetleri, ileri ateş topu, yerde toz halkası. */
  muzzle: {
    /** Halka dokusu 64 birimdir; ölçek 1 = 32 birim yarıçap. */
    ring: { scale: 0.8, durationMs: 150, alpha: 0.5 },
    sideJets: 3,
    forwardSparks: 6,
    groundDust: 4,
  },
  /** Patlama: parlama, şok halkası, kum parçaları, toz, duman ve yanık izi. */
  blast: {
    flash: { scale: 1.6, durationMs: 170 },
    ring: { scale: 2, durationMs: 260, alpha: 0.55 },
    debris: 12,
    dust: 5,
    smoke: 3,
    sparks: 10,
    scorch: {
      capacity: 120,
      size: 46,
      alpha: 0.55,
      lifeMs: 20000,
      holdShare: 0.5,
      depth: 1.8,
    },
  },
  /** Mermi araca isabet etti: yanık bırakmayan küçük patlama. */
  hit: { sparks: 16, smoke: 5, flashScale: 1.1 },
  wallFlash: { span: 260, width: 7, durationMs: 260 },
} as const;
