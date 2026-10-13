import type { Vec } from './parts';

/**
 * Örümcek rig'inin sabitleri. Bağlantı noktaları SVG dosyalarındaki gerçek koordinatlardır
 * (`arachnid-*.svg`); `tests/lab/spiderRig.test.ts` her birini dosyayla karşılaştırır, böylece bir
 * parçanın yeniden çizilmesi rig'i sessizce bozmaz. Birim tasarım birimidir (1 karo = 64).
 *
 * Gövde uzayı: başgöğsün merkezi orijin, burun +x (doğu), ekran ekseni (y aşağı). Sol bacaklar
 * y < 0, sağ bacaklar y > 0 taraftadır.
 */

export const SPIDER_ANCHORS = {
  /** 64×64. Merkez (32,32); omuz yuvaları (kalça) dört çift. */
  carapace: {
    width: 64,
    height: 64,
    center: [32, 32] as Vec,
    hipsX: [38, 28, 19, 11] as const,
    /** Omuz yuvasının merkezden yanal uzaklığı: ön çift gövdeye daha yakındır. */
    hipsY: [17, 20, 20, 20] as const,
  },
  /** 56×16: eklem A (8,8) → eklem B (48,8); uzunluk 40. */
  femur: { width: 56, height: 16, a: [8, 8] as Vec, b: [48, 8] as Vec },
  /** 64×16: eklem A (8,8) → eklem B (56,8); uzunluk 48. */
  tibia: { width: 64, height: 16, a: [8, 8] as Vec, b: [56, 8] as Vec },
  /** 24×16: eklem (4,8) → uç (20,9); uzunluk ≈ 16. Ayağın yere bastığı nokta uçtur. */
  claw: { width: 24, height: 16, a: [4, 8] as Vec, tip: [20, 9] as Vec },
  /** 20×20 kalça plakası. */
  coxa: { width: 20, height: 20, center: [10, 10] as Vec },
  /** 88×72: ön kenardaki bağlantı (76,36); arkaya (-x) uzanır; havalandırma (44,36). */
  abdomen: { width: 88, height: 72, pivot: [76, 36] as Vec, vent: [44, 36] as Vec },
  reactor: { width: 48, height: 48, center: [24, 24] as Vec },
  shadow: { width: 128, height: 128, center: [64, 64] as Vec },
} as const;

export const FEMUR_LENGTH = SPIDER_ANCHORS.femur.b[0] - SPIDER_ANCHORS.femur.a[0];
export const TIBIA_LENGTH = SPIDER_ANCHORS.tibia.b[0] - SPIDER_ANCHORS.tibia.a[0];
export const CLAW_LENGTH = Math.round(
  Math.hypot(
    SPIDER_ANCHORS.claw.tip[0] - SPIDER_ANCHORS.claw.a[0],
    SPIDER_ANCHORS.claw.tip[1] - SPIDER_ANCHORS.claw.a[1],
  ),
);
/** IK'nın ikinci kemiği kaval + pençedir: ayak noktası pençenin ucudur, kaval ucu değil. */
export const LOWER_LENGTH = TIBIA_LENGTH + CLAW_LENGTH;
export const MAX_REACH = FEMUR_LENGTH + LOWER_LENGTH;

/** Karın bağlantısının gövde uzayındaki konumu ve türetilen parçalar. */
export const ABDOMEN_PIVOT_BODY: Vec = [-24, 0];
export const REACTOR_BODY: Vec = [
  ABDOMEN_PIVOT_BODY[0] + (SPIDER_ANCHORS.abdomen.vent[0] - SPIDER_ANCHORS.abdomen.pivot[0]),
  ABDOMEN_PIVOT_BODY[1] + (SPIDER_ANCHORS.abdomen.vent[1] - SPIDER_ANCHORS.abdomen.pivot[1]),
];
export const SHADOW_BODY: Vec = [-35, 0];
export const SHADOW_SCALE: Vec = [1.1, 0.8];

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
export const STANCE_DEG = [38, 70, 112, 150] as const;

export function buildLegs(): LegDef[] {
  const legs: LegDef[] = [];
  const { hipsX, hipsY, center } = SPIDER_ANCHORS.carapace;
  for (let pair = 0; pair < hipsX.length; pair++) {
    for (const side of [-1, 1] as const) {
      legs.push({
        pair,
        side,
        hip: [hipsX[pair] - center[0], side * hipsY[pair]],
        stance: (STANCE_DEG[pair] * Math.PI) / 180,
        group: ((pair + (side === 1 ? 1 : 0)) % 2) as 0 | 1,
      });
    }
  }
  return legs;
}

/** Yürüyüş ayarı: tasarım biriminde; ekran ölçeği yalnız görünümdedir. */
export interface SpiderConfig {
  /** Dinlenme ayağının kalçadan uzaklığı (erişimin yaklaşık %73'ü: diz belirgin bükülür, uzuv gerilmez). */
  readonly homeReach: number;
  readonly stepTriggerPx: number;
  readonly stepDurationMs: number;
  readonly stepLeadSeconds: number;
  readonly maxStrainPx: number;
  /** Adım tepesinde kaval ve pençenin büyüme oranı (üstten bakışta ayak kameraya yaklaşır). */
  readonly liftScale: number;
}

export const DEFAULT_SPIDER: SpiderConfig = {
  homeReach: 76,
  stepTriggerPx: 14,
  stepDurationMs: 100,
  stepLeadSeconds: 0.1,
  maxStrainPx: 50,
  liftScale: 0.16,
};
