import { clamp } from '@volstudio/core/math/interpolation';
import { PARTS } from '@/config/parts';
import type { LeaperConfig } from '@/config/leaper';
import type { SuspensionConfig } from '@/config/tank';
import type { ChassisKind } from '../chassis/Chassis';
import { LEAPER_LEGS_PER_SIDE } from '../chassis/parts';
import { LeapingWalker } from '../walker/LeapingWalker';

/** Tavanın bu oranının üstündeki yerdeki hız sıçramadan kalmıştır: kayarak erir. */
const COAST_RATIO = 1.08;

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
export class Leaper extends LeapingWalker {
  override readonly kind: ChassisKind = 'leaper';
  constructor(
    private readonly leaperConfig: LeaperConfig,
    suspension: SuspensionConfig,
  ) {
    super(leaperConfig, suspension);
  }

  /** Havadayken kaya duvarı sayılmaz: sıçrayıcı kayanın üstünden geçer. */
  protected override get climbs(): boolean {
    return this.airborne;
  }

  /**
   * Sekme fazı: bir sekmede tek hız çukuru vardır, başlangıçta en derindir; havada çukur yoktur.
   * Sert dönüşte (`turnDip`) pençeler yere basar: tavan dönüş hızıyla orantılı kısılır. Sıçramadan sonra
   * depo dolana dek (`landRecovery`) tavan `landFloor`dan toparlanır; depo ağ durumundadır, bu yüzden
   * sunucu ve öngörü aynı çömelmeyi yürür.
   */
  protected override gaitFactor(): number {
    if (this.airborne) return 1;
    const config = this.leaperConfig;
    const travelled = (this.groundLeft + this.groundRight) / 2;
    const phase = (travelled / config.strideLength) * Math.PI * 2;
    const stride = 1 - config.strideDip * 0.5 * (1 + Math.cos(phase));
    const turning = clamp(Math.abs(this.angularVelocity) / config.maxTurnRate, 0, 1);
    const recovered = clamp(
      this.reserve.energy / (config.boostCapacity * config.landRecovery),
      0,
      1,
    );
    const crouch = config.landFloor + (1 - config.landFloor) * recovered;
    return stride * (1 - config.turnDip * turning) * crouch;
  }

  /**
   * Koşu tavanının üstündeki hız (sıçramadan kalan) kayarak erir: yerde ve tavandan hızlıyken fren ivmesi
   * `landBraking`dir. Normal yön değiştirme ve duruş frenine dokunulmaz.
   */
  protected override brakingLimit(): number {
    const config = this.leaperConfig;
    const coasting = !this.airborne && this.speed > config.maxSpeed * COAST_RATIO;
    return coasting ? config.landBraking : config.braking;
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
}
