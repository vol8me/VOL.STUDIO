import type { Curve, EnvelopeParams } from './types';

/** `1 - 10^-3` — eğrinin normalize edilmemiş halinin t=1'deki değeri. */
const SATURATING_SPAN = 1 - Math.pow(10, -3);

/**
 * 0-1 arası eğri uygular. Her eğri t=0'da tam 0, t=1'de tam 1 döner.
 *
 * `exponential` adı geriye dönük uyum için korunuyor ama eğri matematiksel
 * olarak DOYGUN (logaritmik) bir eğridir: `1 - 10^(-3t)` — başta hızlı,
 * sonda yavaş. Doğal sönümü iyi taklit eder, ama "üstel" bekleyen birinin
 * sandığının tersidir.
 *
 * Normalizasyon şart: ham `1 - 10^(-3t)` t=1'de 0.999 dönüyordu, yani
 * attack tam 1.0'a, release tam 0.0'a hiç ulaşmıyordu.
 */
export function applyCurve(x: number, curve: Curve): number {
  const t = Math.max(0, Math.min(1, x));
  switch (curve) {
    case 'linear':
      return t;
    case 'exponential':
      return (1 - Math.pow(10, -3 * t)) / SATURATING_SPAN;
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
      // Süre aşımı varsa önce sustain'i kısalt — zarfın şeklini (attack/decay/release
      // eğrisi) korur. Sustain zaten sabit seviyede tutulduğu için süresi esnektir.
      // Sustain yetmezse kalan aşamaları orantılı kısalt; bu son çare olarak
      // zarf şeklini bozar ama toplam süreyi duration'a indirir.
      const nonSustain = attack + hold + decay + release;
      if (sustain > total - duration) {
        sustain = Math.max(0, duration - nonSustain);
      } else {
        const overflow = total - duration;
        const scale = (total - overflow) / total;
        attack *= scale;
        hold *= scale;
        decay *= scale;
        sustain *= scale;
        release *= scale;
      }
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
