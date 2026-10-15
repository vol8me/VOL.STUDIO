import {
  SUSPENSION,
  TANK,
  WEAPON,
  type SuspensionConfig,
  type TankConfig,
  type WeaponConfig,
} from './tank';
import { HOVER, type HoverConfig } from './hover';
import { MECH, type MechConfig } from './mech';
import { WALKER, type WalkerConfig } from './walker';

/** Paletli araçlar. */
export const TANK_IDS = ['striker', 'bulwark', 'dart'] as const;
export type TankId = (typeof TANK_IDS)[number];

/** Bacaklı yürüyücüler. */
export const WALKER_IDS = ['arachnid', 'widow', 'goliath'] as const;
export type WalkerId = (typeof WALKER_IDS)[number];

/** Süzülen araçlar. */
export const HOVER_IDS = ['manta', 'barracuda', 'leviathan'] as const;
export type HoverId = (typeof HOVER_IDS)[number];

/** İki bacaklı savaş robotları (mech). */
export const MECH_IDS = ['warhound', 'templar', 'juggernaut'] as const;
export type MechId = (typeof MECH_IDS)[number];

/** Seçilebilir araçlar; sıra ağ protokolündeki `model` indeksidir, sona eklenir ve yeniden sıralanmaz. */
export const VEHICLE_IDS = [
  'striker',
  'bulwark',
  'dart',
  'arachnid',
  'widow',
  'goliath',
  'manta',
  'barracuda',
  'leviathan',
  'warhound',
  'templar',
  'juggernaut',
] as const satisfies readonly [
  ...typeof TANK_IDS,
  ...typeof WALKER_IDS,
  ...typeof HOVER_IDS,
  ...typeof MECH_IDS,
];
export type VehicleId = (typeof VEHICLE_IDS)[number];

/** Bir aracın en çok taşıyabileceği namlu: atış arabellekleri ve ağ paketi bu tavana göre boyanır. */
export const MAX_MOUNTS = 4;

/**
 * Namlu yuvası. `x`/`y` gövde eksenindedir (x ileri, y sağ) ve süspansiyon kaymasıyla birlikte
 * gider; `reach` yuva milinden namlu ucuna mesafedir. Tek taretli tankta yuva taret milidir (0, 0).
 */
export interface MountSpec {
  readonly x: number;
  readonly y: number;
  readonly reach: number;
}

/** Gövde-yerel nokta (ileri x, sağ y). */
export interface BodyPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Araç silahlanması. `pivot` yoksa 0. yuva nişan taretidir: yönü komuttaki nişandır. Öteki yuvalar
 * nişan noktasına (0. yuvadan `toeInRange` ileride) bakar; böylece her yuvanın yönü yalnız poza
 * bağlıdır ve ağ üzerinde ek durum taşınmaz. `pivot` verilirse nişan başlangıcı odur ve bütün
 * yuvalar nişan noktasına bakar (simetrik yan toplar). `salvo` her tetik çekişinde ateşlenen yuva
 * gruplarıdır ve sırayla döner.
 */
export interface Armament {
  readonly weapon: WeaponConfig;
  readonly mounts: readonly MountSpec[];
  readonly pivot?: BodyPoint;
  readonly salvo: readonly (readonly number[])[];
  readonly toeInRange: number;
}

interface VehicleBase {
  readonly id: VehicleId;
  readonly health: number;
  readonly suspension: SuspensionConfig;
  readonly armament: Armament;
}

/** Paletli şasi tanımı. */
export interface TankSpec extends VehicleBase {
  readonly kind: 'tank';
  readonly id: TankId;
  readonly tank: TankConfig;
}

/** Bacaklı yürüyücü tanımı: her yöne yürür, gövdesi yürüdüğü yöne döner, birden çok silah yuvası taşır. */
export interface WalkerSpec extends VehicleBase {
  readonly kind: 'walker';
  readonly id: WalkerId;
  readonly walker: WalkerConfig;
}

/** Süzülen araç tanımı: iki yan itici üstünde kayar, gövdesi nişana bakar, tek taretli. */
export interface HoverSpec extends VehicleBase {
  readonly kind: 'hover';
  readonly id: HoverId;
  readonly hover: HoverConfig;
}

/**
 * İki bacaklı mech tanımı: gövdesi yürüdüğü yöne yavaş döner, ağır adımlar atar ve silah kolları
 * (`armament.mounts`) gövdeden bağımsız nişan alır; bacağı kopan topallar.
 */
