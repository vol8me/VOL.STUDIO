import type { SuspensionConfig, TankConfig, WeaponConfig } from '@/config/tank';
import { angleDelta } from '@volstudio/core/math';
import { idleCommand, type TankCommand } from './command';
import { Projectiles } from './combat/Projectiles';
import { Vehicle, type EntityId } from './entities/Vehicle';
import type { SimEvent } from './events';
import { createContact, resolveBodyContact } from '@volstudio/core/physics';
import type { World } from './world/World';
import type { WeatherSystem } from './weather/WeatherSystem';
import { WEATHER } from '@/config/weather';
import { WORLD } from '@/config/world';

export interface SimulationOptions {
  readonly world: World;
  readonly tank: TankConfig;
  readonly suspension: SuspensionConfig;
  readonly weapon: WeaponConfig;
  readonly weather?: WeatherSystem;
}

/** Araç kimliğinden o adımın komutu; verilmeyen araç boşta kalır. */
export type CommandSource = (vehicle: Vehicle) => TankCommand;

/** Olay kuyruğunun tavanı: boşaltılmayan kuyruk belleği büyütmez. */
const MAX_EVENTS = 512;
/** Araç/duvar temas çözümünün üst sınırı: sıkışık kümede de adım süresi sabit kalır. */
const CONTACT_PASSES = 4;
const IDLE = idleCommand();

/**
 * VOL.TEST dünyasının tek adım sahibi. Araçları, mermileri ve aralarındaki
 * temasları sürer; Phaser bilmez. Kontrol edilen araç (`player`) yalnız bir
 * kimliktir: diğer araçlar aynı kurallarla, kendi komutlarıyla ilerler.
 */
export class Simulation {
  readonly world: World;
  readonly projectiles: Projectiles;
  readonly weather: WeatherSystem | undefined;
  private readonly vehicleList: Vehicle[] = [];
  private readonly options: SimulationOptions;
  private readonly events: SimEvent[] = [];
  private readonly contact = createContact();
  private readonly inputs = new Map<EntityId, TankCommand>();
  private nextId: EntityId = 1;
  private playerId: EntityId;
  timeMs = 0;

  constructor(options: SimulationOptions) {
    this.options = options;
    this.world = options.world;
    this.weather = options.weather;
    this.projectiles = new Projectiles(
      options.weapon.capacity,
      options.weapon.projectileLifeMs,
      options.weapon.flight,
    );
    if (this.weather) this.projectiles.setAir(this.weather.frame);
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
    this.inputs.set(vehicle.id, idleCommand());
    return vehicle;
  }

  /** Aracı kaldırır; kontrol edilen araç kaldırılamaz. */
  despawn(id: EntityId): void {
    if (id === this.playerId) throw new Error('Kontrol edilen araç kaldırılamaz');
    const index = this.vehicleList.findIndex((vehicle) => vehicle.id === id);
    if (index < 0) return;
    this.vehicleList.splice(index, 1);
    this.inputs.delete(id);
  }

