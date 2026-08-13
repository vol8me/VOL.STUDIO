import type { DistortionParams } from '../types';

// -----------------------------------------------------------------------------
// Distortion
// -----------------------------------------------------------------------------

/**
 * Sinyali [-1, 1] aralığına KATLAYARAK sığdırır (periyot 4 üçgen dalga eşlemesi).
 *
 * Önceki uygulama yalnızca BİR kez katlıyordu: `driven = 5` için çıktı `-3`
 * oluyordu — aralık dışı bir değer, sonrasındaki normalize adımıyla birleşince
 * tüm sesi aşağı bastırıyordu. Gerçek foldback, sinyal aralığa girene kadar
 * katlamayı sürdürür; kapalı form bunu tek işlemde yapar.
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
    this.amount = Math.max(0, Math.min(1, params.amount));
    this.type = params.type ?? 'soft';
    this.mix = Math.max(0, Math.min(1, params.mix ?? 1));
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
