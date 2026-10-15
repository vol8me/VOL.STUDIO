import { angleDelta } from '@volstudio/core/math';
import { clamp } from '@volstudio/core/math/interpolation';
import type { HoverConfig } from '@/config/hover';
import { PARTS } from '@/config/parts';
import type { SuspensionConfig } from '@/config/tank';
import type { TankCommand } from '../command';
import type { World } from '../world/World';
import { Chassis, type ChassisKind } from '../chassis/Chassis';
import { TRACK_LEFT, TRACK_RIGHT } from '../chassis/parts';

/** Fizik adımı başına alt adım: duvar teması ve hız hedefi 120 Hz çözülür (palet ile aynı). */
const SUBSTEPS = 2;

/** Zeminin süzülen araca yansıyan yüzü: tutuş ivmeyi ve tavanı hafifçe kısar. */
export interface HoverSurface {
  readonly grip: number;
}

/**
 * Süzülen araç. Komut hedef hız vektörüdür (dünya ekseninde), ama araç ona dönmez: gövde NİŞANA bakar
 * ve hız bundan bağımsızdır, yani yana ve geriye aynı hızla süzülür. Fren bilerek zayıftır, araç
 * momentum taşır. Space basılı tutuldukça iticilere yüklenir (atılım): tavanı ve ivmeyi yükseltir,
 * bırakılınca kesilir. Yan itici kırılırsa itki ve denge kaybolur: kapasite düşer, gövde o yana savrulur.
 *
 * Yan yüzey alanları (`track*`, `tread*`, `ground*`, `surface*`) bu gövdede iki yan itici kanalın
 * yüzey hızıdır; kayma yoktur (`slide*`, `slip` sıfır).
 */
export class Hover extends Chassis {
  readonly kind: ChassisKind = 'hover';
  /** Eksik iticilerin bu adıma etkisi: hız/ivme kapasitesi ve gövdeye eklenen dönüş. */
  private capacity = 1;
  private yawBias = 0;

  constructor(
    private readonly hoverConfig: HoverConfig,
    suspension: SuspensionConfig,
  ) {
    super(hoverConfig, suspension, Chassis.footprintInertia(hoverConfig));
  }

  /** Süzülen aracın geri vitesi yoktur: her yön serbesttir. */
  get reversing(): boolean {
    return false;
  }

  /** Süzülen aracın freni yoktur: komut bırakılınca `braking` ivmesiyle yavaşlar. */
  get braking(): boolean {
    return false;
  }

  protected setReversing(_value: boolean): void {
    // Ağ durumundaki bayrak yalnız paletli araç içindir.
  }

  protected resetDrive(): void {
    // Sürüş belleği yoktur: hedef hız her adım komuttan türer.
  }

  step(command: TankCommand, world: World, dt: number, surface?: HoverSurface): void {
    this.contact.speed = 0;
    const config = this.hoverConfig;
    this.limp();
    const length = Math.hypot(command.moveX, command.moveY);
    const moving = length > config.moveDeadzone;
    // Atılım basılı tutulduğu sürece vardır: bırakınca iticiler söner, depo dolmaya başlar.
    this.reserve.update(command.brake || command.boost, dt);
    const dashing = this.reserve.active;
    const mobility = 1 - config.gripSensitivity * (1 - clamp(surface?.grip ?? 1, 0, 1));
    this.traverse(world);
    // Hareket yoksa atılım gövdenin baktığı yöne gider: durduğu yerden de fırlar.
    const wantX = moving ? command.moveX / length : Math.cos(this.angle);
    const wantY = moving ? command.moveY / length : Math.sin(this.angle);
    const pull = dashing ? 1 : moving ? Math.min(1, length) : 0;
    const top = config.maxSpeed * (dashing ? config.dashMultiplier : 1) * mobility * this.capacity;
    const targetX = wantX * pull * top;
    const targetY = wantY * pull * top;
    const facing = this.facing(command, moving);

    const sub = dt / SUBSTEPS;
    for (let index = 0; index < SUBSTEPS; index++) {
      this.integrateHover(sub, targetX, targetY, facing, dashing, mobility);
      this.settleAgainst(world);
    }
    this.updateTurret(command, dt);
  }

  /** Gövde nişana bakar; nişan yoksa (kol bırakılmış) hareket yönüne, o da yoksa olduğu gibi kalır. */
  private facing(command: TankCommand, moving: boolean): number | null {
    if (command.aimX !== 0 || command.aimY !== 0) return Math.atan2(command.aimY, command.aimX);
    return moving ? Math.atan2(command.moveY, command.moveX) : null;
  }

  /**
   * Kırık iticilerin sürüşe etkisi. Her kayıp itici tavanı ve ivmeyi keser; kayıp yan, kırık iticinin
   * tarafına doğru savrulur (hızla orantılı). Rastgelelik yoktur: durum yolu ağ durumundadır.
   */
  private limp(): void {
    const lostLeft = (this.parts & TRACK_LEFT) !== 0 ? 1 : 0;
    const lostRight = (this.parts & TRACK_RIGHT) !== 0 ? 1 : 0;
    if (lostLeft + lostRight === 0) {
      this.capacity = 1;
      this.yawBias = 0;
      return;
    }
    const config = PARTS.hover;
    this.capacity = Math.max(config.floor, 1 - config.podLoss * (lostLeft + lostRight));
    const ratio = Math.min(1, this.speed / this.hoverConfig.maxSpeed);
    this.yawBias = ratio * config.drift * (lostRight - lostLeft);
  }

  private integrateHover(
    dt: number,
    targetX: number,
    targetY: number,
    facing: number | null,
    dashing: boolean,
    mobility: number,
  ): void {
    const config = this.hoverConfig;
    const previousVx = this.vx;
    const previousVy = this.vy;

    const gapX = targetX - this.vx;
    const gapY = targetY - this.vy;
    const gap = Math.hypot(gapX, gapY);
    let forceX = 0;
    let forceY = 0;
    if (gap > 1e-6) {
      const slowing = gapX * this.vx + gapY * this.vy < 0;
      const drive = dashing ? config.dashAcceleration : config.acceleration;
      const limit = (slowing ? config.braking : drive * this.capacity) * mobility;
      const accel = Math.min(limit, gap / dt);
      forceX = (gapX / gap) * accel * this.mass;
      forceY = (gapY / gap) * accel * this.mass;
    }

    const wantedRate =
      (facing === null
        ? 0
        : clamp(
            angleDelta(this.angle, facing) * config.steerGain,
            -config.maxTurnRate,
            config.maxTurnRate,
          )) + this.yawBias;
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