export interface MechSpec extends VehicleBase {
  readonly kind: 'mech';
  readonly id: MechId;
  readonly mech: MechConfig;
}

export type VehicleSpec = TankSpec | WalkerSpec | HoverSpec | MechSpec;

/** Şasinin tüm türlerde ortak sayıları (gövde ayak izi, depo, taret hızı). */
export function chassisConfigOf(
  spec: VehicleSpec,
): WalkerConfig | HoverConfig | MechConfig | TankSpec['tank'] {
  switch (spec.kind) {
    case 'tank':
      return spec.tank;
    case 'walker':
      return spec.walker;
    case 'hover':
      return spec.hover;
    case 'mech':
      return spec.mech;
  }
}

/** Düz zeminde yürüyüş ya da sürüş tavanı (birim/s); atılım hariç. */
export function topSpeedOf(spec: VehicleSpec): number {
  return chassisConfigOf(spec).maxSpeed;
}

/** Striker: dengeli ana tank; öteki araçlar bundan türer. */
export const STRIKER: TankSpec = {
  kind: 'tank',
  id: 'striker',
  health: 130,
  tank: TANK,
  suspension: SUSPENSION,
  armament: {
    weapon: WEAPON,
    mounts: [{ x: 0, y: 0, reach: 29.4 }],
    salvo: [[0]],
    toeInRange: 480,
  },
};

/**
 * Bulwark: ağır kuşatma tankı. Yavaş ve yönü zor değişir, bir vuruşta çok can alır; gövdesi
 * hafif çarpmaları umursamaz ve geri tepme onu da sarsar.
 */
export const BULWARK: TankSpec = {
  kind: 'tank',
  id: 'bulwark',
  health: 175,
  tank: {
    ...TANK,
    mass: 2400,
    halfLength: 30,
    halfWidth: 25,
    trackOffset: 18.5,
    trackContactLength: 52,
    trackAcceleration: 950,
    engineBraking: 260,
    driveSlip: 24,
    brakeAcceleration: 3600,
    tractionFriction: 1.2,
    tractionKinetic: 0.75,
    enginePower: 1.6e7,
    boostPower: 1.8,
    maxSpeed: 158,
    reverseSpeed: 96,
    boostMultiplier: 1.35,
    maxTurnRate: 1.9,
    turnRateAtSpeed: 0.6,
    steerGain: 5,
    boostCapacity: 70,
    boostRegen: 14,
    boostRestart: 22,
    wallRestitution: 0.2,
    impactEventSpeed: 30,
    impactKick: 0.08,
    turretTurnRate: 3.2,
  },
  suspension: {
    ...SUSPENSION,
    frequency: 1.7,
    damping: 0.45,
    pitchPerAccel: 0.007,
    rollPerAccel: 0.006,
    maxOffset: 3,
  },
  armament: {
    weapon: {
      intervalMs: 1250,
      aimTolerance: 0.03,
      projectileSpeed: 860,
      projectileLifeMs: 1500,
      flight: { muzzleHeight: 28, launchSpeed: 110, gravity: 314, drag: 0.4, maxRange: 620 },
      recoilImpulse: 150000,
      hitImpulse: 170000,
      recoilKick: 60,
      damage: 62,
      style: 'slug',
    },
    mounts: [{ x: 0, y: 0, reach: 43 }],
    salvo: [[0]],
    toeInRange: 420,
  },
};

/**
 * Dart: hafif keşif tankı. Çok hızlı ve çevik, namlusu uzun menzilli raylı; tek isabeti zayıf
 * ama hızlı ateşler. Az can taşır, sert çarpmada sekip savrulur.
 */
