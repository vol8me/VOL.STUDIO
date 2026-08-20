import type { ReverbParams } from '../types';

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

/** Tek kanal reverb çekirdeği — comb + allpass zinciri. */
class ReverbCore {
  private readonly combFilters: CombFilter[];
  private readonly allpassFilters: AllpassFilter[];
  private readonly preDelayBuffer: Float32Array;
  private preDelayIndex = 0;
  private readonly preDelaySamples: number;

  constructor(
    combTimes: readonly number[],
    allpassTimes: readonly number[],
    sampleRate: number,
    feedback: number,
    damp: number,
    preDelay: number,
  ) {
    this.combFilters = combTimes.map((time) => {
      const size = Math.max(1, Math.floor(time * (sampleRate / 44100)));
      return new CombFilter(size, feedback, damp);
    });

    this.allpassFilters = allpassTimes.map((time) => {
      const size = Math.max(1, Math.floor(time * (sampleRate / 44100)));
      return new AllpassFilter(size, 0.5);
    });

    this.preDelaySamples = Math.floor(preDelay * sampleRate);
    this.preDelayBuffer = new Float32Array(Math.max(1, this.preDelaySamples));
  }

  process(input: number): number {
    let delayedInput = input;
    if (this.preDelaySamples > 0) {
      const readIndex =
        (this.preDelayIndex - this.preDelaySamples + this.preDelayBuffer.length) %
        this.preDelayBuffer.length;
      delayedInput = this.preDelayBuffer[readIndex]!;
      this.preDelayBuffer[this.preDelayIndex] = input;
      this.preDelayIndex = (this.preDelayIndex + 1) % this.preDelayBuffer.length;
    }

    let combSum = 0;
    for (const comb of this.combFilters) {
      combSum += comb.process(delayedInput);
    }
    let reverb = combSum / this.combFilters.length;

    for (const allpass of this.allpassFilters) {
      reverb = allpass.process(reverb);
    }

    return reverb;
  }

  reset(): void {
    this.combFilters.forEach((c) => c.reset());
    this.allpassFilters.forEach((a) => a.reset());
    this.preDelayBuffer.fill(0);
    this.preDelayIndex = 0;
  }
}

/** Stereo reverb — L ve R için bağımsız çekirdekler, farklı delay süreleri.
 *  Freeverb stereo yaklaşımı: R kanalı ~3% uzun delay → geniş stereo imaj. */
export class Reverb {
  private readonly left: ReverbCore;
  private readonly right: ReverbCore;
  private readonly amount: number;

  // L ve R için farklı comb süreleri — stereo genişlik
  private static readonly COMB_TIMES_L = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116] as const;
  private static readonly COMB_TIMES_R = [1601, 1665, 1537, 1463, 1313, 1393, 1223, 1151] as const;
  private static readonly ALLPASS_TIMES = [225, 556, 441, 341] as const;

  /** Bu reverb'ün comb gecikmelerine uygulanan oda ölçeği. */
  private readonly roomScale: number;
  private readonly feedback: number;

  constructor(params: ReverbParams, sampleRate: number) {
    this.amount = Math.max(0, Math.min(1, params.amount ?? 0.3));

    const roomSize = Math.max(0, Math.min(1, params.roomSize ?? 0.5));
    const decay = Math.max(0, Math.min(1, params.decay ?? 0.5 + roomSize * 0.5));
    const damp = Math.max(0, Math.min(1, params.damp ?? 0.5));
    const preDelay = Math.max(0, params.preDelay ?? 0);

    // roomSize comb gecikmelerini ölçekler (fiziksel oda boyutu).
    this.roomScale = 0.6 + roomSize * 0.8;
    this.feedback = Math.min(0.82, decay * 0.55 + 0.15);

    const scaleTimes = (times: readonly number[]): number[] => times.map((t) => t * this.roomScale);

    this.left = new ReverbCore(
      scaleTimes(Reverb.COMB_TIMES_L),
      Reverb.ALLPASS_TIMES,
      sampleRate,
      this.feedback,
      damp,
      preDelay,
    );
    this.right = new ReverbCore(
      scaleTimes(Reverb.COMB_TIMES_R),
      Reverb.ALLPASS_TIMES,
      sampleRate,
      this.feedback,
      damp,
      preDelay,
    );

    // Kuyruk süresi: comb gecikmesinin -60 dB'ye düşmesi için gereken süre.
    const avgCombSamples =
      (Reverb.COMB_TIMES_L.reduce((a, b) => a + b, 0) / Reverb.COMB_TIMES_L.length) *
      this.roomScale;
    const combSeconds = avgCombSamples / 44100;
    this.tailSeconds =
      this.feedback > 0 && this.feedback < 1
        ? (combSeconds * Math.log(0.001)) / Math.log(this.feedback)
        : combSeconds;
  }

  /** Reverb kuyruğunun -60 dB'ye düşme süresi (saniye). */
  readonly tailSeconds: number;

  /** Mono işlem — geriye dönük uyum. L+R ortalaması. */
  process(input: number): number {
    const l = this.left.process(input);
    const r = this.right.process(input);
    return input * (1 - this.amount) + (l + r) * 0.5 * this.amount;
  }

  /** Stereo işlem — L ve R bağımsız reverb kuyrukları. */
  processStereo(leftIn: number, rightIn: number): [number, number] {
    const l = this.left.process(leftIn);
    const r = this.right.process(rightIn);
    return [
      leftIn * (1 - this.amount) + l * this.amount,
      rightIn * (1 - this.amount) + r * this.amount,
    ];
  }

  reset(): void {
    this.left.reset();
    this.right.reset();
  }
}
