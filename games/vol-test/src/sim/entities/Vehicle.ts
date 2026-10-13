import { segmentOrientedBoxEntryT } from '@volstudio/core/math';
import { Cooldown } from '@volstudio/core/time';
import type { WeaponConfig } from '@/config/tank';
import type { Armament, VehicleSpec } from '@/config/vehicles';
import { COMBAT, type CombatConfig } from '@/config/combat';
import { Vitality } from '../combat/Vitality';
import type { Chassis } from '../chassis/Chassis';
import { Tank } from '../tank/Tank';

/** Simülasyondaki varlıkların kimliği; simülasyon ömrü boyunca tekildir. */
export type EntityId = number;

/**
 * Sürülebilir araç: kimlik, tanım (`VehicleSpec`), şasi ve silah. Aracı kimin sürdüğü (oyuncu,
 * yapay zekâ, tekrar oynatma) aracın konusu değildir; komut dışarıdan gelir.
 */
export class Vehicle {
  readonly chassis: Chassis;
  readonly gun: Cooldown;
  readonly vitality: Vitality;
  /** Sıradaki tetik çekişinde ateşlenecek `armament.salvo` grubu; ağ durumunun parçasıdır. */
  salvo = 0;
  /** Yeniden doğma konumu sunucu veya senaryo tarafından açıkça güncellenebilir. */
  readonly spawnPoint: { x: number; y: number; hull: number };

  constructor(
    readonly id: EntityId,
    readonly spec: VehicleSpec,
    combat: CombatConfig = COMBAT,
    readonly team: number | null = null,
  ) {
    this.chassis = new Tank(spec.tank, spec.suspension);
    this.gun = new Cooldown(spec.armament.weapon.intervalMs);
    this.vitality = new Vitality({ ...combat, maxHealth: spec.health });
    this.spawnPoint = { x: 0, y: 0, hull: -Math.PI / 2 };
  }

  get armament(): Armament {
    return this.spec.armament;
  }

  get weapon(): WeaponConfig {
    return this.spec.armament.weapon;
  }

  /**
   * Mermi hedefi sözleşmesi: doğru parçasının gövdenin yönlü ayak iziyle ilk
   * temas parametresi (`0..1`), yoksa `null`. Uç noktaları örnekleyen test dar
   * kirişi ve köşeyi kaçırırdı. Gövde adımın sonundaki pozunda sabit sayılır.
   */
  entryT(startX: number, startY: number, endX: number, endY: number): number | null {
    if (!this.vitality.alive) return null;
    const { x, y, angle, shape } = this.chassis;
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
