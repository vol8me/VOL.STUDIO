import { WORLD } from './world';

/**
 * Sabit göllerin sözleşmesi. Göller dünyanın değişmez coğrafyasıdır: sunucu, çevrimdışı alıştırma
 * ve istemci öngörüsü aynı tablodan aynı şekli kurar, ağdan hiçbir göl verisi geçmez. Konumlar dünya
 * ölçüsünün oranıdır, yarıçaplar birimdir (dünya `WORLD` ölçüsünden küçükse oranla küçülür).
 * Göller dünyanın merkezine göre nokta simetriktir: karşıt üslerin iki yanı aynı coğrafyayı görür.
 */

/** Kıyıyı dalgalandıran bir harmonik: tekrar sayısı, genlik (yarıçap oranı) ve faz (rad). */
export type LakeHarmonic = readonly [count: number, amplitude: number, phase: number];

export interface LakeSpec {
  /** Ayırt edici anahtar (test, harita ve kayıt için). */
  readonly id: string;
  /** Merkezin dünya genişliği ve yüksekliğine oranı. */
  readonly x: number;
  readonly y: number;
  /** Yarı eksenler (birim) ve eksen dönüklüğü (rad). */
  readonly rx: number;
  readonly ry: number;
  readonly rotation: number;
  /** Kıyı şeklini bozan harmonikler: genliklerin toplamı ~0,3'ü geçmez, yani göl kendini kesmez. */
  readonly shape: readonly LakeHarmonic[];
}

/** Yarısı yazılan göller: karşılığı (1 - x, 1 - y) ve yarım tur dönük olarak türetilir. */
const HALF: readonly (Omit<LakeSpec, 'id'> & { readonly id: string; readonly twin: string })[] = [
  {
    id: 'westMere',
    twin: 'eastMere',
    x: 0.13,
    y: 0.46,
    rx: 640,
    ry: 980,
    rotation: 0.18,
    shape: [
      [2, 0.1, 0.7],
      [3, 0.07, 2.1],
      [5, 0.04, 0.3],
    ],
  },
  {
    id: 'northMere',
    twin: 'southMere',
    x: 0.36,
    y: 0.13,
    rx: 880,
    ry: 560,
    rotation: -0.12,
    shape: [
      [2, 0.12, 1.9],
      [3, 0.06, 0.4],
      [4, 0.05, 2.6],
    ],
  },
  {
    id: 'innerPond',
    twin: 'innerPondTwin',
    x: 0.4,
    y: 0.38,
    rx: 420,
    ry: 330,
    rotation: 0.6,
    shape: [
      [2, 0.09, 0.2],
      [3, 0.08, 1.4],
    ],
  },
  {
    id: 'cornerLake',
    twin: 'farLake',
    x: 0.12,
    y: 0.14,
    rx: 760,
    ry: 620,
    rotation: 0.4,
    shape: [
      [2, 0.11, 2.4],
      [3, 0.07, 0.9],
      [5, 0.035, 1.7],
    ],
  },
];

export const LAKE_SPECS: readonly LakeSpec[] = HALF.flatMap(({ twin, ...lake }) => [
  lake,
  {
    ...lake,
    id: twin,
    x: 1 - lake.x,
    y: 1 - lake.y,
    rotation: lake.rotation + Math.PI,
  },
]);

/** Gölün sayısal kuralları: derinlik profili ve araç etkileri. */
export const LAKE = {
  /** Kıyıdan merkeze en büyük derinlik (m) ve derinlik eğrisinin eğimli kıyı payı (kıyı uzaklığı oranı). */
  maxDepthMetres: 3.4,
  shelf: 0.62,
  /** Kıyı şeridi: gölün dışında ıslak kıyının genişliği (yarıçap oranı); yalnız sunum ve ses. */
  bank: 0.12,
  /** Dış sınırın hesabı için tabandaki örnekleme: kıyı ve şerit çokgenindeki nokta sayısı. */
  outlinePoints: 96,
  /** Ölçüsü bu dünyaya göre ölçeklenir: daha küçük dünya, daha küçük göl. */
  referenceSize: WORLD.width,
} as const;

/**
 * Araçların suya tepkisi. Derinlik [0, 1]'dir (`LakeField.depthAt`). Yüzemeyen araç (tank, yürüyücü)
 * bastığı yerin derinliğiyle yavaşlar, belli bir derinlikten sonra can kaybeder ve can bitince boğulur;
 * süzülen araç yüzer: yavaşlamaz, hasar almaz.
 */
export const WADING = {
  /** Derinlik başına hız kaybı: tam derinlikte hız bu orana düşer (yüzey ince ve eğri değildir). */
  speedFloor: 0.22,
  /** Eğri üssü: sığ kıyıda kayıp yumuşak, derinde dik. */
  speedCurve: 1.35,
  /** Bu derinliğin altında can kaybı yoktur (diz boyu su). */
  hurtDepth: 0.22,
  /** Tam derinlikte saniyede en çok can oranı (azami cana göre); aradaki eğri kareli büyür. */
  hurtPerSecond: 0.34,
  /** Boğulma hasarı bu can oranına birikince tek olayla uygulanır: olay seli ve ağ yükü yoktur. */
  hurtChunk: 0.03,
} as const;
