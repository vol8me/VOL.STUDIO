import type { SpringConfig } from '@volstudio/core/math';
import type { SensorArt } from './sensors';
import type { MechId } from './vehicles';

/** Bir mech'in parçalarının sanat ölçüleri (SVG piksel birimi = dünya birimi). */
export interface MechArt {
  /** Gövde (gövde merkezinde ortalı). */
  readonly hull: { readonly width: number; readonly height: number };
  /** Kalçanın gövde eksenindeki yeri (y, `MechConfig.trackOffset`tir). */
  readonly hipX: number;
  /** Uyluk ve baldır ŞERİTLERİ: başlangıç solda, orta çizgide; boy sanat boyudur, yürürken gerilir. */
  readonly thigh: { readonly length: number; readonly thickness: number };
  readonly shin: { readonly length: number; readonly thickness: number };
  /** Eklem diski (kalça, diz, bilek): kare kenarı. */
  readonly joint: number;
  /** Ayak: topuk solda; `ankleX` bileğin x'idir. */
  readonly foot: { readonly width: number; readonly height: number; readonly ankleX: number };
  /**
   * Yürüyüş yerleşimi. `footCenter` ayak adımının merkezinin kalçadan ileriye uzaklığıdır; `kneeOut` diz
   * kalça-ayak doğrusundan dışa ne kadar bükülür (ayak kalçanın altındayken en çok); `footOut` ayak
   * havadayken dışa açılması; `lift` havadaki ayağın büyümesi (perspektif).
   */
  readonly gait: {
    readonly footCenter: number;
    readonly kneeOut: number;
    readonly footOut: number;
    readonly lift: number;
  };
  /** Silah kolu: resim boyu ve milin yeri (dikey konum hep ortadır); namlu ucu `pivotX + reach`tir. */
  readonly arm: { readonly width: number; readonly height: number; readonly pivotX: number };
  /** Kolun zeminden yüksekliği: gölge kaymasını belirler. */
  readonly armHeight: number;
  /** Enerji kimliği: ağız parlaması, çekirdek ışığı ve toz kıvılcımı bu tondadır. */
  readonly glow: number;
  readonly flashScale: number;
  /** Atışta kolun geri kayışı (vuruş, sertlik, sönüm, azami geri kayma). */
  readonly recoil: SpringConfig & { readonly kick: number; readonly max: number };
  /** Gövdedeki reaktör ışığı: gövde-yerel konum; mech'te duyarga yoktur (çekirdek yeterlidir). */
  readonly core: SensorArt['core'];
  /** Gövdenin ağırlığı: ayak basışında gövde çöker (vuruş) ve yaylanır. */
  readonly weight: { readonly kick: number; readonly dip: number };
}

export const MECH_ART: Readonly<Record<MechId, MechArt>> = {
  warhound: {
    hull: { width: 44, height: 30 },
    hipX: -8,
    thigh: { length: 12, thickness: 6.6 },
    shin: { length: 12, thickness: 6 },
    joint: 8.98,
    foot: { width: 15, height: 9.4, ankleX: 5.2 },
    gait: { footCenter: 14, kneeOut: 5, footOut: 2, lift: 0.16 },
    arm: { width: 27, height: 10, pivotX: 5.8 },
    armHeight: 14,
    glow: 0xffe45e,
    flashScale: 0.85,
    recoil: { kick: -150, stiffness: 560, damping: 22, max: 3 },
    core: { x: -6, y: 0, scale: 0.55, tint: 0xffe45e },
    weight: { kick: 6, dip: 0.012 },
  },
  templar: {
    hull: { width: 50, height: 40 },
    hipX: -12,
    thigh: { length: 16, thickness: 8.6 },
    shin: { length: 16, thickness: 8 },
    joint: 11.7,
    foot: { width: 19, height: 12.4, ankleX: 6.6 },
    gait: { footCenter: 17, kneeOut: 6, footOut: 2.4, lift: 0.14 },
    arm: { width: 35, height: 14, pivotX: 6 },
    armHeight: 17,
    glow: 0xff7ad9,
    flashScale: 0.8,
    recoil: { kick: -90, stiffness: 700, damping: 26, max: 2.2 },
    core: { x: -10, y: 0, scale: 0.7, tint: 0xff7ad9 },
    weight: { kick: 9, dip: 0.014 },
  },
  juggernaut: {
    hull: { width: 78, height: 58 },
    hipX: -17,
    thigh: { length: 24, thickness: 13 },
    shin: { length: 24, thickness: 12 },
    joint: 17.7,
    foot: { width: 28, height: 18.4, ankleX: 9.4 },
    gait: { footCenter: 26, kneeOut: 8, footOut: 3.2, lift: 0.12 },
    arm: { width: 59, height: 18, pivotX: 14 },
    armHeight: 26,
    glow: 0xffd0a0,
    flashScale: 1.25,
    recoil: { kick: -240, stiffness: 420, damping: 15, max: 6 },
    core: { x: -26, y: 0, scale: 1.0, tint: 0xffd0a0 },
    weight: { kick: 16, dip: 0.02 },
  },
};

export const MECH_VIEW = {
  depth: 10,
  /** Gövdenin gölgesini veren yükseklik (dünya birimi): bacaklar yerde, gövde bacakların üstündedir. */
  shadowHeight: 14,
  shadowAlpha: 0.3,
  /** Ağırlığın yayı: ayak basışı gövdeyi çökertir, yay toparlar. */
  weightSpring: { stiffness: 260, damping: 13 } satisfies SpringConfig,
  /** Ağırlık aktarımı: gövdenin yük bindiği ayağa kayması (dünya birimi) ve yatışı (rad). */
  sway: { px: 1.8, roll: 0.025 },
  /** Boşta ayakların yan yana dizildiği süre sabiti (ms) ve bu hızın altı boşta sayılır (birim/s). */
  settle: { tauMs: 130, idleSpeed: 10, idleTurn: 0.25 },
  /** Atılımda (koşu) adım yüksekliği ve gövdenin öne yaslanması. */
  dash: { liftGain: 1.5, lean: 2.4 },
  /** Kırık bacağın kütüğü: koyu, kısa, yarı saydam; gövdenin o yana çökmesi (dünya birimi). */
  stub: { tint: 0x2b2326, length: 0.5, alpha: 0.92, sag: 4.2, roll: 0.16 },
  flashMs: 70,
  dust: {
    emitter: {
      speed: { min: 6, max: 26 },
      lifespan: { min: 380, max: 800 },
      scale: { start: 0.28, end: 1.1 },
      alpha: { start: 0.34, end: 0 },
      emitting: false,
    },
    depth: 7,
    /** Basış başına toz sayısı (hızla artar). */
    countMin: 1,
    countMax: 4,
  },
} as const;
