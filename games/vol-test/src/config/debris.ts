/**
 * Enkaz: ölen ya da kırılan araçtan savrulan fiziksel parçalar. Parçalar havada yükseklik (`z`) taşır,
 * yere sekerek durur, bir süre kalır ve söner. Kalabalık olmasın diye tavan vardır (kalite profiliyle
 * ölçeklenir) ve dolu havuzda en eski parça yeni parçaya verilir.
 */
export const DEBRIS = {
  /** Aynı anda yaşayan en çok parça (yüksek kalite); düşük kalite oranla azalır. */
  capacity: 28,
  /** Yer çekimi (birim/s²), havada hız sönümü (1/s) ve zemin sekmesi. */
  gravity: 980,
  airDrag: 0.55,
  restitution: 0.36,
  /** Her sekişte yatay hızın kalan oranı ve durmuş parçanın yuvarlanma sönümü (1/s). */
  bounceFriction: 0.62,
  rollDrag: 4.2,
  /** Bu dikey hızın altındaki sekiş parçayı yere oturtur (birim/s). */
  settleSpeed: 55,
  /** Parçanın yaşam süresi aralığı, son sönme süresi ve ilk sıcak parlama süresi (ms). */
  lifeMs: [3600, 5600] as const,
  fadeMs: 1000,
  hotMs: 520,
  hotTint: 0xffb25e,
  /** Işığın tersine düşen gölge kayması (yükseklik başına) ve perspektifle büyüme. */
  light: { x: 0.38, y: 0.5 },
  perspective: 0.0105,
  shadowAlpha: 0.3,
  /** Dünya kenarından bu kadar içeride parça sekip geri döner. */
  edgeMargin: 12,
  /** Parçanın çizim derinliği: yerdeyken araçların altında, havadayken üstünde. */
  depth: { ground: 8, air: 12.5 },
  /** Bu yüksekliğin üstündeki parça "havadadır". */
  airHeight: 8,
  /** Mermi isabeti: ara sıra küçük bir parça kopar. Şans konum ve kimlikten türer (rastgelelik yok). */
  hit: {
    chance: 0.2,
    count: [1, 2] as const,
    speed: [80, 190] as const,
    lift: [120, 260] as const,
    scale: [0.34, 0.5] as const,
  },
  /** Ölüm: hızlı bir patlamayla savrulan parçalar. */
  wreck: {
    count: [6, 8] as const,
    speed: [150, 360] as const,
    lift: [220, 430] as const,
    spin: [5, 15] as const,
    scale: [0.5, 0.85] as const,
    /** Büyük (aracın gerçek parçası) parça sayısı: kalanı levha kıymığıdır. */
    big: 2,
  },
  /** Kırılan bir uzuv (bacak, palet): tek büyük parça kenara düşer. */
  part: {
    speed: [90, 210] as const,
    lift: [170, 320] as const,
    spin: [4, 11] as const,
  },
  /** Levha kıymığı dokuları ve rengi (doku gri, renk çarpılır). */
  shardVariants: 3,
  shardTint: { tank: 0x7b6a58, walker: 0x6a5846 },
} as const;
