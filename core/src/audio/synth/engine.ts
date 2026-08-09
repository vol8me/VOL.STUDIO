import type { FmParams, SynthesisResult, SynthParams, Waveform } from './types';
import { Envelope } from './envelope';
import { getWaveSample, getWaveSampleWithPhase } from './waveforms';
import { mixSampleLayer, processSample } from './sample';
import { createNoiseSource, type NoiseSource } from './noise';
import { getCutoffAtTime, HighpassFilter, LowpassFilter } from './filter';
import {
  Bitcrusher,
  Chorus,
  DelayLine,
  Distortion,
  Flanger,
  getPanGains,
  Phaser,
  Reverb,
  StereoWidener,
} from './effects';

const DEFAULT_SAMPLE_RATE = 44100;

type FmState = {
  params: FmParams;
  envelope?: Envelope;
  lastModSample: number;
};

type Voice =
  | { type: 'noise'; noise: NoiseSource; detuneCents: 0 }
  | {
      type: 'tone';
      wave: Exclude<Waveform, 'noise' | 'pink' | 'brown'>;
      detuneCents: number;
      fm?: FmState;
    };

function createFmState(fm: FmParams | undefined, duration: number): FmState | undefined {
  if (!fm || (fm.index ?? 0) <= 0) return undefined;
  const envelope = fm.modulatorEnvelope ? new Envelope(fm.modulatorEnvelope, duration) : undefined;
  return { params: fm, envelope, lastModSample: 0 };
}

