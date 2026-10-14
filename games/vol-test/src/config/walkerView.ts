import { PALETTE } from './palette';
import { ARACHNID } from './vehicles';

/**
 * Arachnid'in sunumu. Sanat piksel uzayında çizilir (gövde kabuğu 140 px); dünyaya
 * `WALKER_ART.scale` ile ölçeklenir. Yürüyüş, bacak IK'sı ve ikincil hareket sanat uzayında
 * çalışır: tüm piksel değerleri bu uzaydadır.
 */
export const WALKER_ART = {
  /** Sanat pikselinin dünya birimi karşılığı: kabuk ≈ 48 birim, bacak açıklığı ≈ 120 birim. */
  scale: 0.34,
  /**
   * Silah yuvası resminin ölçeği (plazma topu 80 px uzunlukta çizilmiştir). Ağız, yuva milinden
   * `CANNON_MUZZLE_PX` piksel ileridedir; `ARACHNID` yuvalarının `reach` değeri bunun ürünüdür.
   */
  cannonScale: 0.4,
  /** Gölge ışığın tersine düşer; biçimi parçaların pozundan gelir (CORE `PoseShadow`). */
  shadow: { offsetX: 2.5, offsetY: 3.5, alpha: 0.22, depth: 9 },
  depth: 10,
} as const;

/** Sanat piksel uzayından dünya birimine ve geri. */
export const ART_TO_WORLD = WALKER_ART.scale;
/** Plazma topunun ağız ucu, yuva milinden top yerel pikseli cinsinden uzaklığı (`muzzle_prong_u` ucu). */
export const CANNON_MUZZLE_PX = 48;
export const WORLD_TO_ART = 1 / WALKER_ART.scale;

export interface LimbStance {
  /** İleri eksenden duruş açısı (derece); + sağ, − sol. */
  angleDeg: number;
  /**
   * Sabit kök kemiğin ayak yönüne yapışma oranı [0,1]; yalnız kök kemiği IK dışında tutulan
   * uzuvlarda anlamlıdır. 0 kökü duruşa çivileyip işi alt kemiklere bırakır, 1 kökü ayağa kilitler.
   */
  rootFollow?: number;
  /** Kök kemiğin duruş açısından sapabileceği en büyük değer (derece). */
  rootYawLimitDeg?: number;
  /** Uzvun tam uzanımına oran olarak kalça–ayak mesafesi. */
  reach: number;
  /**
   * Uzvun katlanabileceği en kısa kalça–ayak mesafesi (aynı orana göre). Eklemli bir bacak tamamen
   * katlanamaz; sınır uzuv boyuna orantılı olmalı, sabit bir piksel kelepçesi ayağı kalçanın
   * dibine çekip uzvu keskin bir V'ye katlar.
   */
  minReach: number;
  /** Dizin büküleceği taraf (+1/−1): ön uzuvlarda diz öne, arka uzuvlarda arkaya taşar. */
  bendSign: number;
  /** Eşzamanlı adım grubu; komşu ve karşı uzuvlar zıt gruptadır. */
  group: number;
  /** Uzuv sıra bekler mi? Kısa itici uzuvlar gövdeyi taşımaz, sıraya sokulmaları onları sürükler. */
  freeStep: boolean;
  /** Adım ölçeği: tetik, acil eşik ve öngörü payı bununla çarpılır; kısa uzuv kısa adım atar. */
  strideScale: number;
  /** Atılım sırasında duruş açısına eklenen değer (derece). */
  dashAngleDeltaDeg: number;
  /** Atılım sırasında erişime eklenen oran. */
  dashReachDelta: number;
  /** Yürüyüş hızıyla ölçeklenen geri itiş: arka uzuvlar hız arttıkça daha geriye basar. */
  pushReachGain: number;
}

/** Kısa kök kemik IK dışında tutulur; iş uzun femur/tibia'dadır. */
const LEG_ROOT = {
  rootFollow: 0.6,
  rootYawLimitDeg: 42,
  strideScale: 1,
  freeStep: false,
} as const;

/**
 * Duruş kaynak pozdan türetilmez: export'ta her uzuv düz bir çizgidir ve dizilim parçaları
 * okunur biçimde yan yana dizmek içindir. Açılar ileri eksenden ölçülür (0° ileri, +90° sağ,
 * 180° arka); `r3/l3` ön, `r0/l0` arka bacaklardır, kaynak metadata'da kalça y'si öne doğru azalır.
 */