export const DART: TankSpec = {
  kind: 'tank',
  id: 'dart',
  health: 90,
  tank: {
    ...TANK,
    mass: 650,
    halfLength: 21,
    halfWidth: 17,
    trackOffset: 12.5,
    trackContactLength: 34,
    trackAcceleration: 2300,
    engineBraking: 320,
    driveSlip: 32,
    brakeAcceleration: 4500,
    enginePower: 3.6e7,
    boostPower: 2.8,
    maxSpeed: 330,
    reverseSpeed: 190,
    boostMultiplier: 1.5,
    maxTurnRate: 4.4,
    turnRateAtSpeed: 0.5,
    steerGain: 7,
    steerAssist: 3,
    boostCapacity: 120,
    boostDrain: 38,
    boostRegen: 26,
    boostRestart: 14,
    wallRestitution: 0.45,
    impactEventSpeed: 22,
    impactKick: 0.16,
    turretTurnRate: 4.4,
  },
  suspension: {
    ...SUSPENSION,
    frequency: 3,
    damping: 0.3,
    pitchPerAccel: 0.016,
    rollPerAccel: 0.014,
  },
  armament: {
    weapon: {
      intervalMs: 380,
      aimTolerance: 0.02,
      projectileSpeed: 1300,
      projectileLifeMs: 1000,
      flight: { muzzleHeight: 20, launchSpeed: 60, gravity: 314, drag: 0.2, maxRange: 680 },
      recoilImpulse: 11000,
      hitImpulse: 22000,
      recoilKick: 22,
      damage: 22,
      style: 'rail',
    },
    mounts: [{ x: 0, y: 0, reach: 38 }],
    salvo: [[0]],
    toeInRange: 560,
  },
};

/**
 * Arachnid: bacaklı savaş canavarı, zırhlı bir tarantula. Her yöne çevik yürür, gövdesi yürüdüğü yöne döner ve
 * Space atılışıyla kısa sürede mesafe kapatır; iki plazma topu kabuğun ön omuzlarındadır (sırayla ateşler, gövde
 * ekseninde odaklanır) ve kabuğun orta hattını örtmez, toplar gövdeden bağımsız döner. Mil ve ağız
 * konumları `ARACHNID_LOOK` ile aynı çizimden gelir. Zırhı ağır tanklardan ince, çevikliği Striker'dan yüksektir.
 */
export const ARACHNID: WalkerSpec = {
  kind: 'walker',
  id: 'arachnid',
  health: 108,
  walker: { ...WALKER, maxSpeed: 162 },
  suspension: {
    ...SUSPENSION,
    frequency: 3.2,
    damping: 0.5,
    pitchPerAccel: 0.005,
    rollPerAccel: 0.005,
    maxOffset: 2.2,
    roughness: 0.2,
  },
  armament: {
    weapon: {
      // İki top sırayla ateşler: her top 940 ms'de bir atar, birleşik tempo 470 ms.
      intervalMs: 470,
      aimTolerance: 0.045,
      projectileSpeed: 820,
      projectileLifeMs: 1400,
      flight: { muzzleHeight: 26, launchSpeed: 80, gravity: 314, drag: 0.3, maxRange: 560 },
      recoilImpulse: 24000,
      hitImpulse: 52000,
      recoilKick: 26,
      damage: 21,
      style: 'plasma',
    },
    mounts: [
      { x: 22, y: -11, reach: 23 },
      { x: 22, y: 11, reach: 23 },
    ],
    pivot: { x: 22, y: 0 },
    salvo: [[0], [1]],
    toeInRange: 460,
  },
};

/**
 * Widow: yüksek bacaklı keskin nişancı. Arachnid'den hafif, hızlı ve ince gövdelidir; bacakları uzun
 * olduğundan tabana yakın çömelip hızla açılır. İki iğne atıcı gövdenin önünde yan yana durur ve ince,
 * hızlı iğneleri sırayla ateşler: her isabet hafiftir ama tempo yüksek, menzil uzundur. Zırhı ince,
 * hata kaldırmaz.
 */
export const WIDOW: WalkerSpec = {
  kind: 'walker',
  id: 'widow',
  health: 92,
  walker: {
    ...WALKER,
    mass: 1250,
    halfLength: 38,
    halfWidth: 19,
    trackOffset: 15,
    maxSpeed: 160,
    acceleration: 1500,
    braking: 1900,
    dashMultiplier: 2.1,
    dashAcceleration: 4200,
    maxTurnRate: 3.4,
    turnAcceleration: 20,
    steerGain: 7,
    boostCapacity: 80,
    boostDrain: 160,
    boostRegen: 32,
    boostRestart: 80,
    wallRestitution: 0.38,
    impactKick: 0.14,
    turretTurnRate: 6.4,
  },
  suspension: {
    ...SUSPENSION,
    frequency: 3.8,
    damping: 0.42,
    pitchPerAccel: 0.006,
    rollPerAccel: 0.006,
    maxOffset: 2.4,
    roughness: 0.15,
  },
  armament: {
    weapon: {
      // İki atıcı sırayla ateşler: her biri 460 ms'de bir atar, birleşik tempo 230 ms.
      intervalMs: 230,
      aimTolerance: 0.02,
      projectileSpeed: 1250,
      projectileLifeMs: 900,
      flight: { muzzleHeight: 24, launchSpeed: 70, gravity: 314, drag: 0.15, maxRange: 600 },
      recoilImpulse: 5500,
      hitImpulse: 12000,
      recoilKick: 12,
      damage: 8,
      style: 'needle',
    },
    mounts: [
      { x: 28, y: -10.5, reach: 26 },
      { x: 28, y: 10.5, reach: 26 },
    ],
    pivot: { x: 28, y: 0 },
    salvo: [[0], [1]],
    toeInRange: 560,
  },
};