function createVoices(
  wave: Waveform | Waveform[] | undefined,
  detune: number | undefined,
  fm: FmParams | undefined,
  duration: number,
): Voice[] {
  const waves = Array.isArray(wave) ? wave : [wave ?? 'sine'];
  const voices: Voice[] = [];

  for (const w of waves) {
    if (w === 'noise' || w === 'pink' || w === 'brown') {
      voices.push({ type: 'noise', noise: createNoiseSource(w), detuneCents: 0 });
    } else {
      voices.push({ type: 'tone', wave: w, detuneCents: 0, fm: createFmState(fm, duration) });
    }
  }

  // Detune varsa ton seslerinin kopyasını ekle
  const detuneCents = detune ?? 0;
  if (detuneCents !== 0) {
    const originalLength = voices.length;
    for (let i = 0; i < originalLength; i++) {
      const v = voices[i];
      if (v?.type === 'tone') {
        voices.push({ type: 'tone', wave: v.wave, detuneCents, fm: createFmState(fm, duration) });
      }
    }
  }

  return voices;
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/** 2-operator phase modulation örneği üretir. */
function getFmSample(
  voice: Extract<Voice, { type: 'tone' }>,
  carrierFreq: number,
  t: number,
  sampleRate: number,
  pulseWidth: number,
): number {
  const fm = voice.fm;
  if (!fm) return 0;

  const modWave = fm.params.modulatorWave ?? 'sine';
  const ratio = fm.params.ratio ?? 1;
  const modFreq = carrierFreq * ratio;
  const modLevel = fm.params.modulatorLevel ?? 1;
  const feedback = Math.max(-0.99, Math.min(0.99, fm.params.feedback ?? 0));

  const env = fm.envelope?.value(t) ?? 1;
  let index = (fm.params.index ?? 0) * env * modLevel;

  // Aliasing guard: sideband'ler nyquist altında kalmalı (Bessel: ~index+2 sideband)
  const nyquist = sampleRate * 0.45;
  if (modFreq > 0 && carrierFreq > 0) {
    const maxSidebandFreq = nyquist - carrierFreq;
    if (maxSidebandFreq > 0) {
      const safeIndex = maxSidebandFreq / modFreq - 2;
      if (index > safeIndex) index = Math.max(0, safeIndex);
    } else {
      index = 0;
    }
  }

  const modPhase = (modFreq * t + (feedback * fm.lastModSample) / (2 * Math.PI)) % 1;
  const modSample = getWaveSampleWithPhase(modWave, modPhase, pulseWidth);
  fm.lastModSample = modSample;

  const carrierPhase = (carrierFreq * t + (index * modSample) / (2 * Math.PI)) % 1;
  return getWaveSampleWithPhase(voice.wave, carrierPhase, pulseWidth);
}

function expLerp(start: number, end: number, t: number): number {
  if (start <= 0) return lerp(start, end, t);
  if (end <= 0) return lerp(start, end, t);
  return start * Math.exp(t * Math.log(end / start));
}

function frequencyAtTime(
  frequency: number,
  slide: number,
  slideCurve: 'linear' | 'exponential' | 'cosine',
  pitchJump: { amount: number; time: number; duration: number } | undefined,
  vibratoDepth: number,
  vibratoRate: number,
  t: number,
  duration: number,
): number {
  let baseFreq = frequency;
  const endFreq = frequency + slide;

  const ratio = duration > 0 ? t / duration : 0;

  switch (slideCurve) {
    case 'linear':
      baseFreq = lerp(frequency, endFreq, ratio);
      break;
    case 'exponential':
      baseFreq = expLerp(frequency, endFreq, ratio);
      break;
    case 'cosine':
      baseFreq = lerp(frequency, endFreq, (1 - Math.cos(ratio * Math.PI)) / 2);
      break;
  }

  if (pitchJump && duration > 0) {
    const jumpStart = pitchJump.time * duration;
    const jumpEnd = jumpStart + pitchJump.duration;
    if (t >= jumpStart && t < jumpEnd) {
      const jumpRatio = (t - jumpStart) / pitchJump.duration;
      // Üçgensel zıplama: yukarı çık, hemen geri dön
      const jumpFactor = jumpRatio < 0.5 ? jumpRatio * 2 : (1 - jumpRatio) * 2;
      baseFreq += pitchJump.amount * jumpFactor;
    }
  }

  if (vibratoDepth > 0 && vibratoRate > 0) {
    baseFreq += vibratoDepth * Math.sin(2 * Math.PI * vibratoRate * t);
  }

  return Math.max(1, baseFreq);
}

function renderDrySample(
  t: number,
  duration: number,
  sampleRate: number,
  voices: Voice[],
  frequency: number,
  slide: number,
  slideCurve: 'linear' | 'exponential' | 'cosine',
  pitchJump: { amount: number; time: number; duration: number } | undefined,
  vibratoDepth: number,
  vibratoRate: number,
  tremoloDepth: number,
  tremoloRate: number,
  pulseWidth: number,
  envelope: Envelope,
  lowpass: LowpassFilter,
  highpass: HighpassFilter,
  lowpassParams: { cutoff: number; slide?: number } | undefined,
  highpassParams: { cutoff: number; slide?: number } | undefined,
  bitcrusher: Bitcrusher | undefined,
  distortion: Distortion | undefined,
): number {
  // Osilatör sesi
  let sample = 0;
  for (const voice of voices) {
    if (voice.type === 'noise') {
      sample += voice.noise?.next() ?? 0;
    } else {
      const detunedFreq =
        voice.detuneCents !== 0
          ? frequencyAtTime(
              frequency,
              slide,
              slideCurve,
              pitchJump,
              vibratoDepth,
              vibratoRate,
              t,
              duration,
            ) * Math.pow(2, voice.detuneCents / 1200)
          : frequencyAtTime(
              frequency,
              slide,
              slideCurve,
              pitchJump,
              vibratoDepth,
              vibratoRate,
              t,
              duration,
            );

      if (voice.fm) {
        sample += getFmSample(voice, detunedFreq, t, sampleRate, pulseWidth);
      } else {
        sample += getWaveSample(voice.wave, detunedFreq, t, pulseWidth);
      }
    }
  }

  // Filtreler
  if (lowpassParams) {
    sample = lowpass.process(sample, getCutoffAtTime(lowpassParams, t, duration));
  }
  if (highpassParams) {
    sample = highpass.process(sample, getCutoffAtTime(highpassParams, t, duration));
  }

  // Bitcrush
  if (bitcrusher) {
    sample = bitcrusher.process(sample, t);
  }

  // Zarf
  const env = envelope.value(t);
  sample *= env;

  // Tremolo
  if (tremoloDepth > 0 && tremoloRate > 0) {
    const tremolo = 1 - tremoloDepth * (0.5 + 0.5 * Math.sin(2 * Math.PI * tremoloRate * t));
    sample *= tremolo;
  }

  // Distortion (zarf sonrası, global efektlerden önce)
  if (distortion) {
    sample = distortion.process(sample);
  }

  return sample;
}

/** Bir ses parametre setinden Float32Array kanalları üretir. */
export function synthesize(params: SynthParams): SynthesisResult {
  const sampleRate = params.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const duration = Math.max(0.001, params.duration);
  const repeat = Math.max(1, Math.floor(params.repeat ?? 1));
  const repeatTime = Math.max(0, params.repeatTime ?? 0);
  const totalDuration = duration + (repeat - 1) * repeatTime;
  const sampleCount = Math.floor(sampleRate * totalDuration);

  const frequency = Math.max(1, params.frequency ?? 440);
  const slide = params.slide ?? 0;
  const slideCurve = params.slideCurve ?? 'exponential';
  const pulseWidth = Math.max(0.01, Math.min(0.99, params.pulseWidth ?? 0.5));
  const vibratoDepth = Math.max(0, params.vibratoDepth ?? 0);
  const vibratoRate = Math.max(0, params.vibratoRate ?? 0);
  const tremoloDepth = Math.max(0, Math.min(1, params.tremoloDepth ?? 0));
  const tremoloRate = Math.max(0, params.tremoloRate ?? 0);
  const gain = Math.max(0, Math.min(1, params.gain ?? 1));

  // Zarf verilmemişse tüm süre boyunca duyulan varsayılan bir zarf kullan
  const envelopeParams = params.envelope ?? {
    attack: 0.01,
    sustain: duration * 0.5,
    release: duration * 0.4,
    sustainLevel: 0.7,
  };

  const voices = createVoices(params.wave, params.detune, params.fm, duration);

  const pitchJump = params.pitchJump
    ? {
        amount: params.pitchJump.amount,
        time: Math.max(0, Math.min(1, params.pitchJump.time)),
        duration: Math.max(0.001, params.pitchJump.duration ?? 0.01),
      }
    : undefined;

  const lowpassParams = params.lowpass
    ? { cutoff: params.lowpass.cutoff, slide: params.lowpass.slide }
    : undefined;
  const highpassParams = params.highpass
    ? { cutoff: params.highpass.cutoff, slide: params.highpass.slide }
    : undefined;

  const distortion = params.distortion ? new Distortion(params.distortion) : undefined;

  const durationSamples = Math.floor(sampleRate * duration);

  const dryBuffer = new Float32Array(sampleCount);

  for (let r = 0; r < repeat; r++) {
    const startOffset = Math.floor(r * repeatTime * sampleRate);

    const envelope = new Envelope(envelopeParams, duration);
    const lowpass = new LowpassFilter(sampleRate);
    const highpass = new HighpassFilter(sampleRate);
    const bitcrusher = params.bitcrush ? new Bitcrusher(params.bitcrush, sampleRate) : undefined;

    for (let i = 0; i < durationSamples; i++) {
      const t = i / sampleRate;
      const sample = renderDrySample(
        t,
        duration,
        sampleRate,
        voices,
        frequency,
        slide,
        slideCurve,
        pitchJump,
        vibratoDepth,
        vibratoRate,
        tremoloDepth,
        tremoloRate,
        pulseWidth,
        envelope,
        lowpass,
        highpass,
        lowpassParams,
        highpassParams,
        bitcrusher,
        distortion,
      );
      dryBuffer[startOffset + i] += sample;
    }
  }

  // Sample layer
  if (params.sample) {
    const sampleBuffer = processSample(params.sample, sampleRate, sampleCount);
    mixSampleLayer(dryBuffer, sampleBuffer, 0);
  }

  return applyGlobalEffects(dryBuffer, params, sampleRate, totalDuration, gain);
}

/** Mono kuru buffer'a master efektleri, normalize ve pan/stereo uygular. */
export function applyGlobalEffects(
  dryBuffer: Float32Array,
  params: Omit<SynthParams, 'duration'>,
  sampleRate: number,
  totalDuration: number,
  gain: number,
): SynthesisResult {
  const effected = dryBuffer;

  if (params.delay) {
    const delay = new DelayLine(params.delay, sampleRate);
    for (let i = 0; i < effected.length; i++) {
      effected[i] = delay.process(effected[i]);
    }
  }

  if (params.flanger) {
    const flanger = new Flanger(params.flanger, sampleRate);
    for (let i = 0; i < effected.length; i++) {
      effected[i] = flanger.process(effected[i], i / sampleRate);
    }
  }

  if (params.phaser) {
    const phaser = new Phaser(params.phaser, sampleRate);
    for (let i = 0; i < effected.length; i++) {
      effected[i] = phaser.process(effected[i], i / sampleRate);
    }
  }

  if (params.chorus) {
    const chorus = new Chorus(params.chorus, sampleRate);
    for (let i = 0; i < effected.length; i++) {
      effected[i] = chorus.process(effected[i], i / sampleRate);
    }
  }

  if (params.reverb) {
    const reverb = new Reverb(params.reverb, sampleRate);
    for (let i = 0; i < effected.length; i++) {
      effected[i] = reverb.process(effected[i]);
    }
  }

  // Pan + stereo width
  let channels: Float32Array[] = [effected];
  if (params.pan !== undefined || params.stereoWidth !== undefined) {
    const left = new Float32Array(effected.length);
    const right = new Float32Array(effected.length);

    if (params.pan !== undefined) {
      const [leftGain, rightGain] = getPanGains(params.pan);
      for (let i = 0; i < effected.length; i++) {
        left[i] = effected[i] * leftGain;
        right[i] = effected[i] * rightGain;
      }
    } else {
      for (let i = 0; i < effected.length; i++) {
        left[i] = effected[i];
        right[i] = effected[i];
      }
    }

    if (params.stereoWidth) {
      const widener = new StereoWidener(params.stereoWidth);
      for (let i = 0; i < effected.length; i++) {
        [left[i], right[i]] = widener.process(left[i], right[i]);
      }
    }

    channels = [left, right];
  }

  // Normalize (tüm kanallar üzerinden)
  let peak = 0;
  for (const ch of channels) {
    for (const s of ch) {
      peak = Math.max(peak, Math.abs(s));
    }
  }
  if (peak > 0) {
    const scale = (0.95 * gain) / peak;
    for (const ch of channels) {
      for (let i = 0; i < ch.length; i++) {
        ch[i] *= scale;
      }
    }
  }

  return {
    channels,
    sampleRate,
    duration: totalDuration,
  };
}

/** Tek kanallı mono örneklerden zirveye göre normalize eder. */
export function normalize(buffer: Float32Array, target = 0.95): Float32Array {
  let peak = 0;
  for (const s of buffer) peak = Math.max(peak, Math.abs(s));
  if (peak === 0) return buffer;
  const out = new Float32Array(buffer.length);
  const scale = target / peak;
  for (let i = 0; i < buffer.length; i++) out[i] = buffer[i] * scale;
  return out;
}

/** Birden fazla mono tamponu karıştırır. */
export function mix(...buffers: Float32Array[]): Float32Array {
  const maxLen = Math.max(...buffers.map((b) => b.length));
  const out = new Float32Array(maxLen);
  for (const b of buffers) {
    for (let i = 0; i < b.length; i++) out[i] += b[i];
  }
  return out;
}

/** Helper: Hızlı ses üretimi. */
export function synth(duration: number, params: Omit<SynthParams, 'duration'>): SynthesisResult {
  return synthesize({ ...params, duration });
}
