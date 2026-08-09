import type {
  BitcrushParams,
  ChorusParams,
  DelayParams,
  DistortionParams,
  FlangerParams,
  PhaserParams,
  ReverbParams,
  StereoWidthParams,
} from './types';

// -----------------------------------------------------------------------------
// Bitcrush
// -----------------------------------------------------------------------------

export class Bitcrusher {
  private readonly bits: number;
  private readonly sampleRateFactor: number;
  private readonly sampleRate: number;
  private hold = 0;
  private lastPhase = -1;

  constructor(params: BitcrushParams, sampleRate: number) {
    this.bits = params.bits ?? 8;
    this.sampleRateFactor = Math.max(1, Math.floor(params.sampleRateFactor ?? 1));
    this.sampleRate = sampleRate;
  }

  process(sample: number, t: number): number {
    const levels = 2 ** (this.bits - 1);
    const quantized = Math.max(-1, Math.min(1, sample));
    const crushed = Math.round(quantized * levels) / levels;

    if (this.sampleRateFactor <= 1) return crushed;

    const phase = Math.floor(t * this.sampleRate) % this.sampleRateFactor;
    if (phase !== this.lastPhase) {
      this.hold = crushed;
      this.lastPhase = phase;
    }
    return this.hold;
  }

  reset(): void {
    this.hold = 0;
    this.lastPhase = -1;
  }
}

// -----------------------------------------------------------------------------
// Panning
// -----------------------------------------------------------------------------

export function getPanGains(pan: number): [number, number] {
  const clamped = Math.max(-1, Math.min(1, pan));
  const left = Math.sqrt((1 - clamped) * 0.5);
  const right = Math.sqrt((1 + clamped) * 0.5);
  return [left, right];
}

// -----------------------------------------------------------------------------
// Delay
// -----------------------------------------------------------------------------

export class DelayLine {
  private readonly buffer: Float32Array;
  private writeIndex = 0;
  private readonly delaySamples: number;
  private readonly feedback: number;
  private readonly mix: number;

  constructor(params: DelayParams, sampleRate: number) {
    const maxTime = Math.max(0.001, params.time);
    this.delaySamples = Math.round(sampleRate * maxTime);
    // Dairesel buffer gecikme süresi + 1 örnek kadar olmalı.
    this.buffer = new Float32Array(Math.max(1, this.delaySamples) + 1);
    this.feedback = Math.max(0, Math.min(0.99, params.feedback ?? 0.3));
    this.mix = Math.max(0, Math.min(1, params.mix ?? 0.3));
  }

  process(input: number): number {
    const readIndex =
      (this.writeIndex - this.delaySamples + this.buffer.length) % this.buffer.length;
    const delayed = this.buffer[readIndex];
    const output = input * (1 - this.mix) + delayed * this.mix;
    this.buffer[this.writeIndex] = input + delayed * this.feedback;
    this.writeIndex = (this.writeIndex + 1) % this.buffer.length;
    return output;
  }

  reset(): void {
    this.buffer.fill(0);
    this.writeIndex = 0;
  }
}

// -----------------------------------------------------------------------------
// Chorus
// -----------------------------------------------------------------------------

export class Chorus {
  private readonly buffer: Float32Array;
  private writeIndex = 0;
  private readonly baseSamples: number;
  private readonly depthSamples: number;
  private readonly rate: number;
  private readonly mix: number;
  private readonly sampleRate: number;

  constructor(params: ChorusParams, sampleRate: number) {
    this.sampleRate = sampleRate;
    const baseMs = 15;
    const depthMs = Math.max(0, params.depth ?? 2);
    this.baseSamples = Math.floor(sampleRate * (baseMs / 1000));
    // Negatif gecikme ve sarmal sınırında karışıklığı önlemek için derinlik tabanı aşmasın
    this.depthSamples = Math.min(
      Math.floor(sampleRate * (depthMs / 1000)),
      Math.max(1, this.baseSamples - 1),
    );
    this.rate = params.rate ?? 0.5;
    this.mix = Math.max(0, Math.min(1, params.mix ?? 0.3));
    const maxDelay = this.baseSamples + this.depthSamples + 2;
    this.buffer = new Float32Array(maxDelay);
  }

  process(input: number, t: number): number {
    this.buffer[this.writeIndex] = input;
    this.writeIndex = (this.writeIndex + 1) % this.buffer.length;

    const lfo = Math.sin(2 * Math.PI * this.rate * t);
    const delay = this.baseSamples + this.depthSamples * lfo;
    // writeIndex yazılmış örneğin bir sonrasını gösterir; -1 ile mevcut örneğe denk geliriz
    const readIndexF = (this.writeIndex - 1 - delay + this.buffer.length) % this.buffer.length;
    const i0 = Math.floor(readIndexF) % this.buffer.length;
    const i1 = (i0 + 1) % this.buffer.length;
    const frac = readIndexF - Math.floor(readIndexF);
    const delayed = this.buffer[i0] * (1 - frac) + this.buffer[i1] * frac;

    return input * (1 - this.mix) + delayed * this.mix;
  }

  reset(): void {
    this.buffer.fill(0);
    this.writeIndex = 0;
  }
}

