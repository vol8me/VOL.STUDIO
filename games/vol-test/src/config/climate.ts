/**
 * Sunucu iklimi (hava saati, zemin, yeşillik) ağ ve kayıt aralıkları. Hava belirli olduğundan istemciler
 * arada yerelde aynı takvimde akar; yayın yalnız uyumlar.
 */
export const CLIMATE_NET = {
  /** Anlık görüntü yayını ve diske kayıt aralıkları (ms). */
  syncMs: 15_000,
  saveMs: 30_000,
  /** Bir istemcinin iklim isteklerine en sık yanıt aralığı: istek seli 60 KB'lık yükü çoğaltmasın. */
  requestGapMs: 5000,
  /**
   * Sonraki anlık görüntüler zemini bu sürede (ms) yumuşakça uyumlar: hücreler sert yazılsaydı su birikintisi
   * ve yeşillik her yayında sıçrardı. Yayın aralığından kısa tutulur ki bir uyum bitmeden öbürü başlamasın.
   */
  blendMs: 6000,
  /** Sunucu saati yerel saatten bu kadar (ms) ayrıksa yerel takvim bırakılıp sunucununki alınır. */
  clockToleranceMs: 2500,
} as const;
