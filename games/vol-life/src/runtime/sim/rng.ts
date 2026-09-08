/**
 * Durumu OKUNABİLİR deterministik rastgelelik.
 *
 * CORE'un `createRandom`ı durumu closure'da tutar ve yalnız `next`/`bipolar`
 * açar. Bu simülasyonda rastgelelik dünyanın kaydedilebilir durumunun bir
 * parçasıdır: bir anlık görüntüden devam eden koşu, kaydın alındığı andaki
 * diziyi birebir sürdürmek zorundadır. Okunamayan bir durum bunu imkânsız
 * kılar — bu yüzden aynı mulberry32 dizisi burada durumu açan bir yüzeyle
 * yeniden veriliyor.
 */
export interface SimRandom {
  /** [0, 1) aralığında sonraki değer. */
  next(): number;
  /** [-1, 1) aralığında sonraki değer. */
  bipolar(): number;
  /** Anlık durum — kayıt/geri yükleme için. */
  getState(): number;
  /** Durumu geri yükler; sonraki değerler kayıt anındakiyle aynı olur. */
  setState(state: number): void;
}

/** Seed 0 mulberry32'yi dejenere bir diziye sokar; sıfır olmayan bir değere taşınır. */
const FALLBACK_STATE = 0x5eed;

export function createSimRandom(seed: number): SimRandom {
  let state = (seed | 0) === 0 ? FALLBACK_STATE : seed | 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    bipolar: () => next() * 2 - 1,
    getState: () => state,
    setState: (value: number) => {
      state = (value | 0) === 0 ? FALLBACK_STATE : value | 0;
    },
  };
}