const STANCE: Readonly<Record<string, LimbStance>> = {
  r3: {
    ...LEG_ROOT,
    angleDeg: 45,
    reach: 0.72,
    minReach: 0.55,
    bendSign: -1,
    group: 0,
    dashAngleDeltaDeg: -16,
    dashReachDelta: 0.1,
    pushReachGain: 0,
  },
  l3: {
    ...LEG_ROOT,
    angleDeg: -45,
    reach: 0.72,
    minReach: 0.55,
    bendSign: 1,
    group: 1,
    dashAngleDeltaDeg: 16,
    dashReachDelta: 0.1,
    pushReachGain: 0,
  },
  r2: {
    ...LEG_ROOT,
    angleDeg: 80,
    reach: 0.72,
    minReach: 0.55,
    bendSign: -1,
    group: 1,
    dashAngleDeltaDeg: -8,
    dashReachDelta: 0.05,
    pushReachGain: 0,
  },
  l2: {
    ...LEG_ROOT,
    angleDeg: -80,
    reach: 0.72,
    minReach: 0.55,
    bendSign: 1,
    group: 0,
    dashAngleDeltaDeg: 8,
    dashReachDelta: 0.05,
    pushReachGain: 0,
  },
  r1: {
    ...LEG_ROOT,
    angleDeg: 115,
    reach: 0.72,
    minReach: 0.55,
    bendSign: 1,
    group: 0,
    dashAngleDeltaDeg: 6,
    dashReachDelta: -0.02,
    pushReachGain: 0.03,
  },
  l1: {
    ...LEG_ROOT,
    angleDeg: -115,
    reach: 0.72,
    minReach: 0.55,
    bendSign: -1,
    group: 1,
    dashAngleDeltaDeg: -6,
    dashReachDelta: -0.02,
    pushReachGain: 0.03,
  },
  r0: {
    ...LEG_ROOT,
    angleDeg: 148,
    reach: 0.72,
    minReach: 0.55,
    bendSign: 1,
    group: 1,
    dashAngleDeltaDeg: 9,
    dashReachDelta: -0.04,
    pushReachGain: 0.05,
  },
  l0: {
    ...LEG_ROOT,
    angleDeg: -148,
    reach: 0.72,
    minReach: 0.55,
    bendSign: -1,
    group: 0,
    dashAngleDeltaDeg: -9,
    dashReachDelta: -0.04,
    pushReachGain: 0.05,
  },
  /*
   * Kısa arka itici uzuvlar (kuyruk). Kaynak pozda birbirini keserler; duruş açıları kesişmeyi
   * çözer. Erişimleri bacaklardan yüksektir: uzuv yalnız 88 px ve kalçası kabuğun içinde, daha
   * kısa erişimde tamamı kabuğun altında kalıp dışarıda çıkıntı gibi okunur.
   */
  tr: {
    angleDeg: 168,
    reach: 0.68,
    minReach: 0.32,
    strideScale: 0.55,
    freeStep: true,
    bendSign: -1,
    group: 0,
    dashAngleDeltaDeg: 11,
    dashReachDelta: 0.04,
    pushReachGain: 0.03,
  },
  tl: {
    angleDeg: -168,
    reach: 0.68,
    minReach: 0.32,
    strideScale: 0.55,
    freeStep: true,
    bendSign: 1,
    group: 1,
    dashAngleDeltaDeg: -11,
    dashReachDelta: 0.04,
    pushReachGain: 0.03,
  },
};

export const GAIT = {
  stance: STANCE,
  stepTriggerPx: 26,
  runStepTriggerPx: 38,
  stepDurationMs: 205,
  /**
   * Tam tempoda adım süresi. Yürüyüş döngüsünün kapasitesi bununla belirlenir: 128 ms'de ~215 px/s'nin
   * üstünde arka bacaklar tam gerili sürüklenir (ölçüm: tavan hızında %39); 80 ms'de %8'e iner.
   */
  runStepDurationMs: 80,
  /**
   * Sıra disiplinini delen gerginlik. Normal yürüyüşün üstünde seçilir: bekleyen bir uzvun en
   * kötü gerginliği tetik + sıra boyunca kat edilen yoldur (~93 px altına inerse sıra düz
   * yürüyüşte delinir). Bacağın değil gövdenin ölçüsüdür, `strideScale` ile ölçeklenmez.
   */
  emergencyStrainPx: 100,
  /** Denge payının 1'e ulaştığı kenar mesafesi (sanat px): ayaklar gövdeden ~120 px uzakta durur. */
  supportSafeMarginPx: 60,
  /** Bu hızda koşu adımının tam tempo değerleri kullanılır: yürüyüş tavanı. */
  fullTempoSpeedPxPerSec: ARACHNID.walker.maxSpeed * WORLD_TO_ART,
  /** Adım hedefini hız yönünde ileri koyar; ayak gideceği yere basar. */
  stepLeadSeconds: 0.13,
  /** Adım havadayken ayağı kalçaya doğru kısaltır: diz bükülür, uzuv yerden çekilmiş görünür. */
  swingTuckPx: 20,
  /** Duvara çarpmada ayağın kalçaya doğru çekildiği mesafe (poza uygulanır, eve değil). */
  impactTuckPx: 16,
  /** Pençenin (bilek) havadayken kıvrılması ve yerdeyken düzelmesi (derece). */
  clawLiftCurlDeg: 14,
  clawPlantedCurlDeg: -4,
  /** Çömelme uzuvları gövdeye çeker; aşırısı üstten bakışı bozar. */
  crouchReachDrop: 0.075,
} as const;