/**
 * Goliath: devasa kuşatma yürüyücüsü. Arachnid'in ~1,9 katı boyda, ağır ve yavaştır; yürüyüşü ve dönüşü
 * ağır, atılışı kısadır. Kalın zırhı çok can taşır ve bacakları ancak uzun, yandan ya da sürekli ateşle
 * kopar. İki ağır plazma havanı yavaş ve dolu mermi atar: tek isabeti sert, tempo düşük, mermisi yavaştır,
 * bu yüzden hızlı hedefi kaçırır. Çevik tanklar (Dart, Striker) ve yürüyücüler onu yan ve arkadan oyalar.
 */
export const GOLIATH: WalkerSpec = {
  kind: 'walker',
  id: 'goliath',
  health: 360,
  walker: {
    ...WALKER,
    mass: 9200,
    halfLength: 46,
    halfWidth: 40,
    trackOffset: 25,
    maxSpeed: 86,
    acceleration: 520,
    braking: 820,
    dashMultiplier: 1.7,
    dashAcceleration: 1500,
    maxTurnRate: 1.5,
    turnAcceleration: 7,
    steerGain: 3,
    boostCapacity: 110,
    boostDrain: 190,
    boostRegen: 24,
    boostRestart: 100,
    wallRestitution: 0.16,
    impactKick: 0.03,
    turretTurnRate: 3.4,
  },
  suspension: {
    ...SUSPENSION,
    frequency: 2.6,
    damping: 0.62,
    pitchPerAccel: 0.003,
    rollPerAccel: 0.003,
    maxOffset: 1.6,
    roughness: 0.12,
  },
  armament: {
    weapon: {
      // İki havan sırayla ateşler: her biri 1520 ms'de bir atar, birleşik tempo 760 ms.
      intervalMs: 760,
      aimTolerance: 0.05,
      projectileSpeed: 640,
      projectileLifeMs: 1500,
      flight: { muzzleHeight: 40, launchSpeed: 60, gravity: 314, drag: 0.35, maxRange: 540 },
      recoilImpulse: 90000,
      hitImpulse: 110000,
      recoilKick: 38,
      damage: 38,
      style: 'plasma',
    },
    mounts: [
      { x: 44, y: -22, reach: 37 },
      { x: 44, y: 22, reach: 37 },
    ],
    pivot: { x: 44, y: 0 },
    salvo: [[0], [1]],
    toeInRange: 520,
  },
};

/**
 * Manta: süzülen avcı. Ne paletle ne bacakla yürür, iki yan itici fanıyla zeminin üstünde kayar: hızlı
 * ve çevik ama frenlemesi yumuşaktır, köşede yana süzülür, momentum taşır. Gövdesi yürüdüğü yöne değil
 * nişana bakar, yani arkasına bakmadan kaçarken ateş eder. Silahı kısa menzilli, hızlı yay çakar:
 * her atış zayıftır ama tempo yüksektir; mesafe açan keskin nişancıya yenilir, yavaş ağır araçların
 * çevresinde dönerek ezer. İticileri ince zırhın dışındadır: yandan gelen ateş iticiyi koparır ve araç
 * o yana savrulur. Space basılı tutulunca iticilere yüklenip atılır.
 */
