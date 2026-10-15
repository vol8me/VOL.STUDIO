import { angleDelta } from '@volstudio/core/math';
import { clamp } from '@volstudio/core/math/interpolation';
import { PARTS } from '@/config/parts';
import type { LeaperConfig } from '@/config/leaper';
import type { SuspensionConfig } from '@/config/tank';
import type { ChassisKind } from '../chassis/Chassis';
import { LEAPER_LEGS_PER_SIDE } from '../chassis/parts';
import type { TankCommand } from '../command';
import type { World } from '../world/World';
import { Walker, type WalkerSurface } from '../walker/Walker';

/** Havadaki aracın hızı bunun altındaysa fırlatma yönü yoktur: komutun yönü kullanılır. */
const LEAP_MIN_SPEED = 30;

/**
 * Dört bacaklı sıçrayıcı. Yürüyücünün sürüşünü paylaşır (komut hedef hız vektörüdür, gövde yürüdüğü
 * yöne döner) ve atılımı bir SIÇRAMAYA çevirir:
 *
 * - Havadaki araç (atılım deposu aktif) kayadan geçer, sudan etkilenmez ve boğulmaz. Fırlatma yönü
 *   komuttan okunur; sonra balistiktir: hız yönü yalnız `leapTurnRate` hızıyla komuta döner. Havada
 *   olmak yeni bir ağ durumu değildir: depo ve hız zaten durumdadır, sunucu ve öngörü aynı kavisi çizer.
 * - Yerde koşarken her sekmenin başında hız çukuru (`strideDip`) vardır; faz iki yanın katettiği
 *   yoldan türer (rastgelelik yok).
 * - Dönüş bir yük taşır: hızlandıkça gövde geniş yay çizer (`carve`) ve sert dönüşte pençeler yere
 *   basıp hızı keser (`turnDip`). İkisi de hız ve açısal hızdan türer, ek ağ durumu yoktur.
 * - Dört bacak (yanda iki) kaybedilebilir; bir yanı eksik sıçrayıcı o yana topallar.
 */
export class Leaper extends Walker {
  override readonly kind: ChassisKind = 'leaper';
  /** Bu adım sıçramanın ilk adımı mı (fırlatma yönü komuttan okunur); türetilmiş, ağ durumunda değildir. */
  private launching = true;

  constructor(
    private readonly leaperConfig: LeaperConfig,
    suspension: SuspensionConfig,
  ) {
    super(leaperConfig, suspension);
  }

  /** Havada mı: sıçrama deposu aktif. Sunum ve ses aynı bayrağı `boosting` olarak okur. */
  get airborne(): boolean {
    return this.reserve.active;
  }

  /** Havadayken kaya duvarı sayılmaz: sıçrayıcı kayanın üstünden geçer. */
  protected override get climbs(): boolean {
    return this.airborne;
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

  /**
   * Sekme fazı: bir sekmede tek hız çukuru vardır, başlangıçta en derindir; havada çukur yoktur.
   * Sert dönüşte (`turnDip`) pençeler yere basar: tavan dönüş hızıyla orantılı kısılır.
   */
  protected override gaitFactor(): number {
    if (this.airborne) return 1;
    const config = this.leaperConfig;
    const travelled = (this.groundLeft + this.groundRight) / 2;
    const phase = (travelled / config.strideLength) * Math.PI * 2;
    const stride = 1 - config.strideDip * 0.5 * (1 + Math.cos(phase));
    const turning = clamp(Math.abs(this.angularVelocity) / config.maxTurnRate, 0, 1);
    return stride * (1 - config.turnDip * turning);
  }

  /** Hız arttıkça dönüş tavanı `carve` oranına kadar düşer: koşuda geniş yay, yavaşken yerinde dönüş. */
  protected override turnRateLimit(): number {
    const config = this.leaperConfig;
    const effort = clamp(this.speed / config.maxSpeed, 0, 1);
    return config.maxTurnRate * (1 - config.carve * effort);
  }

  protected override get legsPerSide(): number {
    return LEAPER_LEGS_PER_SIDE;
  }

  protected override get limpConfig(): typeof PARTS.leaper {
    return PARTS.leaper;
  }

  /** Havadaki hız yönü komuta `leapTurnRate` hızıyla döner; hız büyüklüğü korunur. */
  private curve(command: TankCommand, dt: number): void {
    const config = this.leaperConfig;
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
