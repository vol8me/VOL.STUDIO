import type { FmParams, HarmonicParams, SynthesisResult, SynthParams, Waveform } from './types';
import { Envelope } from './envelope';
import { getWaveSample, getWaveSampleWithPhase } from './waveforms';
import { mixSampleLayer, processSample } from './sample';
import { createNoiseSource, type NoiseSource } from './noise';
import { createFilter, getCutoffAtTime, type Filter } from './filter';
import {
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
const OVERSAMPLE_FACTOR = 2;

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
    }
  | {
      type: 'additive';
      harmonics: HarmonicParams[];
      detuneCents: number;
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
  sampleRate: number,
  harmonics: HarmonicParams[] | undefined,
): Voice[] {
  const voices: Voice[] = [];

  // Additive synthesis — harmonik serisi varsa sine toplamı kullan
  if (harmonics && harmonics.length > 0) {
    voices.push({ type: 'additive', harmonics, detuneCents: 0 });
    // Detune varsa kopya ekle
    const detuneCents = detune ?? 0;
    if (detuneCents !== 0) {
      voices.push({ type: 'additive', harmonics, detuneCents });
    }
    return voices;
  }

  const waves = Array.isArray(wave) ? wave : [wave ?? 'sine'];

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

  // Feedback: bir önceki modulator çıktısı modulator phase'ine geri beslenir
  // feedback radyan cinsinden faz sapması — direkt phase'e eklenir
  const modPhase = (modFreq * t + feedback * fm.lastModSample) % 1;
  const modInc = modFreq / sampleRate;
  const modSample = getWaveSampleWithPhase(modWave, modPhase, pulseWidth, modInc);
  fm.lastModSample = modSample;

  // Carrier phase: index * modSample radyan cinsinden faz sapması
  // 2π'ye bölerek normalize faz sapması elde edilir
  const carrierPhase = (carrierFreq * t + (index * modSample) / (2 * Math.PI)) % 1;
  const carrierInc = carrierFreq / sampleRate;
  return getWaveSampleWithPhase(voice.wave, carrierPhase, pulseWidth, carrierInc);
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
  lowpass: Filter | undefined,
  highpass: Filter | undefined,
  lowpassParams: { cutoff: number; slide?: number; envAmount?: number } | undefined,
  highpassParams: { cutoff: number; slide?: number; envAmount?: number } | undefined,
  lowpassEnv: Envelope | undefined,
  highpassEnv: Envelope | undefined,
  distortion: Distortion | undefined,
  lfoValues: { pitch: number; filter: number; amplitude: number },
): number {
  let sample = 0;
  const lfoFreq = frequency + lfoValues.pitch;

  for (const voice of voices) {
    if (voice.type === 'noise') {
      sample += voice.noise?.next() ?? 0;
    } else if (voice.type === 'additive') {
      const baseFreq = frequencyAtTime(
        lfoFreq,
        slide,
        slideCurve,
        pitchJump,
        vibratoDepth,
        vibratoRate,
        t,
        duration,
      );
      const detunedFreq =
        voice.detuneCents !== 0
          ? baseFreq * Math.pow(2, voice.detuneCents / 1200)
          : baseFreq;
      let sum = 0;
      for (const h of voice.harmonics) {
        const hFreq = detunedFreq * h.ratio;
        const hPhase = (hFreq * t + (h.phase ?? 0)) % 1;
        sum += getWaveSampleWithPhase('sine', hPhase, pulseWidth, hFreq / sampleRate);
      }
      sample += sum;
    } else {
      const detunedFreq =
        voice.detuneCents !== 0
          ? frequencyAtTime(
              lfoFreq,
              slide,
              slideCurve,
              pitchJump,
              vibratoDepth,
              vibratoRate,
              t,
              duration,
            ) * Math.pow(2, voice.detuneCents / 1200)
          : frequencyAtTime(
              lfoFreq,
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
        sample += getWaveSample(voice.wave, detunedFreq, t, pulseWidth, sampleRate);
      }
    }
  }

  // Filtreler — LFO + zarf modülasyonu cutoff'a uygula
  if (lowpass && lowpassParams) {
    let cutoff = getCutoffAtTime(lowpassParams, t, duration);
    if (lowpassEnv) {
      const envValue = lowpassEnv.value(t);
      const envAmount = lowpassParams.envAmount ?? 0;
      cutoff *= 1 - envAmount + envAmount * envValue;
    }
    cutoff += lfoValues.filter;
    sample = lowpass.process(sample, Math.max(1, cutoff));
  }
  if (highpass && highpassParams) {
    let cutoff = getCutoffAtTime(highpassParams, t, duration);
    if (highpassEnv) {
      const envValue = highpassEnv.value(t);
      const envAmount = highpassParams.envAmount ?? 0;
      cutoff *= 1 - envAmount + envAmount * envValue;
    }
    cutoff += lfoValues.filter;
    sample = highpass.process(sample, Math.max(1, cutoff));
  }

  // Zarf
  const env = envelope.value(t);
  sample *= env;

  // Tremolo
  if (tremoloDepth > 0 && tremoloRate > 0) {
    const tremolo = 1 - tremoloDepth * (0.5 + 0.5 * Math.sin(2 * Math.PI * tremoloRate * t));
    sample *= tremolo;
  }

  // LFO amplitude modülasyonu
  if (lfoValues.amplitude !== 0) {
    sample *= 1 - lfoValues.amplitude * 0.5;
  }

  // Distortion (zarf sonrası, global efektlerden önce)
  if (distortion) {
    sample = distortion.process(sample);
  }

  return sample;
}

