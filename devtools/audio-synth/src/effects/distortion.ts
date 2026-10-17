import type { DistortionParams } from '../types';
import { resolveDistortionParams } from '../guard/effects';

// -----------------------------------------------------------------------------
// Distortion
// -----------------------------------------------------------------------------

/**
 * Sinyali [-1, 1] aralığına katlayarak sığdırır (periyot 4 üçgen dalga eşlemesi).
 *
 * Gerçek foldback sinyal aralığa girene kadar katlamayı sürdürür;
 * kapalı form bunu tek işlemde yapar.
 */
function foldback(x: number): number {
  const period = (((x - 1) % 4) + 4) % 4;
  return Math.abs(period - 2) - 1;
}

export class Distortion {
  private readonly amount: number;
  private readonly type: 'soft' | 'hard' | 'foldback';
  private readonly mix: number;

  constructor(params: DistortionParams) {
    const resolved = resolveDistortionParams(params, 'distortion');
    this.amount = resolved.amount;
    this.type = resolved.type;
    this.mix = resolved.mix;
  }

  process(input: number): number {
    const driven = input * (1 + this.amount * 4);
    let shaped: number;

    switch (this.type) {
      case 'soft':
        shaped = Math.tanh(driven);
        break;
      case 'hard':
        shaped = Math.max(-1, Math.min(1, driven));
        break;
      case 'foldback':
        shaped = foldback(driven);
        break;
    }

    return input * (1 - this.mix) + shaped * this.mix;
  }

  reset(): void {
    // stateless
  }
}
