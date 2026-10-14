/** Oyun geneli ayarlar. */
export const GAME = {
  title: 'VOL.TEST',
  /** Simülasyonun sabit adımı; ekran hızından bağımsızdır. */
  simulationStepMs: 1000 / 60,
  /** Tek karede yetişilecek en çok adım; fazlası atılır (sekme dönüşü). */
  maxStepsPerFrame: 5,
  /** Yüksek DPR'de doldurma oranını sınırlar. */
  maxDpr: 2,
  /**
   * Canvas backing store piksel tavanı: 2560×1440 tam ekran DPR 2'de 14,7 milyon piksel olup orta sınıf GPU'da
   * kare hızını ~30'a indiriyordu; 3,5 milyon, 1440p'yi neredeyse tam çözünürlükte, 4K'yı ise 2495×1403'te çizer.
   */
  maxPixels: 3_500_000,
} as const;
