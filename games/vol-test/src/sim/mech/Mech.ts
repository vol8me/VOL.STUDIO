import { PARTS } from '@/config/parts';
import type { MechConfig } from '@/config/mech';
import type { SuspensionConfig } from '@/config/tank';
import { Walker } from '../walker/Walker';
import type { ChassisKind } from '../chassis/Chassis';
import { TRACK_LEFT, TRACK_RIGHT } from '../chassis/parts';

/**
 * İki bacaklı savaş robotu. Sürüş mantığı yürüyücüyle aynıdır (komut hedef hız vektörüdür, gövde
 * hareket yönüne döner, nişan yalnız silah kollarını sürer) ama sayıları ağırdır: yavaş döner, yana ya
 * da geriye açılırken tavanı düşer. İki farkı vardır:
 *
 * - Adım çukuru: her ayak basışında hız `strideDip` oranında düşüp toparlanır. Faz iki bacağın
 *   katettiği yoldan türer (rastgelelik yok), sunucu ile öngörü aynı adımı yürür.
 * - Bacak kaybı: bit 0 sol, bit 1 sağ bacaktır. Tek bacağı kalan mech topallar: tavan ve ivme düşer,
 *   yürüyüş kopan yana sürüklenir ve o bacağın her adımında gövde o yana çöker.
 */
export class Mech extends Walker {
  override readonly kind: ChassisKind = 'mech';

  constructor(
    private readonly mechConfig: MechConfig,
    suspension: SuspensionConfig,
  ) {
    super(mechConfig, suspension);
  }

  /** Adım fazı: bir çift adımda iki ayak basışı vardır; çukur her basışın başında en derindir. */
  protected override gaitFactor(): number {
    const config = this.mechConfig;
    const travelled = (this.groundLeft + this.groundRight) / 2;
    const phase = (travelled / config.strideLength) * Math.PI * 4;
    return 1 - config.strideDip * 0.5 * (1 + Math.cos(phase));
  }

  protected override limp(): void {
    const lostLeft = (this.parts & TRACK_LEFT) !== 0 ? 1 : 0;
    const lostRight = (this.parts & TRACK_RIGHT) !== 0 ? 1 : 0;
    if (lostLeft + lostRight === 0) {
      this.capacity = 1;
      this.yawBias = 0;
      return;
    }
    const config = PARTS.mech;
    const { dip, sway } = config.stumble;
    const phaseLeft = (this.groundLeft / config.stumble.stride) * Math.PI * 2;
    const phaseRight = (this.groundRight / config.stumble.stride) * Math.PI * 2;
    const left = lostLeft * 0.5 * (1 - Math.cos(phaseLeft));
    const right = lostRight * 0.5 * (1 - Math.cos(phaseRight));
    const ratio = Math.min(1, this.speed / this.mechConfig.maxSpeed);
    this.capacity =
      Math.max(config.floor, 1 - config.legLoss * (lostLeft + lostRight)) *
      (1 - Math.min(0.6, dip * (left + right)));
    this.yawBias = ratio * (config.drift * (lostRight - lostLeft) + sway * (right - left));
  }
}