/** 2x oversampling ile anti-aliasing lowpass + decimation.
 *  İç sentez 2x hızda yapılır, sonra Nyquist altına düşürülür. */
function downsample2x(buffer: Float32Array, internalRate: number, targetRate: number): Float32Array {
  const cutoff = targetRate * 0.45;
  // İki geçişli biquad lowpass — steep rolloff, aliasing'i temizler
  const f1 = createFilter({ cutoff, resonance: 0.707, poles: 2, type: 'lowpass' }, internalRate, 'lowpass');
  const f2 = createFilter({ cutoff, resonance: 0.707, poles: 2, type: 'lowpass' }, internalRate, 'lowpass');
  const filtered = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    const s = buffer[i]!;
    filtered[i] = f2!.process(f1!.process(s, cutoff), cutoff);
  }
  // Decimate by 2
  const outLen = Math.floor(buffer.length / OVERSAMPLE_FACTOR);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    out[i] = filtered[i * OVERSAMPLE_FACTOR]!;
  }
  return out;
}

/** Bir ses parametre setinden Float32Array kanalları üretir.
 *  2x oversampling ile aliasing azaltılmış, bandlimited dalga şekilleri. */
export function synthesize(params: SynthParams): SynthesisResult {
  const sampleRate = params.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const internalRate = sampleRate * OVERSAMPLE_FACTOR;
  const duration = Math.max(0.001, params.duration);
  const repeat = Math.max(1, Math.floor(params.repeat ?? 1));
  const repeatTime = Math.max(0, params.repeatTime ?? 0);
  const totalDuration = duration + (repeat - 1) * repeatTime;
  const internalSampleCount = Math.floor(internalRate * totalDuration);

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

  const voices = createVoices(params.wave, params.detune, params.fm, duration, internalRate, params.harmonics);

  const pitchJump = params.pitchJump
    ? {
        amount: params.pitchJump.amount,
        time: Math.max(0, Math.min(1, params.pitchJump.time)),
        duration: Math.max(0.001, params.pitchJump.duration ?? 0.01),
      }
    : undefined;

  // Filter envelope parametreleri
  const lowpassParams = params.lowpass
    ? { cutoff: params.lowpass.cutoff, slide: params.lowpass.slide, envAmount: params.lowpass.envAmount }
    : undefined;
  const highpassParams = params.highpass
    ? { cutoff: params.highpass.cutoff, slide: params.highpass.slide, envAmount: params.highpass.envAmount }
    : undefined;

  // Filtre örnekleri her repeat için yeniden oluşturulur (stateful)
  const lowpassFactory = () => createFilter(params.lowpass, internalRate, 'lowpass');
  const highpassFactory = () => createFilter(params.highpass, internalRate, 'highpass');

  // Filter envelope'ları
  const lowpassEnvParams = params.lowpass?.envelope;
  const highpassEnvParams = params.highpass?.envelope;

  const distortion = params.distortion ? new Distortion(params.distortion) : undefined;

  // LFO'lar
  const lfos = params.lfos ?? [];

  const durationSamples = Math.floor(internalRate * duration);

  const dryBufferInternal = new Float32Array(internalSampleCount);

  for (let r = 0; r < repeat; r++) {
    const startOffset = Math.floor(r * repeatTime * internalRate);

    const envelope = new Envelope(envelopeParams, duration);
    const lowpass = lowpassFactory();
    const highpass = highpassFactory();
    const lowpassEnv = lowpassEnvParams ? new Envelope(lowpassEnvParams, duration) : undefined;
    const highpassEnv = highpassEnvParams ? new Envelope(highpassEnvParams, duration) : undefined;

    // Filter pre-warm: 1ms 0 input ile filter'ı steady-state'e getir.
    // BiquadFilter zero-state'te başlayınca ilk sample'larda ringing olur.
    // Pre-warm ile filter internal state'i doldurulur, nota başında tıkı olmaz.
    const warmupSamples = Math.floor(internalRate * 0.001);
    const lpCutoff = lowpassParams ? lowpassParams.cutoff : 20000;
    const hpCutoff = highpassParams ? highpassParams.cutoff : 20;
    for (let w = 0; w < warmupSamples; w++) {
      if (lowpass) lowpass.process(0, lpCutoff);
      if (highpass) highpass.process(0, hpCutoff);
    }

    for (let i = 0; i < durationSamples; i++) {
      const t = i / internalRate;

      // LFO değerlerini hesapla
      let lfoPitch = 0;
      let lfoFilter = 0;
      let lfoAmplitude = 0;
      for (const lfo of lfos) {
        const lfoWave = lfo.wave ?? 'sine';
        const lfoPhase = (lfo.rate * t + (lfo.phase ?? 0)) % 1;
        const lfoValue = getWaveSampleWithPhase(lfoWave, lfoPhase, pulseWidth, lfo.rate / internalRate);
        switch (lfo.target) {
          case 'pitch':
            lfoPitch += lfoValue * lfo.depth;
            break;
          case 'filter':
            lfoFilter += lfoValue * lfo.depth;
            break;
          case 'amplitude':
            lfoAmplitude += (lfoValue * 0.5 + 0.5) * lfo.depth;
            break;
        }
      }

      const sample = renderDrySample(
        t,
        duration,
        internalRate,
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
        lowpassEnv,
        highpassEnv,
        distortion,
        { pitch: lfoPitch, filter: lfoFilter, amplitude: lfoAmplitude },
      );
      dryBufferInternal[startOffset + i] += sample;
    }
  }

  // Oversampling → downsample to target rate
  const dryBuffer = downsample2x(dryBufferInternal, internalRate, sampleRate);

  // Sample layer
  if (params.sample) {
    const sampleBuffer = processSample(params.sample, sampleRate, Math.floor(sampleRate * totalDuration));
    mixSampleLayer(dryBuffer, sampleBuffer, 0);
  }

  return applyGlobalEffects(dryBuffer, params, sampleRate, totalDuration, gain);
}

