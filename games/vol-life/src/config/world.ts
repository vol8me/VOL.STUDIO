/**
 * Dünyanın ölçüleri. Bir dengeleme değişikliği çalışma zamanı dosyasına
 * dokunmamalıdır (AGENTS Kural 5).
 */
export interface WorldConfig {
  /** Toroidal dünyanın kenar uzunluğu, dünya birimi. */
  readonly sizeUnits: number;
  /** Sabit simülasyon adımı. */
  readonly fixedStepMs: number;
  /**
   * Bir render karesinde koşulabilecek azami sabit adım.
   *
   * Yüksek bir tavan ÖLÜM SARMALI üretir: kare bütçesi aşıldığında saat daha
   * çok telafi adımı ister, o adımlar kareyi daha da uzatır ve sistem geri
   * dönemez. Tavan düşük tutulur; simülasyon geri kalırsa yavaşlar, kilitlenmez.
   */
  readonly maxStepsPerFrame: number;
  /** Dünyanın tohumu — aynı seed aynı dünyayı verir. */
  readonly seed: number;
}

export const worldConfig: WorldConfig = {
  sizeUnits: 1024,
  fixedStepMs: 1000 / 60,
  maxStepsPerFrame: 2,
  seed: 0x10fe1,
};
