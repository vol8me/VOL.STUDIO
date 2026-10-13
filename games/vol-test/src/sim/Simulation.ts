import type { SuspensionConfig, TankConfig, WeaponConfig } from '@/config/tank';
import { COMBAT, type CombatConfig } from '@/config/combat';
import { idleCommand, type TankCommand } from './command';
import { Projectiles, type ProjectileTarget } from './combat/Projectiles';
import { Vehicle, type EntityId } from './entities/Vehicle';
import type { DamageCause, SimEvent } from './events';
import { createContact, resolveBodyContact } from '@volstudio/core/physics';
import type { ChassisPose } from './chassis/ChassisState';
import {
  aimAligned,
  applyRecoil,
  launchFrom,
  muzzleLaunch,
  type LaunchBuffer,
} from './vehicleStep';
import type { World } from './world/World';
import type { WeatherSystem } from './weather/WeatherSystem';
import { WEATHER } from '@/config/weather';
import { WORLD } from '@/config/world';

export interface SimulationOptions {
  readonly world: World;
  readonly tank: TankConfig;
  readonly suspension: SuspensionConfig;
  readonly weapon: WeaponConfig;
  readonly combat?: CombatConfig;
  readonly weather?: WeatherSystem;
  /**
   * Varsayılan `true`: dünya merkezinde kontrol edilen bir araç doğar. Sunucu
   * dünyası `false` verir; araçlar bağlanan oyuncuyla doğar ve çıkınca kalkar,
   * sahipsiz bir gövde dünyada kalmaz.
   */
  readonly spawnPlayer?: boolean;
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
  private readonly combat: CombatConfig;
  private readonly events: SimEvent[] = [];
  private readonly previewPose: ChassisPose = { x: 0, y: 0, hull: 0, turret: 0, pitch: 0, roll: 0 };
  private readonly previewLaunch: LaunchBuffer = { x: 0, y: 0, vx: 0, vy: 0, angle: 0 };
  private readonly contact = createContact();
  private readonly inputs = new Map<EntityId, TankCommand>();
  private readonly collisionDamagePairs = new Set<string>();
  private nextId: EntityId = 1;
  private playerId: EntityId | null = null;
  timeMs = 0;

  constructor(options: SimulationOptions) {
    this.options = options;
    this.combat = options.combat ?? COMBAT;
    this.world = options.world;
    this.weather = options.weather;
    this.projectiles = new Projectiles(
      options.weapon.capacity,
      options.weapon.projectileLifeMs,
      options.weapon.flight,
    );
    if (this.weather) this.projectiles.setAir(this.weather.frame);
    if (options.spawnPlayer !== false) {
      const center = this.world.center;
      this.playerId = this.spawn(center.x, center.y).id;
    }
  }

  get vehicles(): readonly Vehicle[] {
    return this.vehicleList;
  }

  /** Kontrol edilen araç. */
  get player(): Vehicle {
    const vehicle = this.playerId === null ? undefined : this.vehicle(this.playerId);
    if (!vehicle) throw new Error('Kontrol edilen araç yok');
    return vehicle;
  }

  vehicle(id: EntityId): Vehicle | undefined {
    return this.vehicleList.find((vehicle) => vehicle.id === id);
  }

