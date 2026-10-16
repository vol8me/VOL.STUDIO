import { WEAPON_STYLES, type WeaponConfig } from '@/config/tank';
import { STRIKER, type VehicleSpec } from '@/config/vehicles';
import { COMBAT, PROJECTILE_CAPACITY, type CombatConfig } from '@/config/combat';
import { PARTS } from '@/config/parts';
import { bitIndex, partSide } from './chassis/parts';
import { idleCommand, type TankCommand } from './command';
import { Projectiles, type ProjectileTarget } from './combat/Projectiles';
import { Vehicle, type EntityId } from './entities/Vehicle';
import type { DamageCause, SimEvent } from './events';
import {
  createContact,
  resolveBodyContact,
  RigidBody,
  type Contact,
} from '@volstudio/core/physics';
import { CHAOS, validChaos } from '@/config/chaos';
import type { Chassis } from './chassis/Chassis';
import type { ChassisPose } from './chassis/ChassisState';
import { aimAligned, launchFrom, triggerVolley, type LaunchBuffer } from './vehicleStep';
import type { World } from './world/World';
import type { WeatherSystem } from './weather/WeatherSystem';
import { WEATHER } from '@/config/weather';
import { WORLD } from '@/config/world';
import { ROCKS } from '@/config/rocks';
import { WADING } from '@/config/lakes';
import { drowningRate } from './world/wading';

export interface SimulationOptions {
  readonly world: World;
  /** Araç belirtilmeyen doğuşların tanımı (varsayılan Striker). */
  readonly vehicle?: VehicleSpec;
  readonly combat?: CombatConfig;
  readonly weather?: WeatherSystem;
  /**
   * Varsayılan `true`: hava sürüşe (tutuş, direnç) ve mermiye (rüzgâr, sürükleme) etki eder.
   * `false`: hava yalnız ilerler ve araçların izini (kar sıkışması, ezilen yeşillik) alır; sürüş ve
   * mermi hava yokmuş gibi davranır. Çevrimiçi sunucu böyle kurulur: hava ortak iklimdir ama yetkili
   * fizik, öngörüyü yapan istemciyle aynı kalır.
   */
  readonly weatherEffects?: boolean;
  /**
   * Varsayılan `true`: dünya merkezinde kontrol edilen bir araç doğar. Sunucu
   * dünyası `false` verir; araçlar bağlanan oyuncuyla doğar ve çıkınca kalkar,
   * sahipsiz bir gövde dünyada kalmaz.
   */
  readonly spawnPlayer?: boolean;
  /** Aynı anda havada kalabilen mermi tavanı (varsayılan `PROJECTILE_CAPACITY`). */
  readonly projectileCapacity?: number;
}

/** Araç kimliğinden o adımın komutu; verilmeyen araç boşta kalır. */
export type CommandSource = (vehicle: Vehicle) => TankCommand;

