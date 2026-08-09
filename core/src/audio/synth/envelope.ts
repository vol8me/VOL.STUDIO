import type { Curve, EnvelopeParams } from './types';

/** 0-1 arası eğri uygular. */
export function applyCurve(x: number, curve: Curve): number {
  switch (curve) {
    case 'linear':
      return x;
    case 'exponential':
      return x * x; // daha yumuşak kalkış/sönüş
    case 'cosine':
      return (1 - Math.cos(x * Math.PI)) / 2;
    default:
      return x;
  }
}

/** Zarf değerlendiricisi. */
export class Envelope {
  private readonly attack: number;
  private readonly hold: number;
  private readonly decay: number;
  private readonly sustain: number;
  private readonly release: number;
  private readonly sustainLevel: number;
  private readonly curve: Curve;
  private readonly total: number;

  constructor(params: EnvelopeParams, duration: number) {
    let attack = params.attack ?? 0;
    let hold = params.hold ?? 0;
    let decay = params.decay ?? 0;
    let sustain = params.sustain ?? 0;
    let release = params.release ?? 0;

    const total = attack + hold + decay + sustain + release;
    if (total > duration && total > 0) {
      // Süre aşımı varsa aşama sürelerini orantılı kısalt
      const scale = duration / total;
      attack *= scale;
      hold *= scale;
      decay *= scale;
      sustain *= scale;
      release *= scale;
    }

    this.attack = attack;
    this.hold = hold;
    this.decay = decay;
    this.sustain = sustain;
    this.release = release;
    this.sustainLevel = params.sustainLevel ?? 0.5;
    this.curve = params.curve ?? 'exponential';

    this.total = this.attack + this.hold + this.decay + this.sustain + this.release;
  }

  /** t saniye cinsinden. */
  value(t: number): number {
    if (t < 0) return 0;

    let pos = 0;

    // Attack
    if (t < pos + this.attack) {
      const ratio = this.attack > 0 ? (t - pos) / this.attack : 1;
      return applyCurve(Math.max(0, Math.min(1, ratio)), this.curve);
    }
    pos += this.attack;

    // Hold
    if (t < pos + this.hold) {
      return 1;
    }
    pos += this.hold;

    // Decay
    if (t < pos + this.decay) {
      const ratio = this.decay > 0 ? (t - pos) / this.decay : 1;
      const curved = applyCurve(ratio, this.curve);
      return 1 - (1 - this.sustainLevel) * curved;
    }
    pos += this.decay;

    // Sustain
    if (t < pos + this.sustain) {
      return this.sustainLevel;
    }
    pos += this.sustain;

    // Release
    if (t < pos + this.release) {
      const ratio = this.release > 0 ? (t - pos) / this.release : 1;
      const curved = applyCurve(ratio, this.curve);
      return this.sustainLevel * (1 - curved);
    }

    return 0;
  }
}