  /**
   * Yeni araç yerleştirir; kimlik simülasyon ömrü boyunca yeniden kullanılmaz. `id` yalnız başka
   * bir otoritenin (ağ sunucusu) kimlik verdiği görünüm modelleri içindir: tekil tutmak çağıranındır.
   */
  spawn(
    x: number,
    y: number,
    hull = -Math.PI / 2,
    team: number | null = null,
    id?: EntityId,
  ): Vehicle {
    if (team !== null && !Number.isSafeInteger(team))
      throw new RangeError('Takım kimliği güvenli tamsayı olmalı');
    if (id !== undefined && (!Number.isSafeInteger(id) || id < 1 || this.vehicle(id)))
      throw new RangeError('Araç kimliği pozitif, güvenli ve tekil tamsayı olmalı');
    const options = this.options;
    this.nextId = Math.max(this.nextId, (id ?? 0) + 1);
    const vehicle = new Vehicle(
      id ?? this.nextId++,
      options.tank,
      options.suspension,
      options.weapon,
      this.combat,
      team,
    );
    vehicle.chassis.place(x, y, hull);
    Object.assign(vehicle.spawnPoint, { x, y, hull });
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

  /** Yetkili komutların ve savaş çözümünün ortak hasar kapısı; gerçek düşen canı döndürür. */
  applyDamage(
    targetId: EntityId,
    amount: number,
    source?: EntityId,
    cause: DamageCause = 'direct',
  ): number {
    const target = this.vehicle(targetId);
    if (!target) return 0;
    if (source !== undefined && this.isFriendly(source, target)) return 0;
    const applied = target.vitality.damage(amount);
    if (applied === 0) return 0;
    this.emit({
      kind: 'damaged',
      target: targetId,
      source,
      cause,
      amount: applied,
      health: target.vitality.health,
    });
    if (!target.vitality.alive) this.emit({ kind: 'died', target: targetId, source, cause });
    return applied;
  }

  /** Ölü hedefe can basmaz; ölümden çıkış yalnız respawnVehicle ile gerçekleşir. */
  healVehicle(targetId: EntityId, amount: number, source?: EntityId): number {
    const target = this.vehicle(targetId);
    if (!target) return 0;
    const applied = target.vitality.heal(amount);
    if (applied > 0)
      this.emit({
        kind: 'healed',
        target: targetId,
        source,
        amount: applied,
        health: target.vitality.health,
      });
    return applied;
  }

  /** Ölen aracı aynı kimlikle yeniden yerleştirir; fizik ve silah beklemeleri sıfırlanır. */
  respawnVehicle(id: EntityId, x?: number, y?: number, hull?: number): boolean {
    const vehicle = this.vehicle(id);
    if (!vehicle || vehicle.vitality.alive) return false;
    this.place(vehicle, x, y, hull);
    return true;
  }

  /**
   * Aracı canlı ya da ölü, tam sağlıkla ve sıfırlanmış fizikle verilen (yoksa kayıtlı doğma)
   * noktaya koyar. Maç sıfırlaması gibi herkesin aynı anda yeniden başlaması gereken yerde kullanılır.
   */
  resetVehicle(id: EntityId, x?: number, y?: number, hull?: number): boolean {
    const vehicle = this.vehicle(id);
    if (!vehicle) return false;
    this.place(vehicle, x, y, hull);
    return true;
  }

  private place(vehicle: Vehicle, x?: number, y?: number, hull?: number): void {
    const point = vehicle.spawnPoint;
    const nextX = x ?? point.x;
    const nextY = y ?? point.y;
    const nextHull = hull ?? point.hull;
    if (![nextX, nextY, nextHull].every(Number.isFinite))
      throw new RangeError('Yeniden doğma konumu sonlu olmalı');
    const bodyRadius = Math.hypot(this.options.tank.halfLength, this.options.tank.halfWidth);
    vehicle.chassis.resetForRespawn(
      Math.max(bodyRadius, Math.min(this.world.width - bodyRadius, nextX)),
      Math.max(bodyRadius, Math.min(this.world.height - bodyRadius, nextY)),
      nextHull,
    );
    vehicle.gun.reset();
    vehicle.vitality.respawn();
    this.emit({
      kind: 'respawned',
      target: vehicle.id,
      x: vehicle.chassis.x,
      y: vehicle.chassis.y,
    });
  }

  /** Birbirini vuramayan takım üyeleri mermiler için de saydamdır. */
  private isFriendly(sourceId: EntityId, target: Vehicle): boolean {
    if (this.combat.friendlyFire || target.team === null) return false;
    const source = this.vehicle(sourceId);
    return source !== undefined && source.team === target.team;
  }

  private canProjectileHit(owner: EntityId, target: ProjectileTarget): boolean {
    const vehicle = this.vehicle(target.id);
    return vehicle !== undefined && vehicle.vitality.alive && !this.isFriendly(owner, vehicle);
  }

  /**
   * Bir adım ilerler. Tek komut verilirse kontrol edilen araca uygulanır,
   * diğer araçlar boşta kalır; komut kaynağı verilirse her araç kendi
   * komutunu alır.
   */
  step(input: TankCommand | CommandSource, stepMs: number): void {
    if (!Number.isFinite(stepMs) || stepMs < 0)
      throw new RangeError('Simülasyon adımı sonlu ve negatif olmayan süre olmalı');
    this.weather?.step(stepMs);
    if (this.weather) this.projectiles.setAir(this.weather.frame);
    const dt = stepMs / 1000;
    this.timeMs += stepMs;
    const commandFor: CommandSource =
      typeof input === 'function'
        ? input
        : (vehicle) => (vehicle.id === this.playerId ? input : IDLE);

    this.collisionDamagePairs.clear();
    for (const vehicle of this.vehicleList) {
      const tick = vehicle.vitality.step(stepMs);
      if (tick.respawnReady) this.respawnVehicle(vehicle.id);
      const tank = vehicle.chassis;
      tank.capturePose();
      const command = this.inputs.get(vehicle.id)!;
      Object.assign(command, commandFor(vehicle));
      if (!vehicle.vitality.alive) continue;
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
      if (!vehicle.vitality.alive) continue;
      const contact = vehicle.chassis.contact;
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
        this.applyImpactDamage(vehicle.id, contact.speed, this.combat.wall, 'wall');
      }
    }
    for (const vehicle of this.vehicleList) {
      if (!vehicle.vitality.alive) continue;
      vehicle.gun.update(stepMs);
      const command = this.inputs.get(vehicle.id)!;
      if (command.fire && aimAligned(vehicle, command) && vehicle.gun.tryTrigger())
        this.fire(vehicle);
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
        struck.chassis.applyImpulse(
          (projectile.vx / speed) * impulse,
          (projectile.vy / speed) * impulse,
          projectile.x,
          projectile.y,
        );
        this.applyDamage(struck.id, this.combat.projectileDamage, projectile.owner, 'projectile');
      },
      (owner, target) => this.canProjectileHit(owner, target),
    );
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  /**
   * Aracın şimdi ateş etmesi hâlinde mermisinin gideceği yol. `pose` verilirse atış o pozdan
   * türetilir (görünümün ara değerli karesi: nişan çizgisi ekrandaki namluyla aynı doğrultuda
   * kalır); verilmezse güncel adımın pozu kullanılır.
   */
  previewAim(vehicle: Vehicle, stepMs: number, pose?: ChassisPose) {
    if (this.weather) this.projectiles.setAir(this.weather.frame);
    const tank = vehicle.chassis;
    const launch = launchFrom(
      pose ?? tank.readPose(this.previewPose),
      tank.vx,
      tank.vy,
      vehicle.weapon,
      this.previewLaunch,
    );
    return this.projectiles.preview(
      vehicle.id,
      launch.x,
      launch.y,
      launch.vx,
      launch.vy,
      this.world,
      this.vehicleList,
      stepMs,
      (owner, target) => this.canProjectileHit(owner, target),
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
      for (const vehicle of this.vehicleList)
        if (vehicle.vitality.alive) vehicle.chassis.settleAgainst(this.world);
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
        if (!a.vitality.alive || !b.vitality.alive) continue;
        const ax = a.chassis.x;
        const ay = a.chassis.y;
        const bx = b.chassis.x;
        const by = b.chassis.y;
        const hit = resolveBodyContact(
          a.chassis,
          a.chassis.shape,
          b.chassis,
          b.chassis.shape,
          this.contact,
        );
        if (a.chassis.x !== ax || a.chassis.y !== ay || b.chassis.x !== bx || b.chassis.y !== by)
          moved = true;
        if (hit.speed <= this.options.tank.impactEventSpeed) continue;
        a.chassis.kickFrom(hit);
        b.chassis.kickFrom({ ...hit, normalX: -hit.normalX, normalY: -hit.normalY });
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
        const key = a.id + ':' + b.id;
        if (!this.collisionDamagePairs.has(key)) {
          this.collisionDamagePairs.add(key);
          this.applyImpactDamage(a.id, hit.speed, this.combat.collision, 'collision', b.id);
          this.applyImpactDamage(b.id, hit.speed, this.combat.collision, 'collision', a.id);
        }
      }
    }
    return moved;
  }

  /**
   * Mermi namludan tankın hızını devralarak çıkar. Tanka ters yönde itki
   * uygulanır; gövde ateş yönünün tersine yaylanır (yandan ateş yalpa yapar).
   */
  private fire(vehicle: Vehicle): void {
    const launch = muzzleLaunch(vehicle);
    this.projectiles.spawn(vehicle.id, launch.x, launch.y, launch.vx, launch.vy);
    applyRecoil(vehicle);
    this.emit({
      kind: 'fired',
      source: vehicle.id,
      x: launch.x,
      y: launch.y,
      angle: launch.angle,
      vx: launch.vx,
      vy: launch.vy,
    });
  }

  private applyImpactDamage(
    target: EntityId,
    speed: number,
    rule: { readonly minSpeed: number; readonly damagePerSpeed: number },
    cause: DamageCause,
    source?: EntityId,
  ): void {
    if (speed > rule.minSpeed) {
      this.applyDamage(target, (speed - rule.minSpeed) * rule.damagePerSpeed, source, cause);
    }
  }
}
