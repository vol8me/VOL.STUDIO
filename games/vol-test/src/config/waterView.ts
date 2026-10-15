import type { SeasonKind } from './seasons';

/**
 * Göllerin sunumu. Geometri `config/lakes.ts` ve `LakeField`'dan gelir; burada yalnız renk, bant ve
 * hareket vardır. Hiçbir sayı fiziği etkilemez: donma, dalga ve köpük salt sunumdur.
 */
export const WATER_VIEW = {
  /** Mevsim zemininin (-105) ve yüzey katmanının (-89) üstü, araç gölgelerinin altı. */
  depth: -88,
  /** Derinlik bantları: kıyı çizgisinden (1) merkeze doğru kıyı oranı kesimleri (`LakeField.ratio`). */
  bands: [1, 0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.44, 0.38],
  /** Mevsim başına kıyı, sığ ve derin su renkleri; mevsim geçişinde karışır. */
  palette: {
    spring: { bank: 0x7a6a45, shallow: 0x86c0a4, deep: 0x16405a },
    summer: { bank: 0x8a7442, shallow: 0x74c4b4, deep: 0x0f4260 },
    autumn: { bank: 0x6d5538, shallow: 0x78a898, deep: 0x1a3a4a },
    winter: { bank: 0x6a6a62, shallow: 0x8fb3c2, deep: 0x1c3a52 },
  } satisfies Record<SeasonKind, { bank: number; shallow: number; deep: number }>,
  /**
   * Durağan bantlar (kıyı şeridi ve derinlik halkaları) göl başına küçük bir dokuya basılır: her
   * karede ekranı kaplayan on kat üst üste çizim yerine tek bir görüntü çizilir. `scale` dünya
   * biriminden doku pikseline oranıdır (bilinear süzme bantlar arasını yumuşatır); renkler bu
   * aralıktan (ms) sık yeniden basılmaz.
   */
  bake: { scale: 0.3, minIntervalMs: 500, margin: 8 },
  bankAlpha: 0.42,
  /** Dış banttaki saydamlık: kıyı çizgisi zemine karışır, derin su opak olur. */
  shallowAlpha: 0.7,
  deepAlpha: 0.96,
  shoreline: { color: 0xe9f5f2, alpha: 0.5, width: 1.6 },
  foam: {
    color: 0xf6fcff,
    alpha: 0.7,
    width: 2.2,
    /** Köpük çokgeni bu kadar kıyıdan içeri (kıyı oranı) başlar ve nefes alır. */
    inset: 0.018,
    breathe: 0.014,
    /** Köpük, kıyı çevresinde bu kadar parçaya bölünür; parçalar dalgayla yanıp söner. */
    segments: 24,
    speed: 0.0011,
  },
  waves: {
    lines: [0.86, 0.7, 0.55] as readonly number[],
    color: 0xe8f6fb,
    alpha: 0.2,
    width: 1.4,
    amplitude: 0.022,
    speed: 0.0006,
    segments: 24,
  },
  /**
   * Rüzgârın yüzeyde sürüklediği parıltı çizgileri: göl içinde rüzgâr yönünde kayan, ışığı vuran kısa
   * dalga sırtları. `count` göl başına en çok sayıdır (kalite ile azalır), `driftUnits` bir çevrimde
   * kat edilen yoldur.
   */
  glints: {
    count: 34,
    periodMs: 5200,
    driftUnits: 70,
    length: [6, 15],
    width: 1.3,
    color: 0xf2fbff,
    alpha: 0.5,
    /** Rüzgâr çok zayıfken kullanılan yön (kıyıya göre sabit esinti). */
    calm: { x: 0.8, y: 0.3 },
  },
  /**
   * Kıyıya vuran dalga takımları: köpük çizgisi kıyıdan içeri yavaşça ilerler, söner ve dalgalar arası
   * duraklar. Aynı göl için faz kaydırılır, iki göl aynı anda vurmaz.
   */
  swash: { periodMs: 6400, reach: 0.07, alpha: 0.55, width: 2, segments: 18, share: 0.7 },
  ice: {
    color: 0xdcf0f7,
    shade: 0x9fc4d6,
    crack: 0xf5fcff,
    /** Bu sıcaklıktan (°C) başlar ve `span` kadar düşünce göl bütünüyle donar. */
    freezeAt: -1,
    span: 5,
    /** Kar yağarken donma payı: kar buzun üstünü örter ve daha çabuk kapatır. */
    snowBoost: 0.18,
    alpha: 0.82,
    cracks: 9,
    /** Donma cephesindeki kırağı tüyleri: sayı ve uzunluk (kıyı oranı), sunum sıklığı ve sertliği. */
    feathers: { length: 0.05, alpha: 0.45 },
    /** Kırıkların yan dalları: kırık başına dal sayısı ve boyu (göl yarıçapı oranı). */
    twigs: { perCrack: 3, length: 0.09 },
    /** Doku, buz bu kadar kademede değişince yeniden basılır. */
    steps: 40,
  },
  /**
   * Araç izleri: yüzeyde kısa ömürlü işaretler. Yürüyen araç (tank, bacaklı) halka bırakır, buzda
   * kırık delik açar; süzülen araç V şeklinde dalga çeker, buzda yalnız ince bir yarık bırakır.
   * Hepsi sunumdur: buz kırılması fiziği etkilemez, çevrimiçi hava istemci yereldir.
   */
  trails: {
    depth: -87,
    capacity: 168,
    /** İz bırakmak için en küçük derinlik [0, 1] ve en küçük hız (birim/s). */
    minDepth: 0.04,
    minSpeed: 24,
    /** Şasi türüne göre işaret yarıçapı ve iki işaret arasındaki yol (birim). */
    radius: { tank: 30, walker: 24, hover: 20, mech: 28, leaper: 22 },
    spacing: { tank: 34, walker: 28, hover: 24, mech: 32, leaper: 26 },
    color: 0xe8f6fb,
    /** Kırık buz deliği: koyu su ve açık kenar; yavaş yavaş yeniden donarak kapanır. */
    hole: { color: 0x0b2f48, edge: 0xdff1f7, lifeMs: 7000, edgeWidth: 1.4, points: 9 },
    channel: { color: 0x123d5a, lifeMs: 2600, width: 5, length: 34 },
    ring: { lifeMs: 1100, grow: 1.9, width: 1.6, alpha: 0.5 },
    wake: {
      lifeMs: 1500,
      spread: 0.42,
      length: 96,
      width: 2,
      alpha: 0.3,
      /** Sürekli yarık: nokta sayısı ve aralığı (birim), ömrü; şerit genişliği araç yarıçapının oranıdır. */
      points: 20,
      sample: 14,
      widthScale: 1.05,
      fullSpeed: 260,
      color: 0xeaf7fb,
      channelColor: 0x0f3a56,
      channelAlpha: 0.42,
      /** Kollar: Kelvin kamasına yakın açı (mesafe başına yanal yayılım), en çok açıklık ve çizgi kalınlıkları. */
      armSpread: 0.3,
      armMax: 64,
      armWidth: 1.5,
      armAlpha: 0.5,
      edgeWidth: 1.1,
      edgeAlpha: 0.38,
      crestWidth: 1.2,
      crestAlpha: 0.42,
      crestLength: 11,
      foamPoints: 5,
      foamAlpha: 0.7,
      /** Pruva dalgası: yay yarıçapı (şerit genişliğinin oranı), açısı ve çizgisi. */
      bowScale: 0.95,
      bowArc: 0.95,
      bowWidth: 1.8,
      bowAlpha: 0.55,
    },
    /** Buz kırığı: delik çevresinde yıldız çatlak (uzun yaşar) ve yüzen buz parçaları. */
    crack: {
      lifeMs: 16_000,
      rays: 6,
      reach: 2.6,
      width: 1.1,
      alpha: 0.75,
      color: 0xf2fbfe,
      shade: 0x5d8aa0,
    },
    shard: { count: 3, lifeMs: 3400, size: 7, drift: 24, color: 0xcfe8f1, edge: 0xf5fcff },
  },
  /**
   * Batma: derin suda (bu derinlikten sonra) ölen araç patlamaz; kararır, küçülür, solar ve halka ile
   * kabarcık bırakarak dibe gider; süre bitince sahneden kalkar, yeniden doğunca geri gelir.
   */
  sink: {
    minDepth: 0.5,
    durationMs: 2800,
    /** Bitişteki ölçek ve ilk anda havanın sıkıştırdığı kabarma (ölçek oranı). */
    scale: 0.62,
    swell: 0.045,
    /** Batarken yan yatış (rad), titreme (birim, tur sayısıyla) ve dibe inerken gövdenin kararacağı renk. */
    list: 0.28,
    wobble: 1.6,
    wobbleCycles: 5,
    tint: 0x14414f,
    rings: 4,
    ringGapMs: 260,
    bubbles: 26,
    bubbleLifeMs: 1500,
    bubbleRise: 34,
    /** Gövde kapanırken yüzeye vuran son kabarma: halka büyüklüğü (yarıçap oranı) ve zamanı (süre oranı). */
    boil: { radius: 1.9, at: 0.72 },
  },
  /**
   * Suya batan canlı araç: derinlik bu eşikten sonra gövde suyun rengine çekilir ve solar (derine indikçe
   * artar); dibe (`WADING.bottomDepth`) yaklaşan araç neredeyse suyun renginde ve yarı saydamdır.
   */
  submerge: {
    startDepth: 0.14,
    tint: 0x1f5d70,
    tintMax: 0.68,
    alphaMin: 0.52,
  },
  ripple: {
    periodMs: 1500,
    maxRadius: 24,
    perLake: 9,
    color: 0xe8f6fb,
    alpha: 0.4,
  },
} as const;
