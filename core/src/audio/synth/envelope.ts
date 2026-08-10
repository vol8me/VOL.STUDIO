import type { Curve, EnvelopeParams } from './types';

/** 0-1 arası eğri uygular.
 *  exponential: gerçek üstel eğri — başlangıçta hızlı, sonda yavaş (doğal decay). */
export function applyCurve(x: number, curve: Curve): number {
  const t = Math.max(0, Math.min(1, x));
  switch (curve) {
    case 'linear':
      return t;
    case 'exponential':
      // 0 → 1 üstel: başta hızlı kalkış, sonda yavaş yaklaşım
      // 1 - 10^(-3*t) : 3 birimlik zaman sabiti, doğal ses decay'sine yakın
      return 1 - Math.pow(10, -3 * t);
    case 'cosine':
      return (1 - Math.cos(t * Math.PI)) / 2;
    default:
      return t;
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
  private readonly loop: boolean;

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
    this.loop = params.loop ?? false;

    this.total = this.attack + this.hold + this.decay + this.sustain + this.release;
  }

  /** t saniye cinsinden. */
  value(t: number): number {
    if (t < 0) return 0;

    // Loop modunda: ADSH kısmını döngüye al (release hariç)
    // Loop periyodu = attack + hold + decay + sustain
    const loopPeriod = this.attack + this.hold + this.decay + this.sustain;
    let evalT = t;
    if (this.loop && loopPeriod > 0) {
      evalT = t % loopPeriod;
    }

    let pos = 0;

    // Attack
    if (evalT < pos + this.attack) {
      const ratio = this.attack > 0 ? (evalT - pos) / this.attack : 1;
      return applyCurve(Math.max(0, Math.min(1, ratio)), this.curve);
    }
    pos += this.attack;

    // Hold
    if (evalT < pos + this.hold) {
      return 1;
    }
    pos += this.hold;

    // Decay
    if (evalT < pos + this.decay) {
      const ratio = this.decay > 0 ? (evalT - pos) / this.decay : 1;
      const curved = applyCurve(ratio, this.curve);
      return 1 - (1 - this.sustainLevel) * curved;
    }
    pos += this.decay;

    // Sustain
    if (evalT < pos + this.sustain) {
      return this.sustainLevel;
    }
    pos += this.sustain;

    // Release — loop modunda atlanır
    if (!this.loop && evalT < pos + this.release) {
      const ratio = this.release > 0 ? (evalT - pos) / this.release : 1;
      const curved = applyCurve(ratio, this.curve);
      return this.sustainLevel * (1 - curved);
    }

    return 0;
  }
}
