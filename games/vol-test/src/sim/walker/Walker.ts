import { angleDelta } from '@volstudio/core/math';
import { clamp } from '@volstudio/core/math/interpolation';
import { PARTS } from '@/config/parts';
import type { SuspensionConfig } from '@/config/tank';
import type { WalkerConfig } from '@/config/walker';
import type { TankCommand } from '../command';
import type { World } from '../world/World';
import { Chassis, type ChassisKind } from '../chassis/Chassis';
import { LEGS_PER_SIDE, limpCollapse, lostLegs } from '../chassis/parts';

/** Fizik adımı başına alt adım: duvar teması ve hız hedefi 120 Hz çözülür (palet ile aynı). */
const SUBSTEPS = 2;

/** Zeminin yürüyücüye yansıyan yüzü: tutuş ivmeyi ve tavanı kısar. */
export interface WalkerSurface {
  readonly grip: number;
}

/**
 * Bacaklı yürüyücü. Paletli araçtan farkı sürüştedir: komut hedef hız vektörüdür ve gövde hareket
 * yönüne döner (nişan yalnız tareti sürer); hızı gövdenin hedefe dönüklüğüyle ölçeklenir. Space ile
 * kilitli bir atılım başlar (av atılışı): depo boşalana dek tavanı ve ivmeyi yükseltir, geri alınamaz. Bacak yürüyüşü görünümdedir (ayaklar
 * yüzeye bastığı yerde kalır); fizikte yalnız kırık bacaklar vardır: hız kaybı, sürüklenme ve tökezleme.
 *
 * Yan yüzey alanları (`track*`, `tread*`, `ground*`, `surface*`) bu gövdede bacak sıralarının yüzey
 * hızıdır; kayma yoktur (`slide*`, `slip` sıfır).
 */
export class Walker extends Chassis {
  readonly kind: ChassisKind = 'walker';
  /** Eksik bacakların bu adıma etkisi: hız/ivme kapasitesi ve yöne eklenen dönüş (`limp`). */
  protected capacity = 1;
  protected yawBias = 0;

  constructor(
    protected readonly walkerConfig: WalkerConfig,
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
    this.limp();
    const length = Math.hypot(command.moveX, command.moveY);
    const moving = length > config.moveDeadzone;
    // Atılım kilitlidir: Space ile başlar (depo eşiği aşılmışsa) ve bırakılsa da depo boşalana dek sürer.
    this.reserve.update(command.brake || this.reserve.active, dt);
    const dashing = this.reserve.active;
    const mobility =
      (1 - config.gripSensitivity * (1 - clamp(surface?.grip ?? 1, 0, 1))) * this.traverse(world);
    // Hareket yoksa atılım gövdenin baktığı yöne gider: av atılışı durduğu yerden de başlar.
    const heading = this.steerHeading(
      moving ? Math.atan2(command.moveY, command.moveX) : this.angle,
      dashing,
    );
    const wantX = Math.cos(heading);
    const wantY = Math.sin(heading);
    const pull = dashing ? 1 : moving ? Math.min(1, length) : 0;
    const align = this.alignment(heading, moving || dashing);
    const top =
      config.maxSpeed *
      (dashing ? config.dashMultiplier : align) *
      mobility *
      this.capacity *
      this.gaitFactor();
    const targetX = wantX * pull * top;
    const targetY = wantY * pull * top;
    const facing = moving || dashing ? heading : null;

    const sub = dt / SUBSTEPS;
    for (let index = 0; index < SUBSTEPS; index++) {
      this.integrateLegs(sub, targetX, targetY, facing, dashing, mobility);
      this.settleAgainst(world);
    }
    this.updateTurret(command, dt);
  }

  /**
   * Hareket yönü: komutun istediği yönü sürüşün kullanacağı yöne çevirir. Yürüyücü komutu olduğu gibi
   * izler; sıçrayıcı havadayken fırlatma yönüne kilitlenir.
   */
  protected steerHeading(wanted: number, _dashing: boolean): number {
    return wanted;
  }

  /** Bir yandaki bacak sayısı: kayıp oranı ve tökezleme bununla ölçeklenir. */
  protected get legsPerSide(): number {
    return LEGS_PER_SIDE;
  }

  /** Kırık bacağın sürüşe etkisinin sayıları (`config/parts.ts`). */
  protected get limpConfig(): typeof PARTS.walker | typeof PARTS.leaper {
    return PARTS.walker;
  }

  /** Adım döngüsünün tavana çarpanı; çok bacaklı yürüyücüde adım hıza dokunmaz. */
  protected gaitFactor(): number {
    return 1;
  }

  /**
   * Gövde hedef yöne ne kadar dönükse o kadar hızlı yürür: tam yan ya da ters yönde `turnSpeedFloor`
   * oranına düşer. Böylece yürüyücü tank gibi yana kaymaz; önce döner, sonra açılır.
   */
  private alignment(heading: number, active: boolean): number {
    if (!active) return 1;
    const floor = this.walkerConfig.turnSpeedFloor;
    const facing = (1 + Math.cos(angleDelta(this.angle, heading))) / 2;
    return floor + (1 - floor) * facing;
  }

  /**
   * Kırık bacakların sürüşe etkisi. Her kayıp bacak tavanı ve ivmeyi keser; bir yanın bacakları
   * eksikse yürüyüş o yana sürüklenir. Eksik yan, kendi yürüyüş döngüsünde (katettiği yoldan türer,
   * rastgelelik yok) çöker: hız kesilir ve gövde o yana savrulur. Durum yolu ağ durumundadır, bu yüzden
   * sunucu ile öngörü aynı tökezlemeyi yürür.
   */
  protected limp(): void {
    const lostLeft = lostLegs(this.parts, 0);
    const lostRight = lostLegs(this.parts, 1);
    if (lostLeft + lostRight === 0) {
      this.capacity = 1;
      this.yawBias = 0;
      return;
    }
    const config = this.limpConfig;
    const legs = this.legsPerSide;
    const { dip, sway, stride } = config.stumble;
    const left = limpCollapse(lostLeft, this.groundLeft, legs, stride);
    const right = limpCollapse(lostRight, this.groundRight, legs, stride);
    const ratio = Math.min(1, this.speed / this.walkerConfig.maxSpeed);
    const lost = lostLeft + lostRight;
    this.capacity =
      Math.max(config.floor, 1 - config.legLoss * lost) * (1 - Math.min(0.6, dip * (left + right)));
    this.yawBias = ratio * ((config.drift * (lostRight - lostLeft)) / legs + sway * (right - left));
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