  /**
   * Bir adım ilerler. Tek komut verilirse kontrol edilen araca uygulanır,
   * diğer araçlar boşta kalır; komut kaynağı verilirse her araç kendi
   * komutunu alır.
   */
  step(input: TankCommand | CommandSource, stepMs: number): void {
    this.weather?.step(stepMs);
    if (this.weather) this.projectiles.setAir(this.weather.frame);
    const dt = stepMs / 1000;
    this.timeMs += stepMs;
    const commandFor: CommandSource =
      typeof input === 'function'
        ? input
        : (vehicle) => (vehicle.id === this.playerId ? input : IDLE);

    for (const vehicle of this.vehicleList) {
      const tank = vehicle.tank;
      tank.capturePose();
      const command = this.inputs.get(vehicle.id)!;
      Object.assign(command, commandFor(vehicle));
      const x = tank.x;
      const y = tank.y;
      const groundLeft = tank.groundLeft;
      const groundRight = tank.groundRight;
      tank.step(command, this.world, dt, this.weather?.sample(x, y));
      if (this.weather) {
        const amountPerUnit = WEATHER.tank.snowCompactionPerMetre / WORLD.metre / 2;
        const offsetX = -Math.sin(tank.hull) * this.options.tank.trackOffset;
        const offsetY = Math.cos(tank.hull) * this.options.tank.trackOffset;
        this.weather.compress(
          tank.x - offsetX,
          tank.y - offsetY,
          (tank.groundLeft - groundLeft) * amountPerUnit,
        );
        this.weather.compress(
          tank.x + offsetX,
          tank.y + offsetY,
          (tank.groundRight - groundRight) * amountPerUnit,
        );
      }
    }
    this.settleContacts();
    for (const vehicle of this.vehicleList) {
      const contact = vehicle.tank.contact;
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
    for (const vehicle of this.vehicleList) {
      vehicle.gun.update(stepMs);
      const command = this.inputs.get(vehicle.id)!;
      const aiming = command.aimX !== 0 || command.aimY !== 0;
      const aligned =
        !aiming ||
        Math.abs(angleDelta(vehicle.tank.turret, Math.atan2(command.aimY, command.aimX))) <=
          this.options.weapon.aimTolerance;
      if (command.fire && aligned && vehicle.gun.tryTrigger()) this.fire(vehicle);
    }
    this.projectiles.step(
      stepMs,
      this.world,
      this.events,
      this.vehicleList,
      (projectile, target) => {
        const struck = this.vehicle(target.id);
        if (!struck) return;
        const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
        const impulse =
          this.options.weapon.hitImpulse * (speed / this.options.weapon.projectileSpeed);
        struck.tank.applyImpulse(
          (projectile.vx / speed) * impulse,
          (projectile.vy / speed) * impulse,
          projectile.x,
          projectile.y,
        );
      },
    );
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  previewAim(vehicle: Vehicle, stepMs: number) {
    if (this.weather) this.projectiles.setAir(this.weather.frame);
    const tank = vehicle.tank;
    const dx = Math.cos(tank.turret);
    const dy = Math.sin(tank.turret);
    return this.projectiles.preview(
      vehicle.id,
      tank.x + dx * vehicle.weapon.muzzleOffset,
      tank.y + dy * vehicle.weapon.muzzleOffset,
      dx * vehicle.weapon.projectileSpeed + tank.vx,
      dy * vehicle.weapon.projectileSpeed + tank.vy,
      this.world,
      this.vehicleList,
      stepMs,
    );
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
   * Adımın temaslarını çözer. Duvar sert sınırdır: araç teması bir gövdeyi
   * duvara geri itebildiği için her araç turundan sonra duvarlar yeniden
   * çözülür. Döngü sınırlıdır ve her zaman duvar geçişiyle biter; sıkışık
   * kümede araçlar tam ayrılamasa da hiçbir gövde köşesi dünya dışında kalmaz.
   */
  private settleContacts(): void {
    for (let pass = 0; pass < CONTACT_PASSES; pass++) {
      if (!this.collideVehicles()) return;
      for (const vehicle of this.vehicleList) vehicle.tank.settleAgainst(this.world);
    }
  }

  /**
   * Araç çiftleri arasındaki teması çözer (SAT + iki cisimli itki). Herhangi
   * bir gövdenin konumu değiştiyse `true` döner.
   */
  private collideVehicles(): boolean {
    const list = this.vehicleList;
    let moved = false;
    for (let first = 0; first < list.length; first++) {
      for (let second = first + 1; second < list.length; second++) {
        const a = list[first];
        const b = list[second];
        const ax = a.tank.x;
        const ay = a.tank.y;
        const bx = b.tank.x;
        const by = b.tank.y;
        const hit = resolveBodyContact(a.tank, a.tank.shape, b.tank, b.tank.shape, this.contact);
        if (a.tank.x !== ax || a.tank.y !== ay || b.tank.x !== bx || b.tank.y !== by) moved = true;
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
    return moved;
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
