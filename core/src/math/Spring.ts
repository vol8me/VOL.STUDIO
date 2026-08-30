import { finiteOr, requireFinite } from './numeric';
import { TECH } from '../constants';

/** Bir tek boyutlu yayın sertlik/sönüm katsayıları. */
export interface SpringConfig {
  /** Hedefe çekim kuvveti — büyüdükçe daha hızlı tepki, daha çok salınım. */
  stiffness: number;
  /** Hız sönümü — büyüdükçe salınım daha çabuk yatışır. */
  damping: number;
}

/**
 * Yarı-örtük (semi-implicit) Euler ile entegre edilen tek boyutlu
 * pozisyon+hız yayı — kamera sarsıntısı, ikincil parça hareketi (bkz.
 * `core/src/rig/`), UI'da "geriden gelip oturan" değer geçişleri.
 *
 * `damp()`'ten (bkz. `interpolation.ts`) farkı: `damp` anlık, hafızasız bir
 * üstel yumuşatmadır (hedefe asla taşmaz), bu ise hız TAŞIYAN gerçek bir
 * yaydır — hedef aniden değiştiğinde geriden gelip oturan bir "canlı" his
 * verir, üstel yumuşatma bunu üretemez.
 *
 * Bir kare hitch'inde (`deltaMs` çok büyük) hız terimi patlamasın diye
 * `deltaMs` `MAX_DELTA_MS`'e kelepçelenir.
 */
export class Spring1D {
  value: number;
  velocity = 0;

  private static readonly MAX_DELTA_MS = 100;

  constructor(initial = 0) {
    this.value = finiteOr(initial, 0);
  }

  /**
   * Bir kare ilerletir ve yeni `value`'yu döner.
   *
   * `stiffness`/`damping` YAPILANDIRMADIR: sonsuz değilse ya da negatifse
   * `TypeError` fırlatır — bozuk bir yay sabitinin sessizce kabul edilmesi,
   * salınımın neden hiç yatışmadığını (ya da hiç hareket etmediğini)
   * kaynağından çok uzakta görünür kılardı.
   *
   * `target`/`deltaMs` AKIŞ değeridir: sonsuz değilse mevcut `value`/`velocity`
   * değişmeden döner — tek bir bozuk kare yüzünden yayın kalıcı olarak
   * `NaN`e düşmesi orantısız olurdu (bkz. `Cooldown.update`'in aynı politikası).
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

    const dtSec = Math.min(deltaMs, Spring1D.MAX_DELTA_MS) / TECH.MS_PER_SECOND;
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
