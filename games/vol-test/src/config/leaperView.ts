import type { SpringConfig } from '@volstudio/core/math';
import type { SensorArt } from './sensors';
import type { LeaperId } from './vehicles';

/** Bir sıçrayıcının parçalarının sanat ölçüleri (SVG piksel birimi = dünya birimi). */
export interface LeaperArt {
  /** Gövde (gövde merkezinde ortalı). */
  readonly hull: { readonly width: number; readonly height: number };
  /** Kalçaların gövde eksenindeki yeri: ön ve arka bacak çifti (y, `LeaperConfig.trackOffset`tir). */
  readonly hips: { readonly front: number; readonly rear: number };
  /** Uyluk ve baldır ŞERİTLERİ: başlangıç solda, orta çizgide; boy sanat boyudur, yürürken gerilir. */
  readonly thigh: { readonly length: number; readonly thickness: number };
  readonly shin: { readonly length: number; readonly thickness: number };
  /** Eklem diski (kalça, diz, bilek): kare kenarı. */
  readonly joint: number;
  /** Pençe: topuk solda; `ankleX` bileğin x'idir. */
  readonly foot: { readonly width: number; readonly height: number; readonly ankleX: number };
  /**
   * Yürüyüş yerleşimi. `footFront`/`footRear` ayak adımının merkezinin kendi kalçasından ileriye
   * uzaklığıdır; `kneeOut` diz kalça-ayak doğrusundan dışa ne kadar bükülür; `kneeShift` dizin gövde
   * ekseninde kayması (ön bacakta geriye, arka bacakta ileriye: hayvan dizi); `footOut` ayak havadayken
   * dışa açılması; `lift` havadaki ayağın büyümesi; `leapReach` sıçramada ön ayağın öne, arka ayağın
   * arkaya uzanması.
   */
  readonly gait: {
    readonly footFront: number;
    readonly footRear: number;
    /** Ayakların duruşta gövdeden dışa açıklığı (dünya birimi): bacaklar yana açık basar. */
    readonly splay: number;
    readonly kneeOut: number;
    readonly kneeShift: number;
    readonly footOut: number;
    readonly lift: number;
    readonly leapReach: number;
  };
  /** Silah yuvası: resim boyu ve milin yeri (dikey konum hep ortadır); namlu ucu `pivotX + reach`tir. */
  readonly arm: { readonly width: number; readonly height: number; readonly pivotX: number };
  /** Enerji kimliği: ağız parlaması, çekirdek ışığı, itici alevi ve toz kıvılcımı bu tondadır. */
  readonly glow: number;
  readonly flashScale: number;
  /** Atışta silahın geri kayışı (vuruş, sertlik, sönüm, azami geri kayma). */
  readonly recoil: SpringConfig & { readonly kick: number; readonly max: number };
  /** Gövdedeki reaktör ışığı: gövde-yerel konum (duyarga yoktur, çekirdek yeterlidir). */
  readonly core: SensorArt['core'];
  /** Gövdenin ağırlığı: sekmede gövde çöker (vuruş) ve yaylanır. */
  readonly weight: { readonly kick: number; readonly dip: number };
  /** Arka sıçrama iticileri: gövde-yerel çıkış noktaları ve alev ölçeği (sıçrama başında çakar). */
  readonly thrusters: readonly { readonly x: number; readonly y: number }[];
  readonly flame: number;
}

