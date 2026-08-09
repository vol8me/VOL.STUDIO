import { synth } from '../synth/engine';
import type { SynthesisResult, SynthParams } from '../synth/types';
import type { ProceduralStemOptions } from './types';
import { ambientNoiseParams, bassParams, droneParams, padParams } from './procedural-presets';

/** Prosedürel stem üretici.
 *  Browser'da AudioBuffer, build-time'da SynthesisResult dönebilir.
 */
export class ProceduralStemGenerator {
  constructor(private readonly context?: AudioContext) {}

  /** SynthesisResult'ı AudioBuffer'a çevirir. */
  private resultToAudioBuffer(result: SynthesisResult): AudioBuffer {
    if (!this.context) {
      throw new Error('AudioBuffer üretmek için AudioContext gerekli.');
    }
    const numChannels = result.channels.length;
    const length = result.channels[0]?.length ?? 0;
    const buffer = this.context.createBuffer(numChannels, length, result.sampleRate);
    for (let ch = 0; ch < numChannels; ch++) {
      buffer.copyToChannel(result.channels[ch] as Float32Array<ArrayBuffer>, ch);
    }
    return buffer;
  }

  /** Kendi SynthParams ile AudioBuffer üretir. */
  generateFromParams(params: SynthParams): AudioBuffer {
    return this.resultToAudioBuffer(synth(params.duration, params));
  }

  /** SynthesisResult olarak herhangi bir params üretir. */
  generateResult(params: SynthParams): SynthesisResult {
    return synth(params.duration, params);
  }

  /** Pad / ambient stem üretir. */
  generatePad(options: ProceduralStemOptions): AudioBuffer {
    return this.generateFromParams(padParams(options));
  }

  /** Drone / long ambient stem üretir. */
  generateDrone(options: ProceduralStemOptions): AudioBuffer {
    return this.generateFromParams(droneParams(options));
  }

  /** Bass stem üretir. */
  generateBass(options: ProceduralStemOptions): AudioBuffer {
    return this.generateFromParams(bassParams(options));
  }

  /** Gürültü tabanlı ambient stem üretir. */
  generateAmbientNoise(options: Omit<ProceduralStemOptions, 'wave'>): AudioBuffer {
    return this.generateFromParams(ambientNoiseParams(options));
  }

  /** Node/build-time kullanımı için SynthesisResult döner. */
  renderPad(options: ProceduralStemOptions): SynthesisResult {
    return synth(options.duration, padParams(options));
  }

  renderDrone(options: ProceduralStemOptions): SynthesisResult {
    return synth(options.duration, droneParams(options));
  }

  renderBass(options: ProceduralStemOptions): SynthesisResult {
    return synth(options.duration, bassParams(options));
  }

  renderAmbientNoise(options: Omit<ProceduralStemOptions, 'wave'>): SynthesisResult {
    return synth(options.duration, ambientNoiseParams(options));
  }
}
