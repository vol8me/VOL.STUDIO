import { Spring1D, type SpringConfig } from '@volstudio/core/math';
import { valueNoise } from '../noise';
import type { SuspensionConfig } from '@/config/tank';

/** Sınıra dayanan yay geri seker; sönümlü sekme katsayısı. */
const LIMIT_BOUNCE = -0.3;

/**
 * Gövdenin yaylı süspansiyonu: yunuslama ve yalpa iki CORE `Spring1D`dir.
 * İvme ağırlığı taşır: yayın dengesi `-ivme × kazanç` konumudur; kalkışta
 * gövde geriye, frende öne, virajda dışa kayar. Ateş ve çarpma darbeleri
 * yayın hızını doğrudan vurur. Çıktı gövde çerçevesindedir: `pitch` ileri (+),
 * `roll` sağ (+).
 */
export class Suspension {
  private readonly pitchSpring = new Spring1D();
  private readonly rollSpring = new Spring1D();
  private readonly spring: SpringConfig;

  constructor(private readonly config: SuspensionConfig) {
    const omega = 2 * Math.PI * config.frequency;
    this.spring = { stiffness: omega * omega, damping: 2 * config.damping * omega };
  }

  get pitch(): number {
    return this.pitchSpring.value;
  }

  get roll(): number {
    return this.rollSpring.value;
  }

  /** Gövde çerçevesinde hız darbesi (birim/s): ileri (+) ve sağ (+). */
  kick(forward: number, right: number): void {
    this.pitchSpring.velocity += forward;
    this.rollSpring.velocity += right;
  }

  /**
   * @param accelForward Gövdenin ileri eksendeki ivmesi (birim/s²).
   * @param accelRight Sağ eksendeki ivmesi (virajda merkezcil ivme dahil).
   * @param speed Yol titreşimini ölçekleyen hız.
   * @param travel Palet yolu; titreşim konuma bağlı ve deterministiktir.
   */
  step(accelForward: number, accelRight: number, speed: number, travel: number, dt: number): void {
    const config = this.config;
    const rough = config.roughness * Math.min(1, speed / config.roughnessSpeed) * config.bumpScale;
    const bumpPitch = (valueNoise(travel * config.bumpFrequencyPitch, 3.1, 0x5a) - 0.5) * rough;
    const bumpRoll = (valueNoise(7.7, travel * config.bumpFrequencyRoll, 0xa5) - 0.5) * rough;
    const deltaMs = dt * 1000;
    this.settle(this.pitchSpring, -accelForward * config.pitchPerAccel + bumpPitch, deltaMs);
    this.settle(this.rollSpring, -accelRight * config.rollPerAccel + bumpRoll, deltaMs);
  }

  private settle(spring: Spring1D, target: number, deltaMs: number): void {
    spring.update(target, deltaMs, this.spring);
    const limit = this.config.maxOffset;
    if (Math.abs(spring.value) > limit) {
      spring.value = Math.sign(spring.value) * limit;
      spring.velocity *= LIMIT_BOUNCE;
    }
  }
}
