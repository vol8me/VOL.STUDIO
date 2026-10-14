import {
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
