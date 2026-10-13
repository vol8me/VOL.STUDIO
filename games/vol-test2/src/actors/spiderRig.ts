import type { Vec } from '@/art/parts';

/**
 * Örümcek rig'inin sabitleri. Bağlantı noktaları `scripts/art/spider.ts` üreticisinin tuval ve eklem
 * sayılarıdır; `tests/actors/spiderRig.test.ts` her birini üreticiyle ve SVG dosyalarıyla karşılaştırır,
 * böylece bir parçanın yeniden çizilmesi rig'i sessizce bozmaz. Birim tasarım birimidir (1 karo = 64).
 *
 * Gövde uzayı: başgöğsün merkezi orijin, burun +x (doğu), ekran ekseni (y aşağı). Sol bacaklar
 * y < 0, sağ bacaklar y > 0 taraftadır. Bacak iki kemiktir: uyluk ve pençesi gövdeye çizili kaval.
 */

export const SPIDER_ANCHORS = {
  /** Kalçalar kabuğun kenarındadır; uyluğun amber başlığı kabuğun altından çıkar. */
  carapace: {
    width: 134,
    height: 125,
    center: [66.7, 62.1] as Vec,
    hipsX: [92, 71.3, 48.3, 25.3] as const,
    /** Kalçanın sprite üst kenarından uzaklığı: ön çift gövdeye daha yakındır. */
    hipsY: [23, 16.1, 16.1, 25.3] as const,
  },
  /** 72×32: kalça eklemi A (15,16) → diz eklemi B (59,16); uzunluk 44. */
  femur: { width: 72, height: 32, a: [15, 16] as Vec, b: [59, 16] as Vec },
  /** 84×30: diz eklemi A (13,15) → pençe ucu (77,15); uzunluk 64. Ayağın bastığı nokta uçtur. */
  tibia: { width: 84, height: 30, a: [13, 15] as Vec, tip: [77, 15] as Vec },
  /** 143×125: ön kenardaki bağlantı (128.8,62.1); arkaya (-x) uzanır; havalandırma (73.6,62.1). */
  abdomen: { width: 143, height: 125, pivot: [128.8, 62.1] as Vec, vent: [73.6, 62.1] as Vec },
  reactor: { width: 64, height: 64, center: [32, 32] as Vec },
  shadow: { width: 192, height: 192, center: [96, 96] as Vec },
} as const;

export const FEMUR_LENGTH = SPIDER_ANCHORS.femur.b[0] - SPIDER_ANCHORS.femur.a[0];
/** İkinci kemik kaval + pençedir (tek parça): ayak noktası pençenin ucudur. */
export const LOWER_LENGTH = SPIDER_ANCHORS.tibia.tip[0] - SPIDER_ANCHORS.tibia.a[0];
export const MAX_REACH = FEMUR_LENGTH + LOWER_LENGTH;

/** Karın bağlantısının gövde uzayındaki konumu ve türetilen parçalar. */
export const ABDOMEN_PIVOT_BODY: Vec = [-44, 0];
export const REACTOR_BODY: Vec = [
  ABDOMEN_PIVOT_BODY[0] + (SPIDER_ANCHORS.abdomen.vent[0] - SPIDER_ANCHORS.abdomen.pivot[0]),
  ABDOMEN_PIVOT_BODY[1] + (SPIDER_ANCHORS.abdomen.vent[1] - SPIDER_ANCHORS.abdomen.pivot[1]),
];
export const SHADOW_BODY: Vec = [-50, 0];
export const SHADOW_SCALE: Vec = [1.05, 0.75];

export interface LegDef {
  /** 0..3 ön → arka. */
  readonly pair: number;
  /** -1 sol (y<0), +1 sağ (y>0). */
  readonly side: -1 | 1;
  /** Gövde uzayında kalça. */
  readonly hip: Vec;
  /** Duruş açısı (rad): ileri eksenden dışa doğru. */
  readonly stance: number;
  /** Tetrapod grubu: çapraz çift (sol-1, sağ-2, sol-3, sağ-4) birlikte adım atar. */
  readonly group: 0 | 1;
}

/** Ön → arka duruş açıları (derece). */
export const STANCE_DEG = [34, 64, 104, 142] as const;

export function buildLegs(): LegDef[] {
  const legs: LegDef[] = [];
  const { hipsX, hipsY, center } = SPIDER_ANCHORS.carapace;
  for (let pair = 0; pair < hipsX.length; pair++) {
    for (const side of [-1, 1] as const) {
      legs.push({
        pair,
        side,
        hip: [hipsX[pair] - center[0], side * (center[1] - hipsY[pair])],
        stance: (STANCE_DEG[pair] * Math.PI) / 180,
        group: ((pair + (side === 1 ? 1 : 0)) % 2) as 0 | 1,
      });
    }
  }
  return legs;
}

/** Yürüyüş ayarı: tasarım biriminde; ekran ölçeği yalnız görünümdedir. */
export interface SpiderConfig {
  /** Dinlenme ayağının kalçadan uzaklığı (erişimin yaklaşık %72'si: diz belirgin bükülür, uzuv gerilmez). */
  readonly homeReach: number;
  /** Ayak evinden bu kadar uzaklaşınca adım başlar; adım boyu ≈ bu + öngörü mesafesidir. */
  readonly stepTriggerPx: number;
  /**
   * Adım süresi (ms) gövdenin ayak hızına göre seçilir ve [swingMinMs, swingMaxMs] aralığındadır:
   * bir bacak çevrimin en çok `swingDuty` kadarını havada geçer. Yoksa iki tetrapod grubu sırayla
   * atamaz, sıra delinir ve bacaklar titrer. Yavaşta ağır ve uzun, hızlıda kısa adım atılır.
   */
  readonly swingMinMs: number;
  readonly swingMaxMs: number;
  readonly swingDuty: number;
  /** Dönüşün ayak hızına katkısı: dış ayak, gövde merkezinden bu kadar uzakta dönen bir noktadır. */
  readonly turnArmPx: number;
  readonly stepLeadSeconds: number;
  /** Adım hedefinin hız yönünde en çok bu kadar ileri konabilmesi: hızlı gövdede ayak erişimi aşıp kaymasın. */
  readonly maxLeadPx: number;
  readonly maxStrainPx: number;
  /** Adım tepesinde bacak parçalarının büyüme oranı (üstten bakışta ayak kameraya yaklaşır). */
  readonly liftScale: number;
}

/**
 * Ağır, sakin yürüyüş. CORE `LegGait` ayağı `ev + hız·öngörü` noktasına basar ve ev'in `stepTriggerPx` gerisine
 * düşünce yeniden adım atar; adım boyu ≈ tetik + öngörü mesafesidir. Tetik ve öngörü uzun, süre ağır tutulur:
 * 96 birim/sn'de bacak başına ≈ 1,6 adım/sn (eski kısa-tetikli ayar 2,6'ydı ve bacaklar titriyordu).
 * Ev + tetik ≤ MAX_REACH olduğu için IK düz yürüyüşte kelepçelemez; öngörü mesafesi `maxLeadPx` ile sınırlıdır.
 */
export const DEFAULT_SPIDER: SpiderConfig = {
  homeReach: 78,
  stepTriggerPx: 28,
  swingMinMs: 80,
  swingMaxMs: 260,
  swingDuty: 0.24,
  turnArmPx: 110,
  stepLeadSeconds: 0.3,
  maxLeadPx: 30,
  maxStrainPx: 34,
  liftScale: 0.14,
};
