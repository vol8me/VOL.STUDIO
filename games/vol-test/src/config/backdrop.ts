/** Menü arka planı: menülerin arkasında oynayan canlı savaşın sayıları (sahne `BackdropScene`). */
export const BACKDROP = {
  /** Cephe başına bot sayısı: seçilebilir aralık ve varsayılan. */
  density: { min: 2, max: 8, default: 5 },
  /** Bot kadrosunu ve görev seçimini tohumlar. */
  seed: 1907,
  /**
   * Açılışta savaş kendi hâlinde bu kadar ilerletilir: botlar üslerinden çıkıp karşılaşır ve ilk kareden
   * çatışma vardır. Süre kare başına `prerollPerFrameMs` ile bölünür; tek karede takılma olmaz.
   */
  prerollMs: 36_000,
  prerollPerFrameMs: 1500,
  /** Kamera: yakınlaştırma aralığı, çatışma noktasının ekrandaki yüksekliği (0 üst, 1 alt) ve tutuş süreleri. */
  camera: {
    zoomMin: 0.95,
    zoomMax: 1.3,
    focusHeight: 0.38,
    holdMs: 7000,
    maxHoldMs: 16_000,
    /** Çiftin birbirine bu mesafeden (birim) yakın olması çatışma sayılır. */
    engageRange: 650,
    /** Odak çifti bu mesafeden fazla açılırsa kesilir. */
    breakRange: 1100,
    /** Kesme geçişi: karartma ve açılma süresi (ms). */
    cutOutMs: 160,
    cutInMs: 320,
    /** Kesmeden sonra kameranın yeni odağa oturması için bırakılan yakalama hızı. */
    followMs: 700,
  },
  /** Menü okunurluğu için sahnenin üstüne konan karartma. */
  dim: { alpha: 0.3 },
  /** Sahne hazır olunca arka planın görünüşe girme süresi (ms). */
  fadeInMs: 700,
} as const;
