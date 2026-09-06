import { finiteOr, requireFinite } from './numeric';
import { TECH } from '../constants';

export interface SpringConfig {
  /** Büyüdükçe daha hızlı tepki, daha çok salınım. */
  stiffness: number;
  /** Büyüdükçe salınım daha çabuk yatışır. */
  damping: number;
}

/**
 * Yarı-örtük Euler ile entegre edilen pozisyon+hız yayı.
 *
 * `damp()` (bkz. `interpolation.ts`) hafızasız üstel yumuşatmadır ve hedefe
 * asla taşmaz; bu ise hız TAŞIR — hedef aniden değiştiğinde geriden gelip
 * oturan his verir.
 *
 * `deltaMs`, kare hitch'inde hız terimi patlamasın diye ORTAK simülasyon
 * tavanına kelepçelenir (`TECH.MAX_SIM_STEP_MS`; yaya özel değildir).
 */
export class Spring1D {
  value: number;
  velocity = 0;

  constructor(initial = 0) {
    this.value = finiteOr(initial, 0);
  }

  /**
   * `stiffness`/`damping` YAPILANDIRMADIR: bozuksa atar. `target`/`deltaMs`
   * AKIŞTIR: bozuksa kare yok sayılır — tek bozuk kare yayı kalıcı `NaN`e
   * düşürmemeli (bkz. `Cooldown.update`, aynı politika).
   */
  update(target: number, deltaMs: number, config: SpringConfig): number {
    const stiffness = requireFinite(config.stiffness, 'SpringConfig.stiffness');
    const damping = requireFinite(config.damping, 'SpringConfig.damping');
    if (stiffness < 0 || damping < 0) {
      throw new TypeError(
        `SpringConfig.stiffness/damping negatif olamaz (gelen: ${stiffness}, ${damping})`,
      );
    }

    if (!Number.isFinite(target) || !Number.isFinite(deltaMs) || deltaMs <= 0) {
      return this.value;
    }

    const dtSec = Math.min(deltaMs, TECH.MAX_SIM_STEP_MS) / TECH.MS_PER_SECOND;
    this.velocity += (target - this.value) * stiffness * dtSec;
    this.velocity *= Math.max(0, 1 - damping * dtSec);
    this.value += this.velocity * dtSec;
    return this.value;
  }

  /** Değeri ve hızı sıfırlar (verilmezse `value` 0 olur). */
  reset(value = 0): void {
    this.value = finiteOr(value, 0);
    this.velocity = 0;
  }
}
