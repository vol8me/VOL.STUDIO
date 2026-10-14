import { angleDelta } from '@volstudio/core/math';
import { clamp } from '@volstudio/core/math/interpolation';
import type { SuspensionConfig } from '@/config/tank';
import type { WalkerConfig } from '@/config/walker';
import type { TankCommand } from '../command';
import type { World } from '../world/World';
import { Chassis, type ChassisKind } from '../chassis/Chassis';

/** Fizik adımı başına alt adım: duvar teması ve hız hedefi 120 Hz çözülür (palet ile aynı). */
const SUBSTEPS = 2;

/** Zeminin yürüyücüye yansıyan yüzü: tutuş ivmeyi ve tavanı kısar. */
export interface WalkerSurface {
  readonly grip: number;
}

/**
 * Bacaklı yürüyücü. Paletli araçtan farkı sürüştedir: komut hedef hız vektörüdür ve gövde o hıza
 * her yönde (yan, geri) aynı çevikliğiyle ivmelenir; gövde nişana (nişan yoksa harekete) bakar.
 * Atılım (`boost`) tavanı ve ivmeyi geçici yükseltir. Bacak yürüyüşü yalnız görünümdedir: ayaklar
 * yüzeye bastığı yerde kalır ve poz ile hızdan türer, bu yüzden şasi durumuna ek alan girmez.
 *
 * Yan yüzey alanları (`track*`, `tread*`, `ground*`, `surface*`) bu gövdede bacak sıralarının yüzey
 * hızıdır; kayma yoktur (`slide*`, `slip` sıfır).
 */
export class Walker extends Chassis {
  readonly kind: ChassisKind = 'walker';

  constructor(
    private readonly walkerConfig: WalkerConfig,
    suspension: SuspensionConfig,
  ) {
    super(walkerConfig, suspension, Chassis.footprintInertia(walkerConfig));
  }

  /** Yürüyücünün geri vitesi yoktur: her yön ileridir. */
  get reversing(): boolean {
    return false;
  }

  /** Yürüyücünün freni yoktur: komut bırakılınca `braking` ivmesiyle durur. */
  get braking(): boolean {
    return false;
  }

  protected setReversing(_value: boolean): void {
    // Ağ durumundaki bayrak yalnız paletli araç içindir.
  }

  protected resetDrive(): void {
    // Sürüş belleği yoktur: hedef hız her adım komuttan türer.
  }

  step(command: TankCommand, world: World, dt: number, surface?: WalkerSurface): void {
    this.contact.speed = 0;
    const config = this.walkerConfig;
    const length = Math.hypot(command.moveX, command.moveY);
    const moving = length > config.moveDeadzone;
    this.reserve.update(command.boost && moving, dt);
    const dashing = this.reserve.active;
    const mobility = 1 - config.gripSensitivity * (1 - clamp(surface?.grip ?? 1, 0, 1));
    const top = config.maxSpeed * (dashing ? config.dashMultiplier : 1) * mobility;
    const scale = moving ? (Math.min(1, length) * top) / length : 0;
    const targetX = command.moveX * scale;
    const targetY = command.moveY * scale;
    const facing = this.facing(command, moving);

    const sub = dt / SUBSTEPS;
    for (let index = 0; index < SUBSTEPS; index++) {
      this.integrateLegs(sub, targetX, targetY, facing, dashing, mobility);
      this.settleAgainst(world);
    }
    this.updateTurret(command, dt);
  }

  /** Gövdenin bakmak istediği yön: nişan, yoksa hareket; ikisi de yoksa `null` (olduğu yerde kalır). */
  private facing(command: TankCommand, moving: boolean): number | null {
    if (command.aimX !== 0 || command.aimY !== 0) return Math.atan2(command.aimY, command.aimX);
    return moving ? Math.atan2(command.moveY, command.moveX) : null;
  }

  private integrateLegs(
    dt: number,
    targetX: number,
    targetY: number,
    facing: number | null,
    dashing: boolean,
    mobility: number,
  ): void {
    const config = this.walkerConfig;
    const previousVx = this.vx;
    const previousVy = this.vy;

    const gapX = targetX - this.vx;
    const gapY = targetY - this.vy;
    const gap = Math.hypot(gapX, gapY);
    let forceX = 0;
    let forceY = 0;
    if (gap > 1e-6) {
      const slowing = gapX * this.vx + gapY * this.vy < 0;
      const limit =
        (slowing ? config.braking : dashing ? config.dashAcceleration : config.acceleration) *
        mobility;
      const accel = Math.min(limit, gap / dt);
      forceX = (gapX / gap) * accel * this.mass;
      forceY = (gapY / gap) * accel * this.mass;
    }

    const wantedRate =
      facing === null
        ? 0
        : clamp(
            angleDelta(this.angle, facing) * config.steerGain,
            -config.maxTurnRate,
            config.maxTurnRate,
          );
    const spin = clamp(
      (wantedRate - this.angularVelocity) / dt,
      -config.turnAcceleration,
      config.turnAcceleration,
    );
    this.integrate(forceX, forceY, spin * this.inertia, dt);

    const forward = this.forwardSpeed;
    const turn = this.angularVelocity * config.trackOffset;
    this.trackLeft = forward + turn;
    this.trackRight = forward - turn;
    this.surfaceLeft = this.trackLeft;
    this.surfaceRight = this.trackRight;
    this.treadLeft += this.trackLeft * dt;
    this.treadRight += this.trackRight * dt;
    this.groundLeft += Math.abs(this.trackLeft) * dt;
    this.groundRight += Math.abs(this.trackRight) * dt;

    const accelX = (this.vx - previousVx) / dt;
    const accelY = (this.vy - previousVy) / dt;
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    this.suspension.step(
      accelX * cos + accelY * sin,
      -accelX * sin + accelY * cos,
      this.speed,
      (this.treadLeft + this.treadRight) / 2,
      dt,
    );
  }
}
