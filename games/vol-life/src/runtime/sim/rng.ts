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

/**
 * Her 32-bit tohum ayrı bir dizidir, 0 dahil; sözleşme CORE `createRandom` ile
 * aynıdır ve parite testiyle kilitlidir. Tohum ve geri yüklenen durum 32 bite
 * indirgenir.
 *
 * @throws {RangeError} Tohum ya da geri yüklenen durum sonlu bir sayı değilse;
 *   bozuk bir anlık görüntü sessizce başka bir diziye devam etmez.
 */
export function createSimRandom(seed: number): SimRandom {
  let state = toState(seed, 'tohum');

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
      state = toState(value, 'durum');
    },
  };
}

function toState(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(
      `createSimRandom: ${label} sonlu bir sayı olmalı, gelen: ${String(value)}`,
    );
  }
  return value | 0;
}
