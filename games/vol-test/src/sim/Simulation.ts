import type { SuspensionConfig, TankConfig, WeaponConfig } from '@/config/tank';
import { idleCommand, type TankCommand } from './command';
import { Projectiles, type ProjectileTarget } from './combat/Projectiles';
import { Vehicle, type EntityId } from './entities/Vehicle';
import type { SimEvent } from './events';
import { createContact, resolveBodyContact } from '@volstudio/core/physics';
import type { World } from './world/World';

export interface SimulationOptions {
  readonly world: World;
  readonly tank: TankConfig;
  readonly suspension: SuspensionConfig;
  readonly weapon: WeaponConfig;
}

/** Araç kimliğinden o adımın komutu; verilmeyen araç boşta kalır. */
export type CommandSource = (vehicle: Vehicle) => TankCommand;

/** Olay kuyruğunun tavanı: boşaltılmayan kuyruk belleği büyütmez. */
const MAX_EVENTS = 512;
const IDLE = idleCommand();

/**
 * VOL.TEST dünyasının tek adım sahibi. Araçları, mermileri ve aralarındaki
 * temasları sürer; Phaser bilmez. Kontrol edilen araç (`player`) yalnız bir
 * kimliktir: diğer araçlar aynı kurallarla, kendi komutlarıyla ilerler.
 */
export class Simulation {
  readonly world: World;
  readonly projectiles: Projectiles;
  private readonly vehicleList: Vehicle[] = [];
  private readonly options: SimulationOptions;
  private readonly events: SimEvent[] = [];
  private readonly contact = createContact();
  private readonly targets: ProjectileTarget[] = [];
  private nextId: EntityId = 1;
  private playerId: EntityId;
  timeMs = 0;

  constructor(options: SimulationOptions) {
    this.options = options;
    this.world = options.world;
    this.projectiles = new Projectiles(options.weapon.capacity, options.weapon.projectileLifeMs);
    const center = this.world.center;
    this.playerId = this.spawn(center.x, center.y).id;
  }

  get vehicles(): readonly Vehicle[] {
    return this.vehicleList;
  }

  /** Kontrol edilen araç. */
  get player(): Vehicle {
    const vehicle = this.vehicle(this.playerId);
    if (!vehicle) throw new Error('Kontrol edilen araç yok');
    return vehicle;
  }

  vehicle(id: EntityId): Vehicle | undefined {
    return this.vehicleList.find((vehicle) => vehicle.id === id);
  }

  /** Yeni araç yerleştirir; kimlik simülasyon ömrü boyunca yeniden kullanılmaz. */
  spawn(x: number, y: number, hull = -Math.PI / 2): Vehicle {
    const options = this.options;
    const vehicle = new Vehicle(this.nextId++, options.tank, options.suspension, options.weapon);
    vehicle.tank.place(x, y, hull);
    this.vehicleList.push(vehicle);
    this.targets.push({ id: vehicle.id, contains: (px, py) => vehicle.tank.contains(px, py) });
    return vehicle;
  }

  /** Aracı kaldırır; kontrol edilen araç kaldırılamaz. */
  despawn(id: EntityId): void {
    if (id === this.playerId) throw new Error('Kontrol edilen araç kaldırılamaz');
    const index = this.vehicleList.findIndex((vehicle) => vehicle.id === id);
    if (index < 0) return;
    this.vehicleList.splice(index, 1);
    this.targets.splice(index, 1);
  }

  /**
   * Bir adım ilerler. Tek komut verilirse kontrol edilen araca uygulanır,
   * diğer araçlar boşta kalır; komut kaynağı verilirse her araç kendi
   * komutunu alır.
   */
  step(input: TankCommand | CommandSource, stepMs: number): void {
    const dt = stepMs / 1000;
    this.timeMs += stepMs;
    const commandFor: CommandSource =
      typeof input === 'function'
        ? input
        : (vehicle) => (vehicle.id === this.playerId ? input : IDLE);

    for (const vehicle of this.vehicleList) {
      const tank = vehicle.tank;
      tank.capturePose();
      tank.step(commandFor(vehicle), this.world, dt);
      const contact = tank.contact;
      if (contact.speed > this.options.tank.impactEventSpeed) {
        this.emit({
          kind: 'wallHit',
          source: vehicle.id,
          x: contact.x,
          y: contact.y,
          normalX: contact.normalX,
          normalY: contact.normalY,
          speed: contact.speed,
        });
      }
    }
    this.collideVehicles();
    for (const vehicle of this.vehicleList) {
      vehicle.gun.update(stepMs);
      if (commandFor(vehicle).fire && vehicle.gun.tryTrigger()) this.fire(vehicle);
    }
    this.projectiles.step(stepMs, this.world, this.events, this.targets, (projectile, target) => {
      const struck = this.vehicle(target.id);
      if (!struck) return;
      const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
      const impulse = this.options.weapon.hitImpulse;
      struck.tank.applyImpulse(
        (projectile.vx / speed) * impulse,
        (projectile.vy / speed) * impulse,
        projectile.x,
        projectile.y,
      );
    });
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

  /** Araç çiftleri arasındaki teması çözer (SAT + iki cisimli itki). */
  private collideVehicles(): void {
    const list = this.vehicleList;
    for (let first = 0; first < list.length; first++) {
      for (let second = first + 1; second < list.length; second++) {
        const a = list[first];
        const b = list[second];
        const hit = resolveBodyContact(a.tank, a.tank.shape, b.tank, b.tank.shape, this.contact);
        if (hit.speed <= this.options.tank.impactEventSpeed) continue;
        a.tank.kickFrom(hit);
        b.tank.kickFrom({ ...hit, normalX: -hit.normalX, normalY: -hit.normalY });
        this.emit({
          kind: 'collision',
          a: a.id,
          b: b.id,
          x: hit.x,
          y: hit.y,
          normalX: hit.normalX,
          normalY: hit.normalY,
          speed: hit.speed,
        });
      }
    }
  }

  /**
   * Mermi namludan tankın hızını devralarak çıkar. Tanka ters yönde itki
   * uygulanır; gövde ateş yönünün tersine yaylanır (yandan ateş yalpa yapar).
   */
  private fire(vehicle: Vehicle): void {
    const tank = vehicle.tank;
    const weapon = vehicle.weapon;
    const dirX = Math.cos(tank.turret);
    const dirY = Math.sin(tank.turret);
    const x = tank.x + dirX * weapon.muzzleOffset;
    const y = tank.y + dirY * weapon.muzzleOffset;
    this.projectiles.spawn(
      vehicle.id,
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
    this.emit({ kind: 'fired', source: vehicle.id, x, y, angle: tank.turret });
  }
}