/**
 * Gövde kabuğunun uzuvlara göre ikincil hareketi. Sinyaller ham girdiden değil gövdenin gerçek
 * durumundan (hız, ivme, dönüş hızı) türetilir: ham girdiyle sürülen kabuk atılım gibi girdisiz
 * hareketlerde ölü kalır ve duvara çarpınca hiç tepki vermez.
 */
export const BODY_MOTION = {
  idlePhaseSpeedDegPerSec: 135,
  transformSpring: { stiffness: 95, damping: 16 },
  idleSwayPx: 0.8,
  walkSwayPx: 2.2,
  turnSwayPx: 3.4,
  walkRollDeg: 0.8,
  turnRollDeg: 3,
  turnVelocityForMaxRadPerSec: ARACHNID.walker.maxTurnRate,

  /** Gövde ivmenin tersine kayar: kalkışta geriye, frende öne. */
  leanSpring: { stiffness: 78, damping: 13 },
  leanPxPerAccelUnit: 5.2,
  accelForMaxLeanPxPerSec2: ARACHNID.walker.acceleration * WORLD_TO_ART * 0.35,
  maxLeanPx: 9,

  /** Üstten bakışta alçalma ölçekle okunur; abartılırsa 2B düzlem bozulur. */
  crouchSpring: { stiffness: 46, damping: 8.5 },
  crouchBodyScaleDrop: 0.035,
  /** Bu hızda çömelme tamamen açılır (sanat px/s): tavanın %60'ı. */
  standSpeedPxPerSec: ARACHNID.walker.maxSpeed * WORLD_TO_ART * 0.6,

  /** Atılımda gövde hareket ekseninde uzar, dikine incelir. */
  dashStretch: 0.075,
  dashStretchSpring: { stiffness: 150, damping: 15 },

  /** Uç parçalar dönüşe önden yatar; birebir dönerlerse yaratık levha gibi okunur. */
  snoutLeadSpring: { stiffness: 130, damping: 14 },
  snoutLeadDegPerRadPerSec: 3.6,
  maxSnoutLeadDeg: 13,

  /** Bakış: `core_ring` yuvasının içinde kalan sıçramalı taramalar. */
  gaze: {
    radiusPx: 7.5,
    holdMsMin: 420,
    holdMsMax: 1450,
    saccadeMs: 85,
    /** Avlanma hissi: tetikteyken bekleme bu oranda kısalır. */
    alertHoldScale: 0.34,
    /** Bakış açısının parçaya yansıyan kısmı (derece / tam yarıçap). */
    slitTiltDeg: 9,
    /** Bu hızda uyanıklık tamamlanır (sanat px/s): tavanın %75'i. */
    alertSpeedPxPerSec: ARACHNID.walker.maxSpeed * WORLD_TO_ART * 0.75,
  },
  /** Atılım pürüzsüzleştirme: boost bayrağından yumuşak şiddete. */
  dashSpring: { stiffness: 170, damping: 20 },
  /**
   * Çarpma yankısının sönme süresi. Kısa tutulur: darbe bir çöküştür, duruş değil; uzun bir
   * sönme yaratığı çarpmadan sonra saniyelerce çömelmiş bırakırdı.
   */
  impactFalloffMs: 260,
} as const;

/**
 * Bir kareden ötekine bu kadar uzağa giden araç ışınlanmıştır (yeniden doğuş): bacaklar adım
 * atarak değil gövdenin altına oturarak karşılar. Azami tam hızın bir karede alacağı yolun çok üstü.
 */
export const TELEPORT_UNITS = 160;

/** Ayak basışında kalkan toz: araç arkasındaki sürekli tozdan ayrı, adım başına bir tutam. */
export const FOOTFALL_DUST = {
  emitter: {
    speed: { min: 6, max: 26 },
    lifespan: { min: 380, max: 680 },
    scale: { start: 0.3, end: 0.95 },
    alpha: { start: 0.2, end: 0 },
    tint: PALETTE.dust,
    emitting: false,
  },
  depth: 7,
  /** Basış başına parçacık: yavaş yürüyüşte seyrek, tam tempoda dolgun. */
  countMin: 1,
  countMax: 3,
} as const;

/** Plazma topunun sunumu. */
export const CANNON_VIEW = {
  /** Atışta namlu çubuğunun geri tepme yayı (sanat px): vuruş, sertlik, sönüm ve azami geri kayma. */
  recoil: { kick: -520, stiffness: 380, damping: 19, max: 7 },
  /** Gövde parçasının atış anında geri sarsılması (sanat px). */
  housingKick: { kick: -90, stiffness: 520, damping: 26, max: 2 },
  flashMs: 80,
  /** Ağız parlaması boyutu (ışık dokusu 64 px): boyuna uzar, enine daralır. */
  flashScale: 1.1,
  flashLengthScale: 0.42,
  flashWidthScale: 0.25,
  /** Isınma ışığı çapları (top yerel pikseli): mercek ve ağız yarığı. */
  lensGlowPx: 20,
  slitGlowPx: 16,
  /** Mermi rengi; ağız parlaması ve ısınma ışığı bu renkle çizilir. */
  glow: 0x52f5cf,
  /** Atış sonrası ısınma ışığının sönme süresi. */
  heatMs: 520,
} as const;
