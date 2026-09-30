import { approach, clamp } from '@volstudio/core/math/interpolation';
import {
  createContact,
  resolveWallContacts,
  RigidBody,
  type Contact,
  type ContactShape,
} from '@volstudio/core/physics';
import type { TankCommand } from '../command';
import type { World } from '../world/World';
import { BoostReserve } from './BoostReserve';
import { Driver, type TrackTargets } from './Driver';
import { Suspension } from './Suspension';
import { computeTrackForces, createTrackForces } from './trackForces';
import { Turret } from './Turret';
import type { SuspensionConfig, TankConfig } from '@/config/tank';

/** Render ara değeri için tankın poz kaydı. */
export interface TankPose {
  x: number;
  y: number;
  hull: number;
  turret: number;
  pitch: number;
  roll: number;
}

/** Fizik adımı başına alt adım: sürtünme kuvvetleri sert, 120 Hz kararlı kalır. */
const SUBSTEPS = 2;

/**
 * Paletli tank: katı cisim gövde, iki palet, stabilizatörlü taret, hızlanma
 * deposu ve yaylı süspansiyon. Her adımda sürücü palet hedeflerini seçer,
 * paletler zemine kuvvet uygular (`trackForces`), gövde bu kuvvetle ilerler,
 * duvar teması çözülür (`wallContact`) ve kuvvetler süspansiyonu sürer.
 */
export class Tank extends RigidBody {
  /** Palet yüzey hızları (birim/s). */
  trackLeft = 0;
  trackRight = 0;
  /** Palet yüzeyinin katettiği yol; görünüm palet dokusunu bununla kaydırır. */
  treadLeft = 0;
  treadRight = 0;
  /** Paletlerin yerde katettiği yol; patinajda yüzey yolundan ayrışır (iz bununla bırakılır). */
  groundLeft = 0;
  groundRight = 0;
  /** Palet yüzeyinin zemine göre kayma hızı (birim/s); izler ve toz bununla seçilir. */
  slideLeft = 0;
  slideRight = 0;
  /** İki paletin en büyük kayma hızı: patinaj, kilitli kayma ya da yanal kayma. */
  slip = 0;
  /** Bu adımdaki en sert DUVAR teması; `speed` 0 ise temas yok. */
  readonly contact: Contact = createContact();
  readonly suspension: Suspension;
  readonly previous: TankPose = { x: 0, y: 0, hull: 0, turret: 0, pitch: 0, roll: 0 };
  private readonly driver: Driver;
  private readonly turretMount: Turret;
  private readonly reserve: BoostReserve;
  /** Ayak izi ve temas malzemesi (duvar ve araç teması aynı şekli kullanır). */
  readonly shape: ContactShape;
  private readonly targets: TrackTargets = { left: 0, right: 0, forward: false, braking: false };
  private readonly forces = createTrackForces();
  private readonly substepContact: Contact = createContact();

  constructor(
    private readonly config: TankConfig,
    suspension: SuspensionConfig,
  ) {
    super(
      config.mass,
      RigidBody.boxInertia(config.mass, config.halfLength * 2, config.halfWidth * 2),
    );
    this.driver = new Driver(config);
    this.turretMount = new Turret(config);
    this.reserve = new BoostReserve(config);
    this.suspension = new Suspension(suspension);
    this.shape = {
      halfLength: config.halfLength,
      halfWidth: config.halfWidth,
      restitution: config.wallRestitution,
      friction: config.wallFriction,
    };
  }

  /** Gövde yönü: katı cismin açısı. */
  get hull(): number {
    return this.angle;
  }

  set hull(value: number) {
    this.angle = value;
  }

  get turret(): number {
    return this.turretMount.angle;
  }

  get boost(): number {
    return this.reserve.energy;
  }

  get boosting(): boolean {
    return this.reserve.active;
  }

  get reversing(): boolean {
    return this.driver.reversing;
  }

  /** Fren basılı: paletler kilitli. */
  get braking(): boolean {
    return this.targets.braking;
  }

