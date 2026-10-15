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
} as const;