/** Olay kuyruğunun tavanı: boşaltılmayan kuyruk belleği büyütmez. */
const MAX_EVENTS = 512;
/** Araç/duvar temas çözümünün üst sınırı: sıkışık kümede de adım süresi sabit kalır. */
/** Enkazın temsil cisminin kütlesi ve eylemsizliği: çarpan araca göre sonsuz sayılır. */
const WRECK_MASS = 1e12;
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
  /** Hava sürüşe ve mermiye etki ediyor mu (`SimulationOptions.weatherEffects`). */
  private readonly weatherEffects: boolean;
  private readonly vehicleList: Vehicle[] = [];
  private readonly options: SimulationOptions;
  private readonly defaultSpec: VehicleSpec;
  private readonly combat: CombatConfig;
  /** Silahın mermi profili ve profilden silaha dönüş (isabet hasarı profilin silahından okunur). */
  private readonly weaponProfiles = new Map<WeaponConfig, number>();
  private readonly profileWeapons: WeaponConfig[] = [];
  private readonly events: SimEvent[] = [];
  private readonly previewPose: ChassisPose = { x: 0, y: 0, hull: 0, turret: 0, pitch: 0, roll: 0 };
  private readonly previewLaunch: LaunchBuffer = { x: 0, y: 0, vx: 0, vy: 0, angle: 0 };
  private readonly contact = createContact();
  /** Enkazın yerine geçen oynamaz cisim: kütlesi sonsuza yakındır, temasta yalnız çarpan taraf itilir. */
  private readonly anchor = new RigidBody(WRECK_MASS, WRECK_MASS);
  private readonly pacedContact = createContact();
  private tempo: number = CHAOS.default;
  private readonly inputs = new Map<EntityId, TankCommand>();
  /** Boğulma hasarının henüz olaya dönmemiş birikimi (araç başına, can birimi). */
  private readonly drownCarry = new Map<EntityId, number>();
  private readonly collisionDamagePairs = new Set<string>();
  private nextId: EntityId = 1;
  private playerId: EntityId | null = null;
  timeMs = 0;

  constructor(options: SimulationOptions) {
    this.options = options;
    this.defaultSpec = options.vehicle ?? STRIKER;
    this.combat = options.combat ?? COMBAT;
    this.world = options.world;
    this.weather = options.weather;
    this.weatherEffects = options.weatherEffects !== false;
    const weapon = this.defaultSpec.armament.weapon;
    this.projectiles = new Projectiles(
      options.projectileCapacity ?? PROJECTILE_CAPACITY,
      weapon.projectileLifeMs,
      weapon.flight,
    );
    this.profileWeapons[0] = weapon;
    this.applyAir();
    if (options.spawnPlayer !== false) {
      const center = this.world.center;
      this.playerId = this.spawn(center.x, center.y).id;
    }
  }

  get vehicles(): readonly Vehicle[] {
    return this.vehicleList;
  }

  /**
   * Kaos çarpanı (`CHAOS`): araçların hareketi bu kadar hızlı akar, silah beklemesi bu kadar kısalır.
   * Fizik adımı sabit kalır; çarpan 1'in üstündeyse aynı karede birkaç küçük alt adım atılır.
   */
  get pace(): number {
    return this.tempo;
  }

  set pace(value: number) {
    if (!validChaos(value)) throw new RangeError('Kaos çarpanı izinli aralıkta olmalı');
    this.tempo = value;
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
   * Silahın mermi profili; ilk kullanımda kaydedilir. Uzaktan ateşi çizen istemci de mermiyi
   * sahibin silahının profiliyle doğurur.
   */
  profileFor(weapon: WeaponConfig): number {
    let profile = this.weaponProfiles.get(weapon);
    if (profile === undefined) {
      profile = this.projectiles.addProfile(
        weapon.projectileLifeMs,
        weapon.flight,
        WEAPON_STYLES.indexOf(weapon.style),
      );
      this.weaponProfiles.set(weapon, profile);
      this.profileWeapons[profile] = weapon;
    }
    return profile;
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
    spec: VehicleSpec = this.defaultSpec,
  ): Vehicle {
    if (team !== null && !Number.isSafeInteger(team))
      throw new RangeError('Takım kimliği güvenli tamsayı olmalı');
    if (id !== undefined && (!Number.isSafeInteger(id) || id < 1 || this.vehicle(id)))
      throw new RangeError('Araç kimliği pozitif, güvenli ve tekil tamsayı olmalı');
    this.nextId = Math.max(this.nextId, (id ?? 0) + 1);
    this.profileFor(spec.armament.weapon);
    const vehicle = new Vehicle(id ?? this.nextId++, spec, this.combat, team);
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
    this.drownCarry.delete(id);
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
    target.wear.touch();
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

  /**
   * Yüzemeyen araç derin suda can yitirir; hasar kaynaksızdır (`drown`). Küçük parçalar birikir ve
   * `WADING.hurtChunk` oranında tek olayla uygulanır; merkez dibe (`WADING.bottomDepth`) varınca
   * araç canına bakılmadan çöker. Süzülen araç yüzer, hasar almaz.
   */
  private drown(vehicle: Vehicle, dt: number): void {
    const chassis = vehicle.chassis;
    if (
      chassis.kind !== 'hover' &&
      chassis.waterDepth >= WADING.bottomDepth &&
      vehicle.vitality.alive
    ) {
      // Merkez dibe değdi: can ve doğma koruması ne olursa olsun araç çöker.
      this.drownCarry.delete(vehicle.id);
      vehicle.vitality.protectionRemainingMs = 0;
      this.applyDamage(vehicle.id, vehicle.vitality.maxHealth, undefined, 'drown');
      return;
    }
    const rate = chassis.kind === 'hover' ? 0 : drowningRate(chassis.waterDepth);
    if (rate <= 0) {
      this.drownCarry.delete(vehicle.id);
      return;
    }
    const carry = (this.drownCarry.get(vehicle.id) ?? 0) + rate * vehicle.vitality.maxHealth * dt;
    if (carry < vehicle.vitality.maxHealth * WADING.hurtChunk) {
      this.drownCarry.set(vehicle.id, carry);
      return;
    }
    this.drownCarry.delete(vehicle.id);
    this.applyDamage(vehicle.id, carry, undefined, 'drown');
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
    this.drownCarry.delete(vehicle.id);
    const { halfLength, halfWidth } = vehicle.chassis.shape;
    const bodyRadius = Math.hypot(halfLength, halfWidth);
    vehicle.chassis.resetForRespawn(
      Math.max(bodyRadius, Math.min(this.world.width - bodyRadius, nextX)),
      Math.max(bodyRadius, Math.min(this.world.height - bodyRadius, nextY)),
      nextHull,
    );
    vehicle.gun.reset();
    vehicle.wear.reset();
    vehicle.salvo = 0;
    vehicle.vitality.respawn();
    this.emit({
      kind: 'respawned',
      target: vehicle.id,
      x: vehicle.chassis.x,
      y: vehicle.chassis.y,
    });
  }

  /**
   * İsabetin parça aşınması: temas noktasındaki parça aşınır ve dayanımı bitince kopar. Kopan parça
   * `chassis.parts`a yazılır, gövdeyi o yana sarsar ve `broke` olayı yayar.
   */
  private wearParts(vehicle: Vehicle, x: number, y: number, damage: number): void {
    const broken = vehicle.wear.strike(vehicle.chassis, x, y, damage);
    const kind = vehicle.spec.kind;
    for (let bits = broken; bits !== 0; bits &= bits - 1) {
      const bit = bits & -bits;
      const part = bitIndex(bit);
      vehicle.chassis.parts |= bit;
      vehicle.chassis.jolt(partSide(kind, part), PARTS[kind].jolt);
      this.emit({ kind: 'broke', target: vehicle.id, part, x, y });
    }
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
    this.applyAir();
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
      if (vehicle.vitality.alive) vehicle.wear.step(vehicle.chassis, stepMs);
      const tank = vehicle.chassis;
      tank.capturePose();
      const command = this.inputs.get(vehicle.id)!;
      Object.assign(command, commandFor(vehicle));
      if (!vehicle.vitality.alive) continue;
      const x = tank.x;
      const y = tank.y;
      const groundLeft = tank.groundLeft;
      const groundRight = tank.groundRight;
      this.driveChassis(
        vehicle,
        command,
        dt,
        this.weather && this.weatherEffects ? this.weather.sample(x, y) : undefined,
      );
      this.drown(vehicle, dt);
      if (this.weather) {
        const amountPerUnit = WEATHER.tank.snowCompactionPerMetre / WORLD.metre / 2;
        const tramplePerUnit = WEATHER.growth.tramplePerMetre / WORLD.metre / 2;
        const offsetX = -Math.sin(tank.hull) * tank.trackOffset;
        const offsetY = Math.cos(tank.hull) * tank.trackOffset;
        const left = tank.groundLeft - groundLeft;
        const right = tank.groundRight - groundRight;
        this.weather.compress(tank.x - offsetX, tank.y - offsetY, left * amountPerUnit);
        this.weather.compress(tank.x + offsetX, tank.y + offsetY, right * amountPerUnit);
        // Geçen palet ve ayak yeşilliği ezer; süzülen araç yere değmez.
        if (tank.kind !== 'hover') {
          this.weather.trample(tank.x - offsetX, tank.y - offsetY, left * tramplePerUnit);
          this.weather.trample(tank.x + offsetX, tank.y + offsetY, right * tramplePerUnit);
        }
      }
    }
    this.settleContacts();
    for (const vehicle of this.vehicleList) {
      if (!vehicle.vitality.alive) continue;
      const contact = vehicle.chassis.contact;
      if (contact.speed > vehicle.chassis.impactEventSpeed) {
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
      vehicle.gun.update(stepMs * this.tempo);
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
        const weapon = this.profileWeapons[projectile.profile];
        const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
        const impulse = weapon.hitImpulse * (speed / weapon.projectileSpeed);
        struck.chassis.applyImpulse(
          (projectile.vx / speed) * impulse,
          (projectile.vy / speed) * impulse,
          projectile.x,
          projectile.y,
        );
        const applied = this.applyDamage(struck.id, weapon.damage, projectile.owner, 'projectile');
        if (applied > 0 && struck.vitality.alive)
          this.wearParts(struck, projectile.x, projectile.y, applied);
      },
      (owner, target) => this.canProjectileHit(owner, target),
    );
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  /**
   * Şasiyi bir adım sürer. Kaos çarpanı kadar zaman akar: 1'in üstünde adım eşit alt adımlara bölünür
   * (her alt adım en çok bir adım uzunluğundadır; çarpışma ve süspansiyon kararlı kalır) ve adımın en sert
   * duvar teması korunur, yoksa ilk alt adımdaki çarpma sonrakilerce silinirdi.
   */
  private driveChassis(
    vehicle: Vehicle,
    command: TankCommand,
    dt: number,
    surface: Parameters<Chassis['step']>[3],
  ): void {
    const chassis = vehicle.chassis;
    const calls = Math.max(1, Math.ceil(this.tempo));
    if (calls === 1 && this.tempo === 1) {
      chassis.step(command, this.world, dt, surface);
      return;
    }
    const slice = (dt * this.tempo) / calls;
    const hardest: Contact = this.pacedContact;
    hardest.speed = 0;
    for (let index = 0; index < calls; index++) {
      chassis.step(command, this.world, slice, surface);
      if (chassis.contact.speed > hardest.speed) Object.assign(hardest, chassis.contact);
    }
    if (hardest.speed > chassis.contact.speed) Object.assign(chassis.contact, hardest);
  }

  /** Hava mermiye etki ediyorsa güncel rüzgâr ve sürükleme mermilere bildirilir. */
  private applyAir(): void {
    if (this.weather && this.weatherEffects) this.projectiles.setAir(this.weather.frame);
  }

  /**
   * Aracın şimdi ateş etmesi hâlinde mermisinin gideceği yol. `pose` verilirse atış o pozdan
   * türetilir (görünümün ara değerli karesi: nişan çizgisi ekrandaki namluyla aynı doğrultuda
   * kalır); verilmezse güncel adımın pozu kullanılır.
   */
  previewAim(vehicle: Vehicle, stepMs: number, pose?: ChassisPose) {
    this.applyAir();
    const tank = vehicle.chassis;
    // Çizgi sıradaki atışın namlusundan çıkar: iki silahlı araçta yuvalar sırayla ateşlenir ve çizgi onları izler.
    const mount = vehicle.armament.salvo[vehicle.salvo]?.[0] ?? 0;
    const launch = launchFrom(
      pose ?? tank.readPose(this.previewPose),
      tank.vx,
      tank.vy,
      vehicle.armament,
      mount,
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
      this.profileFor(vehicle.weapon),
      this.elevationOf(vehicle),
    );
  }

  /**
   * Aracın zeminden yüksekliği (dünya birimi): kayaya tırmanan araç `climb` oranında yükselir. Mermi
   * namlu yüksekliğine bunu ekler; kayanın tepesindeki araç siper yüksekliğinin üstünden ateş eder.
   */
  elevationOf(vehicle: Vehicle): number {
    return vehicle.chassis.climb * ROCKS.coverHeight;
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
        if (!a.vitality.alive || !b.vitality.alive) {
          // İki enkaz birbirine değmez; canlı araç enkaza katı bir engel gibi çarpar.
          if (
            a.vitality.alive !== b.vitality.alive &&
            this.collideWreck(a.vitality.alive ? a : b, a.vitality.alive ? b : a)
          )
            moved = true;
          continue;
        }
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
        if (hit.speed <= Math.min(a.chassis.impactEventSpeed, b.chassis.impactEventSpeed)) continue;
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
   * Canlı aracın yerde kalan enkaza çarpması: enkaz yerinden oynamaz, araç dışarı itilir ve sekir.
   * Enkaza çarpmak hasar vermez (enkaz zaten ölüdür); çarpma olayı ses ve titreşim için yine yazılır.
   */
  private collideWreck(mover: Vehicle, wreck: Vehicle): boolean {
    const body = this.anchor;
    const chassis = wreck.chassis;
    body.reset(chassis.x, chassis.y, chassis.angle);
    const x = mover.chassis.x;
    const y = mover.chassis.y;
    const hit = resolveBodyContact(
      mover.chassis,
      mover.chassis.shape,
      body,
      chassis.shape,
      this.contact,
    );
    const moved = mover.chassis.x !== x || mover.chassis.y !== y;
    if (hit.speed > mover.chassis.impactEventSpeed) {
      mover.chassis.kickFrom(hit);
      this.emit({
        kind: 'collision',
        a: mover.id,
        b: wreck.id,
        x: hit.x,
        y: hit.y,
        normalX: hit.normalX,
        normalY: hit.normalY,
        speed: hit.speed,
      });
    }
    return moved;
  }

  /**
   * Sıradaki yuva grubunun mermileri namludan aracın hızını devralarak çıkar. Araca ters yönde
   * itki uygulanır; gövde ateş yönünün tersine yaylanır (yandan ateş yalpa yapar).
   */
  private fire(vehicle: Vehicle): void {
    const profile = this.profileFor(vehicle.weapon);
    triggerVolley(vehicle, (launch, mount) => {
      this.projectiles.spawn(
        vehicle.id,
        launch.x,
        launch.y,
        launch.vx,
        launch.vy,
        profile,
        this.elevationOf(vehicle),
      );
      this.emit({
        kind: 'fired',
        source: vehicle.id,
        mount,
        x: launch.x,
        y: launch.y,
        angle: launch.angle,
        vx: launch.vx,
        vy: launch.vy,
      });
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
