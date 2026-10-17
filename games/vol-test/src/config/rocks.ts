import { WORLD } from './world';

/**
 * Sabit kaya öbekleri: dünyanın değişmez coğrafyası (göller gibi), her yerde aynı tablodan kurulur ve
 * ağdan geçmez. Konumlar dünya oranıdır, ölçüler birimdir; öbekler merkeze göre nokta simetriktir.
 */
export interface OutcropSpec {
  /** Ayırt edici anahtar (test, harita ve kayıt için). */
  readonly id: string;
  /** Merkezin dünya genişliği ve yüksekliğine oranı. */
  readonly x: number;
  readonly y: number;
  /** Öbeğin yayılımı (birim): lobların merkezden en uzak kenarı. */
  readonly radius: number;
  /** Öbekteki kaya (lob) sayısı. */
  readonly lobes: number;
  /** Lob dağılımını tohumlar; aynı tohum her yerde aynı öbeği kurar. */
  readonly seed: number;
}

/** Yarısı yazılan öbekler: karşılığı (1 - x, 1 - y) olarak türetilir. */
const HALF: readonly (OutcropSpec & { readonly twin: string })[] = [
  { id: 'ridgeBluff', twin: 'ridgeBluffTwin', x: 0.245, y: 0.3, radius: 240, lobes: 7, seed: 11 },
  { id: 'coreSpur', twin: 'coreSpurTwin', x: 0.46, y: 0.55, radius: 170, lobes: 5, seed: 23 },
  { id: 'westShelf', twin: 'westShelfTwin', x: 0.2, y: 0.62, radius: 200, lobes: 6, seed: 37 },
  { id: 'northCairn', twin: 'northCairnTwin', x: 0.55, y: 0.27, radius: 150, lobes: 4, seed: 41 },
  { id: 'midBoulders', twin: 'midBouldersTwin', x: 0.3, y: 0.47, radius: 140, lobes: 4, seed: 53 },
  { id: 'farRidge', twin: 'farRidgeTwin', x: 0.44, y: 0.22, radius: 190, lobes: 5, seed: 67 },
  { id: 'southTeeth', twin: 'southTeethTwin', x: 0.38, y: 0.8, radius: 170, lobes: 5, seed: 71 },
  {
    id: 'outpostCover',
    twin: 'outpostCoverTwin',
    x: 0.36,
    y: 0.71,
    radius: 120,
    lobes: 3,
    seed: 89,
  },
];

export const OUTCROP_SPECS: readonly OutcropSpec[] = HALF.flatMap(({ twin, ...outcrop }) => [
  outcrop,
  { ...outcrop, id: twin, x: 1 - outcrop.x, y: 1 - outcrop.y, seed: outcrop.seed + 1000 },
]);

/** Kayanın sayısal kuralları: lob boyutu, yükseklik profili ve araçlara etkisi. */
export const ROCKS = {
  /** Lob yarıçapı, öbek yayılımının bu aralığıdır (en küçük, en büyük). */
  lobeRadius: [0.26, 0.5],
  /** Lobun merkezden uzaklığı yayılımın en çok bu oranıdır (kenar lobu yayılımı aşmaz). */
  scatter: 0.62,
  /** Lob yüksekliği [0, 1] aralığı; yüksek lob tırmanışta daha yavaş, daha belirgindir. */
  height: [0.55, 1],
  /** Kaya profilinin düz tepe oranı: yarıçapın bu kadarından içeri tam yüksekliktir. */
  plateau: 0.45,
  /**
   * Yürüyücü (örümcek) tırmanışı. Tam yükseklikte hız bu orana düşer ve gövde `lift` oranı kadar
   * büyür (görünüm ölçeği ve gölge payı); alçak kaya tırmanılır ama hissedilir, duvar değildir.
   */
  climb: { speedFloor: 0.58, lift: 0.1, lean: 0.07 },
  /**
   * Mermi siperi: lobun üst yüksekliği (birim) `height` ile çarpılır. Namlu yüksekliğinde (~30)
   * uçan düz mermi kayaya çarpar; yüksek yaylı mermi (tepe noktası bunu aşan) kayanın üstünden geçer.
   */
  coverHeight: 60,
  /** Çarpışma şeklini bu orana küçültür: görsel kenar ile fizik kenarı arasındaki pay. */
  collisionInset: 0.94,
  /** Bot kaçınma: kayanın bu uzaklıklarda (birim) önünden yönü sıyırır. */
  botLookahead: [70, 150],
  /** Kaya dünya kenarından en az bu birim içeridedir (test sözleşmesi). */
  edgeMargin: 400,
  /** Ölçüsü bu dünyaya göre ölçeklenir: daha küçük dünya, daha küçük kaya. */
  referenceSize: WORLD.width,
} as const;
