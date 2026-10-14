import { approach, clamp } from '@volstudio/core/math/interpolation';
import type { SuspensionConfig, TankConfig } from '@/config/tank';
import type { TankCommand } from '../command';
import type { World } from '../world/World';
import { Chassis, type ChassisKind } from '../chassis/Chassis';
import { TRACK_LEFT, TRACK_RIGHT } from '../chassis/parts';
import { Driver, type TrackTargets } from './Driver';
import { computeTrackForces, createTrackForces, type TrackSurface } from './trackForces';

/** Fizik adımı başına alt adım: sürtünme kuvvetleri sert, 120 Hz kararlı kalır. */
const SUBSTEPS = 2;

/**
 * Paletli tank: iki palet, sürücü ve palet–zemin kuvvetleri. Her adımda sürücü palet hedeflerini
 * seçer, paletler zemine kuvvet uygular (`trackForces`), gövde bu kuvvetle ilerler, duvar teması
 * çözülür (`settleAgainst`) ve kuvvetler süspansiyonu sürer. Poz, durum ve temas `Chassis`'tedir.
 */
export class Tank extends Chassis {
  readonly kind: ChassisKind = 'tank';
  private readonly driver: Driver;
  private readonly targets: TrackTargets = { left: 0, right: 0, forward: false, braking: false };
  private readonly forces = createTrackForces();
  /** Kırık paletler: sürmez, serbest döner ve yerde sürünür (`PARTS.tank`). */
  private readonly broken = { left: false, right: false };

  constructor(
    private readonly tankConfig: TankConfig,
    suspension: SuspensionConfig,
  ) {
    super(tankConfig, suspension, Chassis.footprintInertia(tankConfig));
    this.driver = new Driver(tankConfig);
  }

  get reversing(): boolean {
    return this.driver.reversing;
  }

  /** Fren basılı: paletler kilitli. */
  get braking(): boolean {
    return this.targets.braking;
  }

  protected setReversing(value: boolean): void {
    this.driver.reversing = value;
  }

  protected resetDrive(): void {
    this.driver.reversing = false;
    this.targets.left = 0;
    this.targets.right = 0;
    this.targets.forward = false;
    this.targets.braking = false;
  }

  step(command: TankCommand, world: World, dt: number, surface?: TrackSurface): void {
    this.contact.speed = 0;
    this.broken.left = (this.parts & TRACK_LEFT) !== 0;
    this.broken.right = (this.parts & TRACK_RIGHT) !== 0;
    const forward = this.plan(command, false).forward;
    this.reserve.update(command.boost && forward, dt);
    this.plan(command, this.reserve.active);

    const sub = dt / SUBSTEPS;
    for (let index = 0; index < SUBSTEPS; index++) {
      this.integrateTracks(sub, surface);
      this.settleAgainst(world);
    }
    this.updateTurret(command, dt);
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

  private integrateTracks(dt: number, surface?: TrackSurface): void {
    this.driveTracks(dt);

    const forces = computeTrackForces(
      this,
      this.trackLeft,
      this.trackRight,
      this.reserve.active,
      this.tankConfig,
      this.forces,
      surface,
      this.broken,
    );
    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);
    this.integrate(
      forces.forward * fx - forces.lateral * fy,
      forces.forward * fy + forces.lateral * fx,
      forces.torque,
      dt,
    );

    this.surfaceLeft = forces.groundLeft;
    this.surfaceRight = forces.groundRight;
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
    this.driveWorkingTracks(dt);
    // Kırık palet zeminle aynı hızda serbest döner: itki vermez, kayma da üretmez.
    const free = this.forwardSpeed;
    const turning = this.angularVelocity * this.tankConfig.trackOffset;
    if (this.broken.left) this.trackLeft = free + turning;
    if (this.broken.right) this.trackRight = free - turning;
  }

  private driveWorkingTracks(dt: number): void {
    const config = this.tankConfig;
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
}
