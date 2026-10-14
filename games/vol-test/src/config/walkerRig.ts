import type { RigArticulation } from '@volstudio/core/rig/metadata';

/**
 * Kaynak poz ile atan2 açı uzayı arasındaki fark: belgede yaratık YUKARI (yerel -Y) bakar,
 * `Math.atan2` +X'i sıfır sayar. Sahne ile uzuv çözücüsü aynı sabiti okur; düzeltme birinde
 * eksik kalırsa bacaklar gövdeye göre yanlış yöne yatar.
 */
export const RIG_FACING_OFFSET_RAD = Math.PI / 2;

const LEG_IDS = ['r0', 'r1', 'r2', 'r3', 'l0', 'l1', 'l2', 'l3'] as const;
const TAIL_IDS = ['l', 'r'] as const;

export type LegId = (typeof LEG_IDS)[number];
export type TailId = (typeof TAIL_IDS)[number];

/** Gövdeye bağlı, uzuvlarla birlikte hareket etmeyen kabuk parçaları. */
export const BODY_SHELL_PART_IDS = [
  'abdomen_shell',
  'abdomen_plate',
  'core_ring',
  'reactor',
] as const;

/** Bakışı taşıyan parça: `core_ring`in içinde, yuvasından taşmadan gezinir. */
export const GAZE_PART_ID = 'reactor_slit';

/** Dönüşe önden yatıp yönü okuturlar; birebir dönerlerse yaratık levha olur. */
export const SNOUT_PART_IDS = ['top_cap', 'top_cap_side_l', 'top_cap_side_r'] as const;

export interface LimbChainSpec {
  id: string;
  /** Gövdeye bağlanan ilk kemik (omuz). */
  shoulderPartId: string;
  upperPartId: string;
  lowerPartId: string;
  /** Uçtaki kozmetik parça; kemik uzunluğuna dahildir, ayrıca bilek açısı alır. */
  tipPartId: string | null;
  /**
   * Kaynak yerleşim parçaları ADLARININ TERSİNE mi dizmiş? Kuyruklarda ok ucu gövdenin altında,
   * kalın çubuk dışarıda kalıyor. Yerleşimden düzeltilemez (parçalar fiziksel olarak o sırada);
   * zincir yeniden kurulur: kemik boyları ters sırayla alınır, parça konumları eklemlerin üstüne
   * yazılır.
   */
  sourceChainReversed: boolean;
  /** Zincir yeniden kurulduğunda eklem diskinin oturacağı parça; yalnız ters zincirlerde anlamlıdır. */
  rebuiltJointPartId: string | null;
}

const legChain = (id: LegId): LimbChainSpec => ({
  id,
  shoulderPartId: `leg_${id}_coxa`,
  upperPartId: `leg_${id}_femur`,
  lowerPartId: `leg_${id}_tibia`,
  tipPartId: `leg_${id}_claw`,
  sourceChainReversed: false,
  rebuiltJointPartId: null,
});

const tailChain = (id: TailId): LimbChainSpec => ({
  id: `t${id}`,
  shoulderPartId: `tail_${id}_tail_upper`,
  upperPartId: `tail_${id}_tail_lower`,
  lowerPartId: `tail_${id}_tail_tip`,
  tipPartId: null,
  sourceChainReversed: true,
  rebuiltJointPartId: `tail_${id}_tail_joint`,
});

/** Sürülen uzuv zincirleri; sıra pozlama sırasıdır ve `GAIT.stance` anahtarlarıyla örtüşür. */
export const LIMB_CHAINS: readonly LimbChainSpec[] = [
  ...LEG_IDS.map(legChain),
  ...TAIL_IDS.map(tailChain),
];

/**
 * Eklem şeması. Export metadata'sı düz bir parça listesidir: `parentPartId` taşımaz, yani
 * `assembleRig` tüm parçaları kökün kardeşi yapar ve yalnız uçlar sürülebilir. Şema burada veri
 * olarak bildirilir ve `articulateRigDefinition` ile uygulanır; üretilmiş metadata'ya dokunulmaz,
 * bir sonraki export bu kararı ezmez. Eklem diskleri ve femur parlaması kemik değildir: yalnız
 * üstünde durdukları kemiğin çocuğu olarak onunla taşınırlar.
 */
export const ARACHNID_ARTICULATION: RigArticulation = Object.freeze({
  ...Object.fromEntries(
    LEG_IDS.flatMap((id) => [
      [`leg_${id}_femur`, `leg_${id}_coxa`],
      [`leg_${id}_tibia`, `leg_${id}_femur`],
      [`leg_${id}_claw`, `leg_${id}_tibia`],
      [`leg_${id}_joint_coxa_femur`, `leg_${id}_coxa`],
      [`leg_${id}_joint_femur_tibia`, `leg_${id}_femur`],
      [`leg_${id}_femur_hi`, `leg_${id}_femur`],
    ]),
  ),
  ...Object.fromEntries(
    TAIL_IDS.flatMap((id) => [
      [`tail_${id}_tail_lower`, `tail_${id}_tail_upper`],
      [`tail_${id}_tail_tip`, `tail_${id}_tail_lower`],
      [`tail_${id}_tail_joint`, `tail_${id}_tail_upper`],
    ]),
  ),
});

/** Plazma topunun kaynak parçaları: hangi parça döner gövdede, hangisi namlu ile geri kayar. */
export const PLASMA_CANNON_PARTS = {
  /** Topun dönme eksenini taşıyan parça: yuva merkezi bunun merkezidir. */
  pivot: 'housing_body',
  /** Atışta geri kayan namlu çubuğu; kılıf, bobin ve ağız parçaları onun çocuğudur. */
  barrel: 'barrel_rod',
  /** Mercek ve ağız yarığı: ısınma ışığı bu iki noktada yanar. */
  lens: 'lens',
  slit: 'muzzle_slit',
} as const;
