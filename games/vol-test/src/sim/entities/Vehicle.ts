import { segmentOrientedBoxEntryT } from '@volstudio/core/math';
import { Cooldown } from '@volstudio/core/time';
import type { SuspensionConfig, TankConfig, WeaponConfig } from '@/config/tank';
import { COMBAT, type CombatConfig } from '@/config/combat';
import { Vitality } from '../combat/Vitality';
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
  readonly vitality: Vitality;
  /** Yeniden doğma konumu sunucu veya senaryo tarafından açıkça güncellenebilir. */
  readonly spawnPoint: { x: number; y: number; hull: number };

  constructor(
    readonly id: EntityId,
    tank: TankConfig,
    suspension: SuspensionConfig,
    readonly weapon: WeaponConfig,
    combat: CombatConfig = COMBAT,
    readonly team: number | null = null,
  ) {
    this.tank = new Tank(tank, suspension);
    this.gun = new Cooldown(weapon.intervalMs);
    this.vitality = new Vitality(combat);
    this.spawnPoint = { x: 0, y: 0, hull: -Math.PI / 2 };
  }

  /**
   * Mermi hedefi sözleşmesi: doğru parçasının gövdenin yönlü ayak iziyle ilk
   * temas parametresi (`0..1`), yoksa `null`. Uç noktaları örnekleyen test dar
   * kirişi ve köşeyi kaçırırdı. Gövde adımın sonundaki pozunda sabit sayılır.
   */
  entryT(startX: number, startY: number, endX: number, endY: number): number | null {
    if (!this.vitality.alive) return null;
    const { x, y, angle, shape } = this.tank;
    return segmentOrientedBoxEntryT(
      startX,
      startY,
      endX,
      endY,
      x,
      y,
      angle,
      shape.halfLength,
      shape.halfWidth,
    );
  }
}
