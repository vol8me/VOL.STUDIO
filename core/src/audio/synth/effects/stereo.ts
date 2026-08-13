import type { StereoWidthParams } from '../types';

// -----------------------------------------------------------------------------
// Stereo Width
// -----------------------------------------------------------------------------

export class StereoWidener {
  private readonly width: number;

  constructor(params: StereoWidthParams | number) {
    const w = typeof params === 'number' ? params : params.width;
    this.width = Math.max(0, Math.min(2, w));
  }

  /**
   * [left, right] çiftini alır, genişletilmiş çift döner.
   *
   * Standart M/S genişlik kontrolü: mid korunur, side `width` ile ölçeklenir.
   * width 0 → mono, 1 → değişiklik yok, 2 → iki kat geniş.
   *
   * Önceki formül mid'i de ölçekliyordu (`2·(1 - width/2)`): width=0'da mono
   * kaynağı +6 dB yükseltiyor, width=2'de mono kaynağı tamamen susturuyordu.
   * Yalnızca width=1 doğruydu.
   */
  process(left: number, right: number): [number, number] {
    const mid = 0.5 * (left + right);
    const side = 0.5 * (left - right) * this.width;
    return [mid + side, mid - side];
  }
}