// -----------------------------------------------------------------------------
// Flanger
// -----------------------------------------------------------------------------

export class Flanger {
  private readonly buffer: Float32Array;
  private writeIndex = 0;
  private readonly baseSamples: number;
  private readonly depthSamples: number;
  private readonly rate: number;
  private readonly feedback: number;
  private readonly mix: number;
  private readonly sampleRate: number;

  constructor(params: FlangerParams, sampleRate: number) {
    this.sampleRate = sampleRate;
    const baseMs = Math.max(0.1, params.time ?? 1);
    const depthMs = Math.max(0, params.depth ?? 0.5);
    this.baseSamples = sampleRate * (baseMs / 1000);
    // Negatif gecikme ve tam sarmal noktada karışıklığı önlemek için derinlik tabanı aşmasın
    this.depthSamples = Math.min(sampleRate * (depthMs / 1000), Math.max(0, this.baseSamples - 1));
    this.rate = params.rate ?? 0.5;
    this.feedback = Math.max(-0.95, Math.min(0.95, params.feedback ?? 0));
    this.mix = Math.max(0, Math.min(1, params.mix ?? 0.5));
    const maxDelay = this.baseSamples + this.depthSamples + 2;
    this.buffer = new Float32Array(Math.ceil(maxDelay));
  }

  process(input: number, t: number): number {
    const lfo = Math.sin(2 * Math.PI * this.rate * t);
    const delay = Math.max(1, this.baseSamples + this.depthSamples * lfo);
    const readIndexF = (this.writeIndex - delay + this.buffer.length) % this.buffer.length;
    const i0 = Math.floor(readIndexF) % this.buffer.length;
    const i1 = (i0 + 1) % this.buffer.length;
    const frac = readIndexF - Math.floor(readIndexF);
    const delayed = this.buffer[i0] * (1 - frac) + this.buffer[i1] * frac;

    // Feedback: gecikme çıkışını girdiye ekle, sonra hat yaz
    this.buffer[this.writeIndex] = input + delayed * this.feedback;
    this.writeIndex = (this.writeIndex + 1) % this.buffer.length;

    return input * (1 - this.mix) + delayed * this.mix;
  }

  reset(): void {
    this.buffer.fill(0);
    this.writeIndex = 0;
  }
}

// -----------------------------------------------------------------------------
// Phaser
// -----------------------------------------------------------------------------

class FirstOrderAllpass {
  private a = 0;
  private x1 = 0;
  private y1 = 0;
  private readonly sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  setFreq(freq: number): void {
    const clamped = Math.max(1, Math.min(this.sampleRate * 0.499, freq));
    const k = Math.tan((Math.PI * clamped) / this.sampleRate);
    this.a = (k - 1) / (k + 1);
  }

  process(x: number): number {
    const y = this.a * x + this.x1 - this.a * this.y1;
    this.x1 = x;
    this.y1 = y;
    return y;
  }

  reset(): void {
    this.a = 0;
    this.x1 = 0;
    this.y1 = 0;
  }
}

export class Phaser {
  private readonly filters: FirstOrderAllpass[];
  private readonly minFreq: number;
  private readonly maxFreq: number;
  private readonly rate: number;
  private readonly wave: 'sine' | 'triangle';
  private readonly feedback: number;
  private readonly mix: number;
  private lastOutput = 0;

  constructor(params: PhaserParams, sampleRate: number) {
    const stages = Math.max(1, Math.floor(params.stages ?? 4));
    this.filters = Array.from({ length: stages }, () => new FirstOrderAllpass(sampleRate));
    this.minFreq = Math.max(20, params.minFreq ?? 300);
    this.maxFreq = Math.max(this.minFreq + 10, Math.min(sampleRate * 0.49, params.maxFreq ?? 3000));
    this.rate = params.rate ?? 0.5;
    this.wave = params.wave ?? 'sine';
    this.feedback = Math.max(-0.95, Math.min(0.95, params.feedback ?? 0));
    this.mix = Math.max(0, Math.min(1, params.mix ?? 0.5));
  }

  private lfo(t: number): number {
    if (this.wave === 'triangle') {
      const phase = (this.rate * t) % 1;
      return phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase;
    }
    return Math.sin(2 * Math.PI * this.rate * t);
  }

  process(input: number, t: number): number {
    const lfoValue = this.lfo(t);
    const freq = this.minFreq + (this.maxFreq - this.minFreq) * (0.5 + 0.5 * lfoValue);

    let sample = input + this.feedback * this.lastOutput;
    for (const filter of this.filters) {
      filter.setFreq(freq);
      sample = filter.process(sample);
    }

    this.lastOutput = input * (1 - this.mix) + sample * this.mix;
    return this.lastOutput;
  }

  reset(): void {
    for (const filter of this.filters) filter.reset();
    this.lastOutput = 0;
  }
}

class CombFilter {
  private readonly buffer: Float32Array;
  private index = 0;
  private filterStore = 0;
  private readonly feedback: number;
  private readonly damp: number;

  constructor(size: number, feedback: number, damp: number) {
    this.buffer = new Float32Array(size);
    this.feedback = feedback;
    this.damp = damp;
  }