export const LEAPER_ART: Readonly<Record<LeaperId, LeaperArt>> = {
  jackal: {
    hull: { width: 50, height: 28 },
    hips: { front: 11, rear: -12 },
    thigh: { length: 11, thickness: 5.6 },
    shin: { length: 12, thickness: 4.8 },
    joint: 6.9,
    foot: { width: 11.5, height: 7.6, ankleX: 3.4 },
    gait: {
      footFront: 10,
      footRear: 2,
      splay: 7,
      kneeOut: 4.4,
      kneeShift: 2.2,
      footOut: 1.8,
      lift: 0.18,
      leapReach: 11,
    },
    arm: { width: 23, height: 11, pivotX: 5.6 },
    glow: 0xb7ff5e,
    flashScale: 0.85,
    recoil: { kick: -120, stiffness: 520, damping: 22, max: 2.6 },
    core: { x: -4, y: 0, scale: 0.5, tint: 0xb7ff5e },
    weight: { kick: 5, dip: 0.012 },
    thrusters: [
      { x: -22, y: -4.6 },
      { x: -22, y: 4.6 },
    ],
    flame: 0.9,
  },
  panther: {
    hull: { width: 60, height: 34 },
    hips: { front: 14, rear: -14 },
    thigh: { length: 14, thickness: 6.8 },
    shin: { length: 15, thickness: 5.8 },
    joint: 8.4,
    foot: { width: 13.5, height: 9.2, ankleX: 4.2 },
    gait: {
      footFront: 12,
      footRear: 2,
      splay: 8,
      kneeOut: 5.4,
      kneeShift: 2.6,
      footOut: 2.2,
      lift: 0.16,
      leapReach: 13,
    },
    arm: { width: 46, height: 11, pivotX: 7 },
    glow: 0xff5a3c,
    flashScale: 1,
    recoil: { kick: -200, stiffness: 520, damping: 20, max: 4 },
    core: { x: -6, y: 0, scale: 0.6, tint: 0xff5a3c },
    weight: { kick: 7, dip: 0.013 },
    thrusters: [
      { x: -27, y: -5.6 },
      { x: -27, y: 5.6 },
    ],
    flame: 1.1,
  },
  rhino: {
    hull: { width: 82, height: 52 },
    hips: { front: 21, rear: -20 },
    thigh: { length: 22, thickness: 11 },
    shin: { length: 23, thickness: 9.6 },
    joint: 13.6,
    foot: { width: 22, height: 15, ankleX: 7 },
    gait: {
      footFront: 18,
      footRear: 3,
      splay: 13,
      kneeOut: 8,
      kneeShift: 4,
      footOut: 3.4,
      lift: 0.12,
      leapReach: 20,
    },
    arm: { width: 55, height: 18, pivotX: 10 },
    glow: 0x5ef0ff,
    flashScale: 1.3,
    recoil: { kick: -260, stiffness: 400, damping: 15, max: 7 },
    core: { x: -2, y: 0, scale: 0.95, tint: 0x5ef0ff },
    weight: { kick: 15, dip: 0.02 },
    thrusters: [
      { x: -37, y: -11.6 },
      { x: -37, y: 0 },
      { x: -37, y: 11.6 },
    ],
    flame: 1.5,
  },
};

export const LEAPER_VIEW = {
  depth: 10,
  /** Gövdenin gölgesini veren yükseklik (dünya birimi): bacaklar yerde, gövde bacakların üstündedir. */
  shadowHeight: 12,
  shadowAlpha: 0.3,
  /** Sekmenin yayı: ayak basışı gövdeyi çökertir, yay toparlar. */
  weightSpring: { stiffness: 280, damping: 13 } satisfies SpringConfig,
  /** Ağırlık aktarımı: gövdenin yük bindiği ayağa kayması (dünya birimi) ve yatışı (rad). */
  sway: { px: 1.3, roll: 0.02 },
  /** Boşta ayakların oturduğu süre sabiti (ms) ve bu hızın altı boşta sayılır (birim/s). */
  settle: { tauMs: 120, idleSpeed: 12, idleTurn: 0.3 },
  /** Bir bacak çiftinin diğerine fazı ve sol/sağ bacağın sekmedeki küçük gecikmesi (gait çevrimi). */
  bound: { pairOffset: 0.5, sideLag: 0.1 },
  /**
   * Sekmenin gövdeye yansıması: koşuda gövde ileri-geri savrulur (`surge`, dünya birimi) ve her
   * sekmede iki kez hafifçe yükselir (`bob`, ölçek oranı); ikisi de hızla ölçeklenir.
   */
  stride: { surge: 1.5, bob: 0.032 },
  /**
   * Dönüşün yükü (`turn` = açısal hız / tavan, hızla ağırlaşır): gövde dönüşün dışına kayar (`shift`,
   * dünya birimi) ve ağırlığı arkadan gelir (`twist`, rad; yay aşımı dönüş bitince sallanır); iç
   * bacaklar daha yüksek kalkar (`lift`) ve sert dönüşte basış tozu artar (`dust`).
   */
  turn: {
    shift: 2.6,
    twist: 0.2,
    lift: 0.55,
    dust: 2,
    spring: { stiffness: 150, damping: 9 } satisfies SpringConfig,
  },
  /**
   * Sıçrama: gövdenin tepe noktasında büyümesi (perspektif), gölgenin ek yüksekliği, bacakların
   * toplanıp uzanma süresi, itici alevinin ömrü ve iniş çöküşü.
   */
  leap: {
    rise: 0.16,
    shadowLift: 26,
    poseMs: 90,
    flameMs: 240,
    landKick: 1.8,
    landDust: 7,
    pawsDust: 3,
  },
  /** Kırık bacağın kütüğü: koyu, kısa, yarı saydam; gövdenin o yana çökmesi (dünya birimi). */
  stub: { tint: 0x2b2326, length: 0.5, alpha: 0.92, sag: 3.4, roll: 0.14 },
  flashMs: 70,
  dust: {
    emitter: {
      speed: { min: 6, max: 30 },
      lifespan: { min: 340, max: 760 },
      scale: { start: 0.26, end: 1 },
      alpha: { start: 0.34, end: 0 },
      emitting: false,
    },
    depth: 7,
    /** Sekme başına toz sayısı (hızla artar). */
    countMin: 1,
    countMax: 3,
  },
} as const;
