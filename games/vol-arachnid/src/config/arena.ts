/** Arena kamera içine bütünüyle sığdırılır; sınır çizgisi her zaman görünür kalır. */
export const arenaConfig = {
  widthPx: 1600,
  heightPx: 1100,
  /**
   * Gövde MERKEZİNİN duvara yaklaşabileceği en küçük mesafe.
   *
   * Bir dönem 180px'ti: uzuvların tamamı sınırın içinde kalsın diye gövde
   * duvardan bir gövde boyu uzakta tutuluyordu ve sınır, oyun alanını
   * daraltan görünmez ikinci bir duvar gibi davranıyordu. Ölçü artık gövde
   * kabuğunun yarıçapıdır; uzuvlar sınırın üstüne taşabilir — bir örümcek
   * zaten duvara basar.
   */
  bodyRadiusPx: 84,
  borderColor: 0x3a4b5c,
  borderWidthPx: 3,
  gridColor: 0x1a2129,
  gridStepPx: 100,

  /**
   * Kamera, arenayı bu kenar boşluklarının İÇİNE sığdırır (CSS px).
   *
   * HUD arenanın üstüne binmemelidir; bunu "HUD'u köşeye koy" diye ummak
   * yerine kamera boşluğu ayırır. Ayrılan boşluk her zaman en az bu kadardır
   * (sığdırma tek eksenden sınırlandığı için diğer eksende daha da büyür),
   * yani HUD sabit bir yerleşimle güvenle oraya oturur.
   */
  viewportGutterPx: { left: 76, right: 28, top: 48, bottom: 60 },
  /** Sığdırmadan sonra bırakılan ek nefes payı. */
  fitMargin: 0.97,

  /** Duvar çarpmasının görsel yankısı. */
  impact: {
    color: 0xd67434,
    /** Çarpma noktası çevresinde parlayan sınır uzunluğu (dünya px). */
    spanPx: 260,
    widthPx: 7,
    durationMs: 260,
    /** Kamera sarsıntısı — çarpma şiddetiyle ölçeklenir. */
    shakeDurationMs: 130,
    shakeIntensity: 0.006,
  },
} as const;