  process(input: number): number {
    const output = this.buffer[this.index];
    this.filterStore = output * (1 - this.damp) + this.filterStore * this.damp;
    this.buffer[this.index] = input + this.filterStore * this.feedback;
    this.index = (this.index + 1) % this.buffer.length;
    return output;
  }

  reset(): void {
    this.buffer.fill(0);
    this.index = 0;
    this.filterStore = 0;
  }
}

class AllpassFilter {
  private readonly buffer: Float32Array;
  private index = 0;
  private readonly feedback: number;

  constructor(size: number, feedback: number) {
    this.buffer = new Float32Array(size);
    this.feedback = feedback;
  }

  process(input: number): number {
    const bufOut = this.buffer[this.index];
    this.buffer[this.index] = input + bufOut * this.feedback;
    const output = bufOut - input * this.feedback;
    this.index = (this.index + 1) % this.buffer.length;
    return output;
  }

  reset(): void {
    this.buffer.fill(0);
    this.index = 0;
  }
}

export class Reverb {
  private readonly combFilters: CombFilter[];
  private readonly allpassFilters: AllpassFilter[];
  private readonly preDelayBuffer: Float32Array;
  private preDelayIndex = 0;
  private readonly preDelaySamples: number;
  private readonly amount: number;
  private readonly sampleRate: number;

  // Freeverb tarzı gecikme süreleri (44.1kHz için), örnek oranına göre ölçeklenir
  private static readonly COMB_TIMES = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116] as const;
  private static readonly ALLPASS_TIMES = [225, 556, 441, 341] as const;

  constructor(params: ReverbParams, sampleRate: number) {
    this.sampleRate = sampleRate;
    this.amount = Math.max(0, Math.min(1, params.amount ?? 0.3));

    const roomSize = Math.max(0, Math.min(1, params.roomSize ?? 0.5));
    const decay = params.decay ?? 0.5 + roomSize * 0.5;
    const damp = Math.max(0, Math.min(1, params.damp ?? 0.5));

    // Cızırtılı metallic zil oluşumunu önlemek için maksimum geri besleme sınırlandı.
    const feedback = Math.min(0.82, decay * 0.55 + 0.15);

    this.combFilters = Reverb.COMB_TIMES.map((time) => {
      const size = Math.floor(time * (sampleRate / 44100));
      return new CombFilter(size, feedback, damp);
    });

    this.allpassFilters = Reverb.ALLPASS_TIMES.map((time) => {
      const size = Math.floor(time * (sampleRate / 44100));
      return new AllpassFilter(size, 0.5);
    });

    const preDelay = Math.max(0, params.preDelay ?? 0);
    this.preDelaySamples = Math.floor(preDelay * sampleRate);
    this.preDelayBuffer = new Float32Array(Math.max(1, this.preDelaySamples));
  }

  process(input: number): number {
    // Pre-delay
    let delayedInput = input;
    if (this.preDelaySamples > 0) {
      const readIndex =
        (this.preDelayIndex - this.preDelaySamples + this.preDelayBuffer.length) %
        this.preDelayBuffer.length;
      delayedInput = this.preDelayBuffer[readIndex];
      this.preDelayBuffer[this.preDelayIndex] = input;
      this.preDelayIndex = (this.preDelayIndex + 1) % this.preDelayBuffer.length;
    }

    // Comb filters parallel
    let combSum = 0;
    for (const comb of this.combFilters) {
      combSum += comb.process(delayedInput);
    }
    let reverb = combSum / this.combFilters.length;

    // Allpass filters series
    for (const allpass of this.allpassFilters) {
      reverb = allpass.process(reverb);
    }

    return input * (1 - this.amount) + reverb * this.amount;
  }

  reset(): void {
    this.combFilters.forEach((c) => c.reset());
    this.allpassFilters.forEach((a) => a.reset());
    this.preDelayBuffer.fill(0);
    this.preDelayIndex = 0;
  }
}

// -----------------------------------------------------------------------------
// Distortion
// -----------------------------------------------------------------------------

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
      case 'foldback': {
        const threshold = 1;
        if (driven > threshold) {
          shaped = threshold - (driven - threshold);
        } else if (driven < -threshold) {
          shaped = -threshold - (driven + threshold);
        } else {
          shaped = driven;
        }
        break;
      }
    }

    return input * (1 - this.mix) + shaped * this.mix;
  }

  reset(): void {
    // stateless
  }
}

// -----------------------------------------------------------------------------
// Stereo Width
// -----------------------------------------------------------------------------

export class StereoWidener {
  private readonly width: number;

  constructor(params: StereoWidthParams) {
    this.width = Math.max(0, Math.min(2, params.width));
  }

  /** [left, right] çiftini alır, genişletilmiş çift döner. */
  process(left: number, right: number): [number, number] {
    const mid = 0.5 * (left + right);
    const side = 0.5 * (left - right);
    const midAmp = 2 * (1 - this.width * 0.5);
    const sideAmp = 2 * (this.width * 0.5);
    return [mid * midAmp + side * sideAmp, mid * midAmp - side * sideAmp];
  }
}