export const MANTA: HoverSpec = {
  kind: 'hover',
  id: 'manta',
  health: 120,
  hover: HOVER,
  suspension: {
    ...SUSPENSION,
    frequency: 1.5,
    damping: 0.2,
    pitchPerAccel: 0.012,
    rollPerAccel: 0.018,
    maxOffset: 5.5,
    roughness: 0.05,
  },
  armament: {
    weapon: {
      intervalMs: 150,
      aimTolerance: 0.035,
      projectileSpeed: 1100,
      projectileLifeMs: 750,
      flight: { muzzleHeight: 18, launchSpeed: 60, gravity: 314, drag: 0.25, maxRange: 520 },
      recoilImpulse: 3000,
      hitImpulse: 9000,
      recoilKick: 5,
      damage: 9,
      style: 'arc',
    },
    mounts: [{ x: 0, y: 0, reach: 30 }],
    salvo: [[0]],
    toeInRange: 400,
  },
};

/**
 * Barracuda: hafif akıncı. Manta'dan küçük ve çok daha hızlıdır, iticileri güçlüdür ama zırhı kâğıt gibidir.
 * Üç namlulu saçma topu yakın mesafede çok sert vurur, uzakta saçılıp işe yaramaz; bu yüzden hedefin
 * yanından geçip dönerek ateş eder, atılımla fırlayıp açılır. Hızlı tanklar ve keskin nişancılar ondan
 * kaçar, ağır ve yavaş araçlar etrafında dönerken ezilir.
 */
export const BARRACUDA: HoverSpec = {
  kind: 'hover',
  id: 'barracuda',
  health: 120,
  hover: {
    ...HOVER,
    mass: 620,
    halfLength: 26,
    halfWidth: 21,
    trackOffset: 16,
    maxSpeed: 305,
    acceleration: 780,
    braking: 360,
    dashMultiplier: 1.6,
    dashAcceleration: 2300,
    maxTurnRate: 6.4,
    turnAcceleration: 42,
    steerGain: 8,
    boostCapacity: 70,
    boostDrain: 160,
    boostRegen: 34,
    wallRestitution: 0.6,
    impactKick: 0.24,
    turretTurnRate: 8.5,
  },
  suspension: {
    ...SUSPENSION,
    frequency: 1.9,
    damping: 0.22,
    pitchPerAccel: 0.014,
    rollPerAccel: 0.02,
    maxOffset: 5,
    roughness: 0.06,
  },
  armament: {
    weapon: {
      intervalMs: 540,
      aimTolerance: 0.05,
      projectileSpeed: 1050,
      projectileLifeMs: 480,
      flight: { muzzleHeight: 16, launchSpeed: 40, gravity: 314, drag: 0.5, maxRange: 340 },
      recoilImpulse: 9000,
      hitImpulse: 15000,
      recoilKick: 12,
      damage: 11,
      style: 'flak',
    },
    // Üç namlu tek taretin ağzında yan yana durur; hepsi aynı anda ateşlenir ve 200 birimde odaklanır.
    mounts: [
      { x: 0, y: -5.5, reach: 27 },
      { x: 0, y: 0, reach: 28 },
      { x: 0, y: 5.5, reach: 27 },
    ],
    pivot: { x: 0, y: 0 },
    salvo: [[0, 1, 2]],
    toeInRange: 200,
  },
};

/**
 * Leviathan: ağır süzülen savaş gemisi. Geniş iticileri üstünde ağır ve yavaş kayar, çok can taşır;
 * iki yan topu (itici başlarında) sırayla derin mavi mızrak çakar: her isabet sert, menzil uzun, tempo
 * düşüktür. Gövdesi büyük hedeftir ve iticileri uzakta durduğundan yandan gelen ateşte kolay kopar;
 * pilot onu kıyıdan kıyıya yavaş ama istikrarlı sürer.
 */
