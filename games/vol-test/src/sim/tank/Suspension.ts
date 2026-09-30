import { valueNoise } from '../noise';
import type { SuspensionConfig } from '@/config/tank';

/**
 * Tek eksenli yay-sönüm: kütle 1, doğal frekans ve sönüm oranı ayardan.
 * Konum gövdenin paletlere göre kaymasıdır (birim).
 */
class Axis {
  offset = 0;
  velocity = 0;

  step(drive: number, stiffness: number, damping: number, limit: number, dt: number): void {
    this.velocity += (drive - stiffness * this.offset - damping * this.velocity) * dt;
    this.offset += this.velocity * dt;
    if (Math.abs(this.offset) > limit) {
      this.offset = Math.sign(this.offset) * limit;
      this.velocity *= -0.3;
    }
  }
}

/**
 * Gövdenin yaylı süspansiyonu. İvme ağırlığı taşır: kalkışta gövde geriye,
 * frende öne, virajda dışa kayar. Ateş ve çarpma darbeleri yayı doğrudan
 * vurur. Çıktı gövde çerçevesindedir: `pitch` ileri (+), `roll` sağ (+).
 */
export class Suspension {
  private readonly pitchAxis = new Axis();
  private readonly rollAxis = new Axis();
  private readonly stiffness: number;
  private readonly dampingCoefficient: number;

  constructor(private readonly config: SuspensionConfig) {
    const omega = 2 * Math.PI * config.frequency;
    this.stiffness = omega * omega;
    this.dampingCoefficient = 2 * config.damping * omega;
  }

  get pitch(): number {
    return this.pitchAxis.offset;
  }

  get roll(): number {
    return this.rollAxis.offset;
  }

  /** Gövde çerçevesinde hız darbesi (birim/s): ileri (+) ve sağ (+). */
  kick(forward: number, right: number): void {
    this.pitchAxis.velocity += forward;
    this.rollAxis.velocity += right;
  }

  /**
   * @param accelForward Gövdenin ileri eksendeki ivmesi (birim/s²).
   * @param accelRight Sağ eksendeki ivmesi (virajda merkezcil ivme dahil).
   * @param speed Yol titreşimini ölçekleyen hız.
   * @param travel Palet yolu; titreşim konuma bağlı ve deterministiktir.
   */
  step(accelForward: number, accelRight: number, speed: number, travel: number, dt: number): void {
    const config = this.config;
    const rough =
      config.roughness *
      Math.min(1, speed / config.roughnessSpeed) *
      this.stiffness *
      config.bumpScale;
    const bumpPitch = (valueNoise(travel * config.bumpFrequencyPitch, 3.1, 0x5a) - 0.5) * rough;
    const bumpRoll = (valueNoise(7.7, travel * config.bumpFrequencyRoll, 0xa5) - 0.5) * rough;
    this.pitchAxis.step(
      -accelForward * config.pitchPerAccel * this.stiffness + bumpPitch,
      this.stiffness,
      this.dampingCoefficient,
      config.maxOffset,
      dt,
    );
    this.rollAxis.step(
      -accelRight * config.rollPerAccel * this.stiffness + bumpRoll,
      this.stiffness,
      this.dampingCoefficient,
      config.maxOffset,
      dt,
    );
  }
}
