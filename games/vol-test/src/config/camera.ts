/** Takip kamerası (arachnid modeli): zaman sabitli üstel takip, ileri bakış yok. */
export const CAMERA = {
  /** Takibin zaman sabiti (ms): kalan mesafenin ~%63'ü bu sürede kapanır. */
  followMs: 90,
  zoomMin: 0.55,
  zoomMax: 1.9,
  zoomDefault: 1.5,
  zoomStep: 1.18,
  zoomMs: 140,
  /** Ateş tepmesi: kamera atış yönünün tersine yaylanır. */
  kick: { stiffness: 260, damping: 18, max: 14 },
  /** Çarpma sarsıntısı: azami öteleme (birim) ve saniyelik sönüm. */
  shakeMax: 8,
  shakeDecay: 2.8,
} as const;

export type CameraConfig = typeof CAMERA;
