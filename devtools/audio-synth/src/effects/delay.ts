import type { DelayParams } from '../types';
import { resolveDelayParams } from '../guard/effects';
import { checkSampleRate } from '../guard/read';

/** Bir geri beslemeli hattın -60 dB'ye düşmesi için gereken süre (saniye). */
export function feedbackTailSeconds(delaySeconds: number, feedback: number): number {
  const fb = Math.abs(feedback);
  if (!(delaySeconds > 0)) return 0;
  if (fb <= 0) return delaySeconds;
  if (fb >= 1) return delaySeconds * 100; // pratik üst sınır — sonsuz kuyruk
  return (delaySeconds * Math.log(0.001)) / Math.log(fb);
}

/** DelayParams'tan kuyruk süresini kestirir. */
export function estimateDelayTail(params: DelayParams): number {
  const resolved = resolveDelayParams(params, 'delay');
  return feedbackTailSeconds(resolved.time, Math.min(DELAY_FEEDBACK_CEILING, resolved.feedback));
}

/** Kararlılık tavanı: 1 geri besleme sönmeyen bir hat demektir. */
const DELAY_FEEDBACK_CEILING = 0.99;

export class DelayLine {
  private readonly buffer: Float32Array;
  private writeIndex = 0;
  private readonly delaySamples: number;
  private readonly feedback: number;
  private readonly mix: number;

  constructor(params: DelayParams, sampleRate: number) {
    const resolved = resolveDelayParams(params, 'delay');
    const rate = checkSampleRate(sampleRate, 'sampleRate');
    this.delaySamples = Math.max(1, Math.round(rate * resolved.time));
    // Dairesel buffer gecikme süresi + 1 örnek kadar olmalı.
    this.buffer = new Float32Array(this.delaySamples + 1);
    this.feedback = Math.min(DELAY_FEEDBACK_CEILING, resolved.feedback);
    this.mix = resolved.mix;
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
