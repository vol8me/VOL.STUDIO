import { approach } from '@volstudio/core/math/interpolation';
import type { TankCommand } from '../command';
import { RigidBody } from '../physics/RigidBody';
import {
  createContact,
  resolveWallContacts,
  type Contact,
  type ContactShape,
} from '../physics/wallContact';
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
  /** Palet yüzeyi ile zemin arasındaki en büyük hız farkı (birim/s): patinaj. */
  slip = 0;
  /** Bu adımdaki en sert duvar teması; `speed` 0 ise temas yok. */
  readonly contact: Contact = createContact();
  readonly suspension: Suspension;
  readonly previous: TankPose = { x: 0, y: 0, hull: 0, turret: 0, pitch: 0, roll: 0 };
  private readonly driver: Driver;
  private readonly turretMount: Turret;
  private readonly reserve: BoostReserve;
  private readonly shape: ContactShape;
  private readonly targets: TrackTargets = { left: 0, right: 0, forward: false };
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
    const accel = this.config.trackAcceleration * dt;
    this.trackLeft = approach(this.trackLeft, this.targets.left, accel);
    this.trackRight = approach(this.trackRight, this.targets.right, accel);

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

  /** Duvar temasını çözer; en sert çarpmayı kaydeder ve süspansiyonu vurur. */
  private resolveContacts(world: World): void {
    const hit = resolveWallContacts(this, world.walls, this.shape, this.substepContact);
    if (hit.speed <= this.contact.speed) return;
    Object.assign(this.contact, hit);
    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);
    const kick = hit.speed * this.config.impactKick;
    this.suspension.kick(
      -(hit.normalX * fx + hit.normalY * fy) * kick,
      -(-hit.normalX * fy + hit.normalY * fx) * kick,
    );
  }
}
