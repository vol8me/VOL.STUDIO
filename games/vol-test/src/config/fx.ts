/** Sunum efektlerinin ayarları; renkler `palette.ts`ten gelir. */
export const FX = {
  tracerLength: 16,
  /** Egzoz ve tozun gövde merkezinin arkasındaki kaynağı (birim). */
  exhaustOffset: 22,
  /** Bu hızın üstünde paletler toz kaldırır (birim/s). */
  dustSpeed: 90,
  marks: {
    capacity: 360,
    lifeMs: 9000,
    /** İki iz arası yer yolu (birim). */
    spacing: 9,
    alpha: 0.26,
  },
  wallFlash: { span: 260, width: 7, durationMs: 260 },
} as const;
