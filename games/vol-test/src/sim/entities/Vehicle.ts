import { segmentOrientedBoxEntryT } from '@volstudio/core/math';
import { Cooldown } from '@volstudio/core/time';
import type { WeaponConfig } from '@/config/tank';
import type { Armament, VehicleSpec } from '@/config/vehicles';
import { COMBAT, type CombatConfig } from '@/config/combat';
import { PartWear } from '../combat/PartWear';
import { Vitality } from '../combat/Vitality';
import type { Chassis } from '../chassis/Chassis';
import { Hover } from '../hover/Hover';
import { Mech } from '../mech/Mech';
import { Tank } from '../tank/Tank';
import { Walker } from '../walker/Walker';

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
  /** Palet, bacak ve itici aşınması: konuma göre birikir, sonuç `chassis.parts`tadır (aşınmanın kendisi ağa gitmez). */
  readonly wear: PartWear;
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
    this.chassis = Vehicle.buildChassis(spec);
    this.gun = new Cooldown(spec.armament.weapon.intervalMs);
    this.vitality = new Vitality({ ...combat, maxHealth: spec.health });
    this.wear = new PartWear(spec);
    this.spawnPoint = { x: 0, y: 0, hull: -Math.PI / 2 };
  }

  private static buildChassis(spec: VehicleSpec): Chassis {
    switch (spec.kind) {
      case 'tank':
        return new Tank(spec.tank, spec.suspension);
      case 'walker':
        return new Walker(spec.walker, spec.suspension);
      case 'hover':
        return new Hover(spec.hover, spec.suspension);
      case 'mech':
        return new Mech(spec.mech, spec.suspension);
    }
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
