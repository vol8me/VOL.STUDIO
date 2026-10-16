import { SKILLS, type SkillId } from '@/config/skills';
import {
  chassisConfigOf,
  skillOf,
  topSpeedOf,
  VEHICLE_IDS,
  VEHICLES,
  type VehicleId,
  type VehicleSpec,
} from '@/config/vehicles';

/** Garajda araçlar arasında karşılaştırılan üç ölçü. Değerler katalog içinde [0, 1]'e ölçeklenir. */
export interface VehicleStats {
  /** Can. */
  readonly durability: number;
  /** Düz zemin tavan hızı. */
  readonly speed: number;
  /** Saniyedeki ortalama atış hasarı (tüm yuvalar). */
  readonly firepower: number;
}

/** Bir tetik çekişinde ortalama ateşlenen yuva sayısı: bir salvo grubu bir atıştır. */
function mountsPerShot(spec: VehicleSpec): number {
  const { salvo } = spec.armament;
  const total = salvo.reduce((sum, group) => sum + group.length, 0);
  return total / salvo.length;
}

/** Ham değerler: can, birim/s ve hasar/s. */
export function rawStats(spec: VehicleSpec): VehicleStats {
  const { weapon } = spec.armament;
  return {
    durability: spec.health,
    speed: topSpeedOf(spec),
    firepower: (weapon.damage * mountsPerShot(spec)) / (weapon.intervalMs / 1000),
  };
}

const MAXIMUM: VehicleStats = (() => {
  const all = VEHICLE_IDS.map((id) => rawStats(VEHICLES[id]));
  return {
    durability: Math.max(...all.map((stats) => stats.durability)),
    speed: Math.max(...all.map((stats) => stats.speed)),
    firepower: Math.max(...all.map((stats) => stats.firepower)),
  };
})();

/** Katalogun en iyisine oranlı ölçüler; en güçlü araç her ölçüde 1'e erişir. */
export function vehicleStats(id: VehicleId): VehicleStats {
  const stats = rawStats(VEHICLES[id]);
  return {
    durability: stats.durability / MAXIMUM.durability,
    speed: stats.speed / MAXIMUM.speed,
    firepower: stats.firepower / MAXIMUM.firepower,
  };
}

/** Garajda yeteneğin yazıya dökülen sayıları (yüzdeler tam sayıya yuvarlanır; hepsi config'ten türer). */
export interface SkillInfo {
  readonly skill: SkillId;
  /** Hız deposunun tek basışta açık kaldığı süre (sn). */
  readonly seconds: number;
  /** Yetenek açıkken azami hız değişimi (%; yavaşlayanda eksi). */
  readonly speed: number;
  /** Atış temposu artışı (%). */
  readonly fireRate: number;
  /** Rakibe çarpışma hasarı çarpanı ve çarpmanın kendine bedeli (%). */
  readonly ram: number;
  readonly ramTaken: number;
  /** Gelen hasar azalışı ve verilen hasar artışı (%). */
  readonly takenDown: number;
  readonly dealtUp: number;
}

const percent = (factor: number): number => Math.round((factor - 1) * 100);

export function skillInfo(spec: VehicleSpec): SkillInfo {
  const skill = skillOf(spec);
  const config = chassisConfigOf(spec);
  const effect = SKILLS[skill];
  const multiplier = 'boostMultiplier' in config ? config.boostMultiplier : config.dashMultiplier;
  return {
    skill,
    seconds: Math.round((config.boostCapacity / config.boostDrain) * 10) / 10,
    speed: percent(multiplier),
    fireRate: percent(effect.fireRate),
    ram: Math.round(effect.ram * 10) / 10,
    ramTaken: Math.round(effect.ramTaken * 100),
    takenDown: -percent(effect.taken),
    dealtUp: percent(effect.dealt),
  };
}
