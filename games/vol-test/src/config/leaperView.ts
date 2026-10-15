import type { SpringConfig } from '@volstudio/core/math';
import type { SensorArt } from './sensors';
import type { LeaperId } from './vehicles';

/** Bir sıçrayıcının parçalarının sanat ölçüleri (SVG piksel birimi = dünya birimi). */
export interface LeaperArt {
  /** Gövde (gövde merkezinde ortalı). */
  readonly hull: { readonly width: number; readonly height: number };
  /**
   * Kafa: boyun ekseni `(x, y)` gövde-yerel, `pivotX` resmin solundan boyuna uzaklık. Nişana `follow`
   * oranında bakar, en çok `yaw` rad döner; sıçramada `reach` birim öne uzanır. `over` kafa silahların
   * üstünde çizilir (omuz silahlı Jackal ve Rhino); değilse silah kafanın üstünden geçer (sırt raylı Panther).
   */
  readonly head: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly pivotX: number;
    readonly yaw: number;
    readonly follow: number;
    readonly reach: number;
    readonly over: boolean;
  };
  /**
   * Kuyruk: kök `(x, y)` gövde-yerel, resim kökten geriye uzanır. Dönüşte yayla savrulur (en çok `swing` rad),
   * koşuda sekmeyle kıvrılır, sıçramada düz uzanır, inişte kırbaç atar.
   */
  readonly tail: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly swing: number;
  };
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
    hull: { width: 44, height: 24 },
    head: {
      x: 10,
      y: 0,
      width: 22,
      height: 28,
      pivotX: 6,
      yaw: 0.55,
      follow: 0.65,
      reach: 2.2,
      over: true,
    },
    tail: { x: -21.6, y: 0, width: 17, height: 7, swing: 0.5 },
    hips: { front: 5, rear: -15 },
    thigh: { length: 12, thickness: 5.2 },
    shin: { length: 16, thickness: 3.6 },
    joint: 5.8,
    foot: { width: 10.5, height: 7, ankleX: 3.2 },
    gait: {
      footFront: 9,
      footRear: 1,
      splay: 6,
      kneeOut: 4.4,
      kneeShift: 2.4,
      footOut: 1.8,
      lift: 0.18,
      leapReach: 12,
    },
    arm: { width: 23, height: 11, pivotX: 5.6 },
    glow: 0xb7ff5e,
    flashScale: 0.85,
    recoil: { kick: -120, stiffness: 520, damping: 22, max: 2.6 },
    core: { x: -5, y: 0, scale: 0.5, tint: 0xb7ff5e },
    weight: { kick: 5, dip: 0.012 },
    thrusters: [
      { x: -20, y: -5 },
      { x: -20, y: 5 },
    ],
    flame: 0.9,
  },
  panther: {
    hull: { width: 50, height: 26 },
    head: {
      x: 13,
      y: 0,
      width: 25,
      height: 21,
      pivotX: 4,
      yaw: 0.5,
      follow: 0.6,
      reach: 2.6,
      over: false,
    },
    tail: { x: -24.8, y: 0, width: 29, height: 9, swing: 0.38 },
    hips: { front: 8, rear: -17 },
    thigh: { length: 14, thickness: 6.2 },
    shin: { length: 19, thickness: 4.4 },
    joint: 7,
    foot: { width: 13.5, height: 8.6, ankleX: 4 },
    gait: {
      footFront: 11,
      footRear: 1,
      splay: 7,
      kneeOut: 5.2,
      kneeShift: 2.8,
      footOut: 2.2,
      lift: 0.16,
      leapReach: 14,
    },
    arm: { width: 46, height: 11, pivotX: 7 },
    glow: 0xff5a3c,
    flashScale: 1,
    recoil: { kick: -200, stiffness: 520, damping: 20, max: 4 },
    core: { x: -6, y: 0, scale: 0.6, tint: 0xff5a3c },
    weight: { kick: 7, dip: 0.013 },
    thrusters: [
      { x: -23.2, y: -5.6 },
      { x: -23.2, y: 5.6 },
    ],
    flame: 1.1,
  },
  rhino: {
    hull: { width: 68, height: 54 },
    head: {
      x: 25,
      y: 0,
      width: 27,
      height: 24,
      pivotX: 5,
      yaw: 0.34,
      follow: 0.5,
      reach: 3,
      over: true,
    },
    tail: { x: -33.8, y: 0, width: 18, height: 11, swing: 0.22 },
    hips: { front: 18, rear: -22 },
    thigh: { length: 22, thickness: 11 },
    shin: { length: 22, thickness: 8.2 },
    joint: 13.6,
    foot: { width: 20, height: 15, ankleX: 6.5 },
    gait: {
      footFront: 15,
      footRear: 2,
      splay: 12,
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
    core: { x: -4, y: 0, scale: 0.95, tint: 0x5ef0ff },
    weight: { kick: 15, dip: 0.02 },
    thrusters: [
      { x: -33, y: -11.6 },
      { x: -33, y: 0 },
      { x: -33, y: 11.6 },
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
  /**
   * Kafa ve kuyruk yayları. Kafa nişana bakarken `spring` ile oturur; sıçramada ileri uzanır, inişte
   * ağırlıkla birlikte çöker. Kuyruk gevşek bir yaydır: dönüşün dışına savrulur (`swing`), koşuda sekmeyle
   * kıvrılır (`stride`), sıçramada düz uzanır ve inişte kırbaç atar (`whip`).
   */
  head: { spring: { stiffness: 220, damping: 16 } satisfies SpringConfig, dip: 0.6 },
  tail: {
    spring: { stiffness: 70, damping: 5 } satisfies SpringConfig,
    stride: 0.2,
    whip: 7,
    lift: 0.12,
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