  /** Nokta tankın ayak izinin içinde mi (mermi isabeti). */
  contains(px: number, py: number): boolean {
    const dx = px - this.x;
    const dy = py - this.y;
    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);
    return (
      Math.abs(dx * fx + dy * fy) <= this.shape.halfLength &&
      Math.abs(-dx * fy + dy * fx) <= this.shape.halfWidth
    );
  }

  /**
   * Çarpmanın süspansiyona vuruşu: gövde çarpma yönüne yaylanır. Duvar ve
   * araç teması aynı yoldan geçer.
   */
  kickFrom(hit: Contact): void {
    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);
    const kick = hit.speed * this.config.impactKick;
    this.suspension.kick(
      -(hit.normalX * fx + hit.normalY * fy) * kick,
      -(-hit.normalX * fy + hit.normalY * fx) * kick,
    );
  }

  place(x: number, y: number, hull = -Math.PI / 2): void {
    this.reset(x, y, hull);
    this.turretMount.reset(this.angle);
    this.trackLeft = 0;
    this.trackRight = 0;
    this.capturePose();
  }

  /** Adım başında çağrılır; render bu pozdan günceline ara değer alır. */
  capturePose(): void {
    const pose = this.previous;
    pose.x = this.x;
    pose.y = this.y;
    pose.hull = this.angle;
    pose.turret = this.turretMount.angle;
    pose.pitch = this.suspension.pitch;
    pose.roll = this.suspension.roll;
  }

  step(command: TankCommand, world: World, dt: number): void {
    this.contact.speed = 0;
    const forward = this.plan(command, false).forward;
    this.reserve.update(command.boost && forward, dt);
    this.plan(command, this.reserve.active);

    const sub = dt / SUBSTEPS;
    for (let index = 0; index < SUBSTEPS; index++) {
      this.integrateTracks(sub);
      this.resolveContacts(world);
    }
    this.turretMount.update(command, this.angle, dt);
  }

  private plan(command: TankCommand, boosting: boolean): TrackTargets {
    return this.driver.plan(
      command,
      this.angle,
      this.angularVelocity,
      this.forwardSpeed,
      boosting,
      this.targets,
    );
  }

  private integrateTracks(dt: number): void {
    this.driveTracks(dt);

    const forces = computeTrackForces(
      this,
      this.trackLeft,
      this.trackRight,
      this.reserve.active,
      this.config,
      this.forces,
    );
    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);
    this.integrate(
      forces.forward * fx - forces.lateral * fy,
      forces.forward * fy + forces.lateral * fx,
      forces.torque,
      dt,
    );

    this.slideLeft = forces.slideLeft;
    this.slideRight = forces.slideRight;
    this.slip = forces.slip;
    this.treadLeft += this.trackLeft * dt;
    this.treadRight += this.trackRight * dt;
    this.groundLeft += Math.abs(forces.groundLeft) * dt;
    this.groundRight += Math.abs(forces.groundRight) * dt;
    this.suspension.step(
      forces.forward / this.mass,
      forces.lateral / this.mass,
      Math.abs(this.forwardSpeed),
      (this.treadLeft + this.treadRight) / 2,
      dt,
    );
  }

  /**
   * Palet yüzey hızlarını hedefe sürer. Fren paletleri kilitler. Sürüşte ortak
   * hız ve direksiyon farkı ayrı ivmelenir: gaz bırakılınca ortak hız motor
   * freniyle azalır, direksiyon farkı çevik kalır. Aktarma paleti zeminden
   * `driveSlip`ten çok ayıramaz (tork sınırlı).
   */
  private driveTracks(dt: number): void {
    const config = this.config;
    const targets = this.targets;
    if (targets.braking) {
      const lock = config.brakeAcceleration * dt;
      this.trackLeft = approach(this.trackLeft, 0, lock);
      this.trackRight = approach(this.trackRight, 0, lock);
      return;
    }
    const accel = config.trackAcceleration * dt;
    const common = (this.trackLeft + this.trackRight) / 2;
    const spin = (this.trackLeft - this.trackRight) / 2;
    const targetCommon = (targets.left + targets.right) / 2;
    const coasting = targetCommon * common >= 0 && Math.abs(targetCommon) < Math.abs(common);
    const nextCommon = approach(common, targetCommon, coasting ? config.engineBraking * dt : accel);
    const nextSpin = approach(spin, (targets.left - targets.right) / 2, accel);
    const forward = this.forwardSpeed;
    const turning = this.angularVelocity * config.trackOffset;
    this.trackLeft = clamp(
      nextCommon + nextSpin,
      forward + turning - config.driveSlip,
      forward + turning + config.driveSlip,
    );
    this.trackRight = clamp(
      nextCommon - nextSpin,
      forward - turning - config.driveSlip,
      forward - turning + config.driveSlip,
    );
  }

  /** Duvar temasını çözer; adımdaki en sert duvar çarpması kaydedilir. */
  private resolveContacts(world: World): void {
    const hit = resolveWallContacts(this, world.walls, this.shape, this.substepContact);
    if (hit.speed <= this.contact.speed) return;
    Object.assign(this.contact, hit);
    this.kickFrom(hit);
  }
}
