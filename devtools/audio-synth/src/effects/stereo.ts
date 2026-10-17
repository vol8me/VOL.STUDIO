import type { StereoWidthParams } from '../types';
import { resolveStereoWidth } from '../guard/effects';

// -----------------------------------------------------------------------------
// Stereo Width
// -----------------------------------------------------------------------------

export class StereoWidener {
  private readonly width: number;

  constructor(params: StereoWidthParams | number) {
    this.width = resolveStereoWidth(params, 'stereoWidth');
  }

  /**
   * [left, right] çiftini alır, genişletilmiş çift döner.
   *
   * Standart M/S genişlik kontrolü: mid korunur, side `width` ile ölçeklenir.
   * width 0 → mono, 1 → değişiklik yok, 2 → iki kat geniş.
   */
  process(left: number, right: number): [number, number] {
    const mid = 0.5 * (left + right);
    const side = 0.5 * (left - right) * this.width;
    return [mid + side, mid - side];
  }
}
