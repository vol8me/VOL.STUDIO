import { Cooldown } from '@volstudio/core/time';
import type { SuspensionConfig, TankConfig, WeaponConfig } from '@/config/tank';
import type { TankCommand } from './command';
import type { SimEvent } from './events';
import { Projectiles } from './combat/Projectiles';
import { Tank } from './tank/Tank';
import type { World } from './world/World';

export interface SimulationOptions {
  readonly world: World;
  readonly tank: TankConfig;
  readonly suspension: SuspensionConfig;
  readonly weapon: WeaponConfig;
}

/** Olay kuyruğunun tavanı: boşaltılmayan kuyruk belleği büyütmez. */
const MAX_EVENTS = 512;

/**
 * VOL.TEST dünyasının tek adım sahibi. Phaser bilmez; sahne, ölçekleme
 * betiği ve testler aynı sınıfı sürer. Adım süresi çağıranındır.
 */
export class Simulation {
  readonly world: World;
  readonly tank: Tank;
  readonly projectiles: Projectiles;
  private readonly weapon: WeaponConfig;
  private readonly fireCooldown: Cooldown;
  private readonly events: SimEvent[] = [];
  private readonly impactEventSpeed: number;
  timeMs = 0;

  constructor(options: SimulationOptions) {
    this.world = options.world;
    this.weapon = options.weapon;
    this.impactEventSpeed = options.tank.impactEventSpeed;
    this.tank = new Tank(options.tank, options.suspension);
    this.projectiles = new Projectiles(options.weapon.capacity, options.weapon.projectileLifeMs);
    this.fireCooldown = new Cooldown(options.weapon.intervalMs);
    const center = this.world.center;
    this.tank.place(center.x, center.y);
  }

  step(command: TankCommand, stepMs: number): void {
    const dt = stepMs / 1000;
    this.timeMs += stepMs;
    const tank = this.tank;
    tank.capturePose();
    tank.step(command, this.world, dt);
    const contact = tank.contact;
    if (contact.speed > this.impactEventSpeed) {
      this.emit({
        kind: 'wallHit',
        x: contact.x,
        y: contact.y,
        normalX: contact.normalX,
        normalY: contact.normalY,
        speed: contact.speed,
      });
    }
    this.fireCooldown.update(stepMs);
    if (command.fire && this.fireCooldown.tryTrigger()) this.fire();
    this.projectiles.step(stepMs, this.world, this.events);
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  /** Birikmiş olayları `out`a aktarır ve kuyruğu boşaltır. */
  drainEvents(out: SimEvent[]): SimEvent[] {
    for (const event of this.events) out.push(event);
    this.events.length = 0;
    return out;
  }

  private emit(event: SimEvent): void {
    this.events.push(event);
  }

  /**
   * Mermi namludan tankın hızını devralarak çıkar. Tanka ters yönde itki
   * uygulanır; gövde ateş yönünün tersine yaylanır (yandan ateş yalpa yapar).
   */
  private fire(): void {
    const tank = this.tank;
    const weapon = this.weapon;
    const dirX = Math.cos(tank.turret);
    const dirY = Math.sin(tank.turret);
    const x = tank.x + dirX * weapon.muzzleOffset;
    const y = tank.y + dirY * weapon.muzzleOffset;
    this.projectiles.spawn(
      x,
      y,
      dirX * weapon.projectileSpeed + tank.vx,
      dirY * weapon.projectileSpeed + tank.vy,
    );
    tank.applyImpulse(-dirX * weapon.recoilImpulse, -dirY * weapon.recoilImpulse);
    const fx = Math.cos(tank.hull);
    const fy = Math.sin(tank.hull);
    tank.suspension.kick(
      -(dirX * fx + dirY * fy) * weapon.recoilKick,
      -(-dirX * fy + dirY * fx) * weapon.recoilKick,
    );
    this.emit({ kind: 'fired', x, y, angle: tank.turret });
  }
}
