import { Cooldown } from '@volstudio/core/time';
import type { SuspensionConfig, TankConfig, WeaponConfig } from '@/config/tank';
import { Tank } from '../tank/Tank';

/** Simülasyondaki varlıkların kimliği; simülasyon ömrü boyunca tekildir. */
export type EntityId = number;

/**
 * Sürülebilir araç: kimlik, gövde (katı cisim tank) ve silah. Aracı kimin
 * sürdüğü (oyuncu, yapay zekâ, tekrar oynatma) aracın konusu değildir;
 * komut dışarıdan gelir.
 */
export class Vehicle {
  readonly tank: Tank;
  readonly gun: Cooldown;

  constructor(
    readonly id: EntityId,
    tank: TankConfig,
    suspension: SuspensionConfig,
    readonly weapon: WeaponConfig,
  ) {
    this.tank = new Tank(tank, suspension);
    this.gun = new Cooldown(weapon.intervalMs);
  }
}