export const LEVIATHAN: HoverSpec = {
  kind: 'hover',
  id: 'leviathan',
  health: 170,
  hover: {
    ...HOVER,
    mass: 3100,
    halfLength: 40,
    halfWidth: 38,
    trackOffset: 31,
    maxSpeed: 150,
    acceleration: 300,
    braking: 190,
    dashMultiplier: 1.4,
    dashAcceleration: 700,
    gripSensitivity: 0.12,
    maxTurnRate: 2.4,
    turnAcceleration: 10,
    steerGain: 4,
    boostCapacity: 100,
    boostDrain: 150,
    boostRegen: 22,
    boostRestart: 100,
    wallRestitution: 0.3,
    impactKick: 0.07,
    turretTurnRate: 3.6,
  },
  suspension: {
    ...SUSPENSION,
    frequency: 1.2,
    damping: 0.34,
    pitchPerAccel: 0.006,
    rollPerAccel: 0.009,
    maxOffset: 3.4,
    roughness: 0.04,
  },
  armament: {
    weapon: {
      // İki top sırayla ateşler: her biri 1080 ms'de bir atar, birleşik tempo 540 ms.
      intervalMs: 540,
      aimTolerance: 0.035,
      projectileSpeed: 980,
      projectileLifeMs: 1100,
      flight: { muzzleHeight: 30, launchSpeed: 70, gravity: 314, drag: 0.22, maxRange: 700 },
      recoilImpulse: 62000,
      hitImpulse: 76000,
      recoilKick: 30,
      damage: 26,
      style: 'lance',
    },
    mounts: [
      { x: 26, y: -31, reach: 30 },
      { x: 26, y: 31, reach: 30 },
    ],
    pivot: { x: 26, y: 0 },
    salvo: [[0], [1]],
    toeInRange: 620,
  },
};

/**
 * Warhound: hafif keşif robotu. İki bacaklı en çevik araçtır; hızlı koşar, yönünü çabuk çevirir ama
 * zırhı incedir ve topal kalınca neredeyse yürüyemez. İki kol topu sırayla ateşler: her mermi hafif,
 * tempo yüksektir, menzil orta. Tankların yan ve arkasına koşup yapışmak için tasarlanmıştır.
 */
export const WARHOUND: MechSpec = {
  kind: 'mech',
  id: 'warhound',
  health: 100,
  mech: {
    ...MECH,
    mass: 1500,
    halfLength: 20,
    halfWidth: 19,
    trackOffset: 18,
    maxSpeed: 225,
    acceleration: 1100,
    braking: 1500,
    dashMultiplier: 1.6,
    dashAcceleration: 2400,
    maxTurnRate: 3.6,
    turnAcceleration: 16,
    steerGain: 6,
    turnSpeedFloor: 0.5,
    strideLength: 32,
    strideDip: 0.12,
    boostCapacity: 80,
    boostDrain: 150,
    boostRegen: 34,
    boostRestart: 80,
    wallRestitution: 0.34,
    impactKick: 0.12,
    turretTurnRate: 6.2,
  },
  suspension: {
    ...SUSPENSION,
    frequency: 3.4,
    damping: 0.45,
    pitchPerAccel: 0.007,
    rollPerAccel: 0.007,
    maxOffset: 2.4,
    roughness: 0.18,
  },
  armament: {
    weapon: {
      // İki kol topu sırayla ateşler: her biri 340 ms'de bir atar, birleşik tempo 170 ms.
      intervalMs: 170,
      aimTolerance: 0.04,
      projectileSpeed: 1050,
      projectileLifeMs: 640,
      flight: { muzzleHeight: 24, launchSpeed: 55, gravity: 314, drag: 0.22, maxRange: 470 },
      recoilImpulse: 5200,
      hitImpulse: 14000,
      recoilKick: 9,
      damage: 8,
      style: 'autocannon',
    },
    mounts: [
      { x: 8, y: -13, reach: 21 },
      { x: 8, y: 13, reach: 21 },
    ],
    pivot: { x: 8, y: 0 },
    salvo: [[0], [1]],
    toeInRange: 440,
  },
};

/**
 * Templar: orta sınıf hat robotu. Zırhlı ve sabırlıdır; sağ omzundaki döner makineli seri ateş eder,
 * tek tek hafif ama kesintisiz ve isabetli mermilerle hedefi eritir. Çevik değildir: dönüşü ağır,
 * adımı kararlıdır. Dengeli bir cephe aracıdır; yan yana dizilince ağır araçları da durdurur.
 */
