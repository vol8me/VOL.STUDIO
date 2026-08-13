import type { ChorusParams, FlangerParams, PhaserParams } from '../types';

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

  constructor(params: ChorusParams, sampleRate: number) {
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

  constructor(params: FlangerParams, sampleRate: number) {
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
  private readonly stageSpread: number[];
  private lastOutput = 0;

  constructor(params: PhaserParams, sampleRate: number) {
    const stages = Math.max(1, Math.floor(params.stages ?? 4));
    this.filters = Array.from({ length: stages }, () => new FirstOrderAllpass(sampleRate));
    // Kademe başına yarım oktav yayılım (2^0, 2^0.5, 2^1, ...).
    this.stageSpread = Array.from({ length: stages }, (_, i) => Math.pow(2, i * 0.5));
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
    // Kademeler logaritmik olarak kaydırılır. Hepsine aynı frekansı vermek
    // tek boyutlu, zayıf bir çentik deseni üretiyordu; gerçek phaser'lar
    // kademeleri yayar.
    for (let i = 0; i < this.filters.length; i++) {
      this.filters[i].setFreq(freq * this.stageSpread[i]);
      sample = this.filters[i].process(sample);
    }

    this.lastOutput = input * (1 - this.mix) + sample * this.mix;
    return this.lastOutput;
  }

  reset(): void {
    for (const filter of this.filters) filter.reset();
    this.lastOutput = 0;
  }
}
