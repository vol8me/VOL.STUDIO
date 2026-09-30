/** Oyun geneli ayarlar. */
export const GAME = {
  title: 'VOL.TEST',
  /** Simülasyonun sabit adımı; ekran hızından bağımsızdır. */
  simulationStepMs: 1000 / 60,
  /** Tek karede yetişilecek en çok adım; fazlası atılır (sekme dönüşü). */
  maxStepsPerFrame: 5,
  /** Yüksek DPR'de doldurma oranını sınırlar. */
  maxDpr: 2,
} as const;