export const TEMPLAR: MechSpec = {
  kind: 'mech',
  id: 'templar',
  health: 190,
  mech: {
    ...MECH,
    mass: 2700,
    halfLength: 25,
    halfWidth: 24,
    trackOffset: 23,
    maxSpeed: 152,
    acceleration: 640,
    braking: 1000,
    dashMultiplier: 1.55,
    dashAcceleration: 1300,
    maxTurnRate: 2.1,
    turnAcceleration: 8.5,
    steerGain: 4.2,
    turnSpeedFloor: 0.36,
    strideLength: 42,
    boostCapacity: 90,
    boostDrain: 150,
    boostRegen: 28,
    boostRestart: 90,
    wallRestitution: 0.2,
    impactKick: 0.06,
    turretTurnRate: 4.4,
  },
  suspension: {
    ...SUSPENSION,
    frequency: 2.8,
    damping: 0.55,
    pitchPerAccel: 0.005,
    rollPerAccel: 0.005,
    maxOffset: 2,
    roughness: 0.14,
  },
  armament: {
    weapon: {
      intervalMs: 105,
      aimTolerance: 0.05,
      projectileSpeed: 980,
      projectileLifeMs: 560,
      flight: { muzzleHeight: 26, launchSpeed: 50, gravity: 314, drag: 0.26, maxRange: 430 },
      recoilImpulse: 3400,
      hitImpulse: 7500,
      recoilKick: 5,
      damage: 6,
      style: 'gatling',
    },
    mounts: [{ x: 6, y: 13, reach: 28 }],
    salvo: [[0]],
    toeInRange: 420,
  },
};

/**
 * Juggernaut: ağır kuşatma robotu. Devasa ve yavaştır, bacağı ağırlığı zor taşır: dönmek bir iştir.
 * Omuzlarındaki iki havan sırayla ateşler; mermi yüksek kavisle uzağa gider ve çok sert düşer ama
 * yavaştır, hızlı hedefi kaçırır. Çevik araçlar onu arkadan oyalar; yakınında tek isabetle ezilir.
 */
export const JUGGERNAUT: MechSpec = {
  kind: 'mech',
  id: 'juggernaut',
  health: 245,
  mech: {
    ...MECH,
    mass: 8200,
    halfLength: 38,
    halfWidth: 36,
    trackOffset: 35,
    maxSpeed: 96,
    acceleration: 420,
    braking: 700,
    dashMultiplier: 1.45,
    dashAcceleration: 800,
    gripSensitivity: 0.3,
    maxTurnRate: 1.3,
    turnAcceleration: 5,
    steerGain: 3,
    turnSpeedFloor: 0.3,
    strideLength: 58,
    strideDip: 0.18,
    boostCapacity: 110,
    boostDrain: 160,
    boostRegen: 22,
    boostRestart: 100,
    wallRestitution: 0.14,
    impactKick: 0.03,
    turretTurnRate: 2.8,
  },
  suspension: {
    ...SUSPENSION,
    frequency: 2.2,
    damping: 0.65,
    pitchPerAccel: 0.003,
    rollPerAccel: 0.003,
    maxOffset: 1.5,
    roughness: 0.1,
  },
  armament: {
    weapon: {
      // İki havan sırayla ateşler: her biri 2100 ms'de bir atar, birleşik tempo 1050 ms.
      intervalMs: 1050,
      aimTolerance: 0.05,
      projectileSpeed: 560,
      projectileLifeMs: 1700,
      flight: { muzzleHeight: 44, launchSpeed: 120, gravity: 314, drag: 0.3, maxRange: 700 },
      recoilImpulse: 120000,
      hitImpulse: 140000,
      recoilKick: 46,
      damage: 62,
      style: 'howitzer',
    },
    mounts: [
      { x: 14, y: -24, reach: 40 },
      { x: 14, y: 24, reach: 40 },
    ],
    pivot: { x: 14, y: 0 },
    salvo: [[0], [1]],
    toeInRange: 560,
  },
};

export const VEHICLES: Readonly<Record<VehicleId, VehicleSpec>> = {
  striker: STRIKER,
  bulwark: BULWARK,
  dart: DART,
  arachnid: ARACHNID,
  widow: WIDOW,
  goliath: GOLIATH,
  manta: MANTA,
  barracuda: BARRACUDA,
  leviathan: LEVIATHAN,
  warhound: WARHOUND,
  templar: TEMPLAR,
  juggernaut: JUGGERNAUT,
};

export function isVehicleId(value: unknown): value is VehicleId {
  return typeof value === 'string' && (VEHICLE_IDS as readonly string[]).includes(value);
}

/** Ağdaki `model` indeksinden araç tanımı; geçersiz indeks `undefined` döner. */
export function vehicleAt(model: number): VehicleSpec | undefined {
  const id = VEHICLE_IDS[model];
  return id === undefined ? undefined : VEHICLES[id];
}

/** Araç tanımının ağdaki `model` indeksi. */
export function modelOf(spec: VehicleSpec): number {
  return VEHICLE_IDS.indexOf(spec.id);
}
