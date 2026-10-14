import {
  SUSPENSION,
  TANK,
  WEAPON,
  type SuspensionConfig,
  type TankConfig,
  type WeaponConfig,
} from './tank';
import { WALKER, type WalkerConfig } from './walker';

/** Paletli araçlar. */
export const TANK_IDS = ['striker', 'bulwark', 'dart'] as const;
export type TankId = (typeof TANK_IDS)[number];

/** Bacaklı yürüyücüler. */
export const WALKER_IDS = ['arachnid'] as const;
export type WalkerId = (typeof WALKER_IDS)[number];

/** Seçilebilir araçlar; sıra ağ protokolündeki `model` indeksidir, sona eklenir ve yeniden sıralanmaz. */
export const VEHICLE_IDS = [...TANK_IDS, ...WALKER_IDS] as const;
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

/**
 * Araç silahlanması. 0. yuva nişan taretidir: yönü komuttaki nişandır. Öteki yuvalar nişan
 * noktasına (0. yuvadan `toeInRange` ileride) bakar; böylece her yuvanın yönü yalnız poza
 * bağlıdır ve ağ üzerinde ek durum taşınmaz. `salvo` her tetik çekişinde ateşlenen yuva
 * gruplarıdır ve sırayla döner.
 */
export interface Armament {
  readonly weapon: WeaponConfig;
  readonly mounts: readonly MountSpec[];
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

/** Bacaklı yürüyücü tanımı: her yöne yürür, gövdesi nişana bakar, birden çok silah yuvası taşır. */
export interface WalkerSpec extends VehicleBase {
  readonly kind: 'walker';
  readonly id: WalkerId;
  readonly walker: WalkerConfig;
}

export type VehicleSpec = TankSpec | WalkerSpec;

/** Şasinin tüm türlerde ortak sayıları (gövde ayak izi, depo, taret hızı). */
export function chassisConfigOf(spec: VehicleSpec): WalkerConfig | TankSpec['tank'] {
  return spec.kind === 'tank' ? spec.tank : spec.walker;
}

/** Düz zeminde yürüyüş ya da sürüş tavanı (birim/s); atılım hariç. */
export function topSpeedOf(spec: VehicleSpec): number {
  return chassisConfigOf(spec).maxSpeed;
}

/** Striker: dengeli ana tank; öteki araçlar bundan türer. */
export const STRIKER: TankSpec = {
  kind: 'tank',
  id: 'striker',
  health: 100,
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
  health: 170,
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
    turretTurnRate: 2.2,
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
      projectileSpeed: 760,
      projectileLifeMs: 1500,
      flight: { muzzleHeight: 28, launchSpeed: 110, gravity: 314, drag: 0.4, maxRange: 520 },
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
  health: 64,
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
      intervalMs: 360,
      aimTolerance: 0.02,
      projectileSpeed: 1300,
      projectileLifeMs: 1000,
      flight: { muzzleHeight: 20, launchSpeed: 60, gravity: 314, drag: 0.2, maxRange: 760 },
      recoilImpulse: 11000,
      hitImpulse: 22000,
      recoilKick: 22,
      damage: 16,
      style: 'rail',
    },
    mounts: [{ x: 0, y: 0, reach: 38 }],
    salvo: [[0]],
    toeInRange: 560,
  },
};

/**
 * Arachnid: bacaklı savaş canavarı. Her yöne çevik yürür, gövdesi nişana bakar ve atılımla
 * kısa sürede mesafe kapatır; üç plazma topu vardır (orta top tek, yan iki top çifte atış) ve
 * toplar gövdeden bağımsız döner. Zırhı ağır tanklardan ince, çevikliği Striker'dan yüksektir.
 */
export const ARACHNID: WalkerSpec = {
  kind: 'walker',
  id: 'arachnid',
  health: 140,
  walker: WALKER,
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
      intervalMs: 700,
      aimTolerance: 0.045,
      projectileSpeed: 700,
      projectileLifeMs: 1400,
      flight: { muzzleHeight: 26, launchSpeed: 80, gravity: 314, drag: 0.3, maxRange: 560 },
      recoilImpulse: 24000,
      hitImpulse: 52000,
      recoilKick: 26,
      damage: 24,
      style: 'plasma',
    },
    mounts: [
      { x: 21, y: 0, reach: 27.2 },
      { x: -5.7, y: -21, reach: 27.2 },
      { x: -5.7, y: 21, reach: 27.2 },
    ],
    salvo: [[0], [1, 2]],
    toeInRange: 460,
  },
};

export const VEHICLES: Readonly<Record<VehicleId, VehicleSpec>> = {
  striker: STRIKER,
  bulwark: BULWARK,
  dart: DART,
  arachnid: ARACHNID,
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