/** Mono kuru buffer'a master efektleri, pan, stereo reverb ve normalize uygular.
 *  Zinciri: delay → flanger → phaser → chorus → pan → stereo reverb →
 *  stereo width → normalize.
 *  Pan reverb öncesi — her kanal kendi reverb kuyruğuna girer, geniş imaj. */
export function applyGlobalEffects(
  dryBuffer: Float32Array,
  params: Omit<SynthParams, 'duration'>,
  sampleRate: number,
  totalDuration: number,
  gain: number,
): SynthesisResult {
  let effected = dryBuffer;

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

  // Pan reverb öncesi — stereo'ya böl, sonra reverb her kanalı bağımsız işler
  const needsStereo = params.pan !== undefined || params.stereoWidth !== undefined || params.reverb !== undefined;
  let left: Float32Array;
  let right: Float32Array;

  if (needsStereo) {
    left = new Float32Array(effected.length);
    right = new Float32Array(effected.length);

    if (params.pan !== undefined) {
      const [leftGain, rightGain] = getPanGains(params.pan);
      for (let i = 0; i < effected.length; i++) {
        left[i] = effected[i]! * leftGain;
        right[i] = effected[i]! * rightGain;
      }
    } else {
      for (let i = 0; i < effected.length; i++) {
        left[i] = effected[i]!;
        right[i] = effected[i]!;
      }
    }
  } else {
    left = effected;
    right = effected;
  }

  // Stereo reverb — pan sonrası, her kanal bağımsız reverb kuyruğu
  if (params.reverb) {
    const reverb = new Reverb(params.reverb, sampleRate);
    for (let i = 0; i < left.length; i++) {
      [left[i], right[i]] = reverb.processStereo(left[i]!, right[i]!);
    }
  }

  // Stereo width — reverb sonrası
  if (params.stereoWidth !== undefined && needsStereo) {
    const widthParam = typeof params.stereoWidth === 'number'
      ? { width: params.stereoWidth }
      : params.stereoWidth;
    const widener = new StereoWidener(widthParam);
    for (let i = 0; i < left.length; i++) {
      [left[i], right[i]] = widener.process(left[i]!, right[i]!);
    }
  }

  // Kanal listesi — stereo ise iki kanal, değilse mono
  const channels: Float32Array[] = needsStereo ? [left, right] : [effected];

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

/** Brick-wall limiter — clipping'i önler, normalize öncesi kullanılır.
 *  0 dB threshold üstündeki sinyali soft-knee ile sınırlandırır. */
export function limitBuffer(buffer: Float32Array, threshold = 0.95): Float32Array {
  const out = new Float32Array(buffer.length);
  const knee = 0.1; // soft-knee genişliği
  for (let i = 0; i < buffer.length; i++) {
    const s = buffer[i];
    const abs = Math.abs(s);
    if (abs > threshold - knee) {
      // Soft-knee: threshold-knee ile threshold arası gradual, threshold üstü brick-wall
      const over = abs - (threshold - knee);
      const ratio = over > knee ? 0 : 1 - over / knee;
      const limited = (threshold - knee) + over * ratio;
      out[i] = Math.sign(s) * Math.min(threshold, limited);
    } else {
      out[i] = s;
    }
  }
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
