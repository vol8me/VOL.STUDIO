import { angleDelta } from '@volstudio/core/math';
import { clamp } from '@volstudio/core/math/interpolation';
import type { SuspensionConfig } from '@/config/tank';
import type { WalkerConfig } from '@/config/walker';
import type { TankCommand } from '../command';
import type { World } from '../world/World';
import { Walker, type WalkerSurface } from './Walker';

/** Havadaki aracın hızı bunun altındaysa fırlatma yönü yoktur: komutun yönü kullanılır. */
const LEAP_MIN_SPEED = 30;

/**
 * Atılımı bir SIÇRAMAYA çeviren yürüyücü (Arachnid, Widow ve temel olarak sıçrayıcılar). Havadaki araç
 * (atılım deposu aktif) kayadan geçer, sudan etkilenmez ve boğulmaz. Fırlatma yönü komuttan okunur; sonra
 * balistiktir: hız yönü yalnız `leapTurnRate` hızıyla komuta döner. Havada olmak yeni bir ağ durumu
 * değildir: depo ve hız zaten durumdadır, sunucu ve öngörü aynı kavisi çizer.
 *
 * Yerdeki sürüş yürüyücününkidir; sıçrayıcının sekme, geniş yay ve iniş çömelmesi `Leaper`dadır.
 */
export class LeapingWalker extends Walker {
  /** Bu adım sıçramanın ilk adımı mı (fırlatma yönü komuttan okunur); türetilmiş, ağ durumunda değildir. */
  private launching = true;

  constructor(
    private readonly leapConfig: WalkerConfig,
    suspension: SuspensionConfig,
  ) {
    super(leapConfig, suspension);
  }

  /** Havada mı: sıçrama deposu aktif. */
  override get airborne(): boolean {
    return this.reserve.active;
  }

  override step(command: TankCommand, world: World, dt: number, surface?: WalkerSurface): void {
    const flying = this.airborne;
    this.launching = !flying;
    if (flying) this.curve(command, dt);
    super.step(command, world, dt, surface);
  }

  /**
   * Havadaki araç ne suyun yavaşlatmasını ne de kayanın tırmanış direncini hisseder; su derinliği ve
   * tırmanış sıfırdır (boğulma, dalga ve iz yoktur). Yere inince hesap normale döner.
   */
  protected override traverse(world: World): number {
    const speed = super.traverse(world);
    if (!this.airborne) return speed;
    this.waterDepth = 0;
    this.climb = 0;
    return 1;
  }

  /**
   * Fırlatma adımında hareket yönü komuttur; havada kalan araç hız yönünü korur (balistik), yerde
   * komut olduğu gibi izlenir.
   */
  protected override steerHeading(wanted: number, dashing: boolean): number {
    if (!dashing || this.launching || this.speed < LEAP_MIN_SPEED) return wanted;
    return Math.atan2(this.vy, this.vx);
  }

  /** Havadaki hız yönü komuta `leapTurnRate` hızıyla döner; hız büyüklüğü korunur. */
  private curve(command: TankCommand, dt: number): void {
    const config = this.leapConfig;
    const length = Math.hypot(command.moveX, command.moveY);
    if (length <= config.moveDeadzone || this.speed < LEAP_MIN_SPEED) return;
    const heading = Math.atan2(this.vy, this.vx);
    const limit = config.leapTurnRate * dt;
    const wanted = Math.atan2(command.moveY, command.moveX);
    const turn = clamp(angleDelta(heading, wanted), -limit, limit);
    const speed = this.speed;
    this.vx = Math.cos(heading + turn) * speed;
    this.vy = Math.sin(heading + turn) * speed;
  }
}
