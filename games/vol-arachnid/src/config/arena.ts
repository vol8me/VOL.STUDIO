/** Arena kameraya bütünüyle sığdırılır; sınır çizgisi her zaman görünür kalır. */
export const arenaConfig = {
  widthPx: 1600,
  heightPx: 1100,
  /**
   * Gövde MERKEZİNİN duvara yaklaşabileceği en küçük mesafe: gövde KABUĞUNUN
   * yarıçapı, uzuv açıklığı değil. Uzuvlar sınırın üstüne taşabilir — bir
   * örümcek zaten duvara basar. Uzuvları da içeride tutmak, sınırı oyun
   * alanını daraltan görünmez ikinci bir duvara çevirirdi.
   */
  bodyRadiusPx: 84,
  borderColor: 0x3a4b5c,
  borderWidthPx: 3,
  gridColor: 0x1a2129,
  gridStepPx: 100,

  /**
   * Kamera arenayı bu boşlukların İÇİNE sığdırır (CSS px). HUD'un arenaya
   * binmemesini ummak yerine kamera yer ayırır; ayrılan boşluk her zaman en az
   * bu kadardır, yani HUD sabit yerleşimle güvenle oturur.
   */
  viewportGutterPx: { left: 76, right: 28, top: 48, bottom: 60 },
  fitMargin: 0.97,

  /**
   * Arenanın tamamını göstermek masaüstünde taktik bir bakış verir; telefonda
   * aynı oran fiziksel olarak ~1,5 cm'ye düşer ve uzuvlar okunmaz. Bu yüzden
   * dokunmatikte kamera sığdırmayı bırakıp sabit ölçekte gövdeyi TAKİP eder.
   */
  touchWorldScale: 0.62,
  /** Çok küçültülmüş pencerede sığdırma buranın altına düşerse takibe geçilir. */
  minWorldScale: 0.34,
  followSmoothingMs: 90,

  /** Duvar çarpmasının görsel yankısı. */
  impact: {
    color: 0xd67434,
    spanPx: 260,
    widthPx: 7,
    durationMs: 260,
    /** Çarpma şiddetiyle ölçeklenir. */
    shakeDurationMs: 130,
    shakeIntensity: 0.006,
  },
} as const;
