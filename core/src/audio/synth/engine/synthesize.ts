import type { SynthesisResult, SynthParams } from '../types';
import { Envelope } from '../envelope';
import { createFilter } from '../filter';
import { mixSampleLayer, processSample } from '../sample';
import { getWaveSampleWithPhase } from '../waveforms';
import { DEFAULT_SEED } from '../random';
import { Distortion } from '../effects';
import { createVoices } from './voice';
import { renderDrySample, downsample2x } from './render';
import { applyGlobalEffects } from './effects-chain';
import { DEFAULT_SAMPLE_RATE, OVERSAMPLE_FACTOR } from './constants';

/** Bir ses parametre setinden Float32Array kanalları üretir.
 *  2x oversampling ile aliasing azaltılmış, bandlimited dalga şekilleri. */
export function synthesize(params: SynthParams): SynthesisResult {
  const sampleRate = params.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const internalRate = sampleRate * OVERSAMPLE_FACTOR;
  const duration = Math.max(0.001, params.duration);
  const repeat = Math.max(1, Math.floor(params.repeat ?? 1));
  // `repeatTime` tekrarlar ARASINDAKİ süredir. 0 → tekrarlar üst üste biner
  // (overlap); sesler her tekrar için yeniden kurulduğu için faz farklıdır.
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
  const seed = params.seed ?? DEFAULT_SEED;

  // Zarf verilmemişse tüm süre boyunca duyulan varsayılan bir zarf kullan
  const envelopeParams = params.envelope ?? {
    attack: 0.01,
    sustain: duration * 0.5,
    release: duration * 0.4,
    sustainLevel: 0.7,
  };

  const pitchJump = params.pitchJump
    ? {
        amount: params.pitchJump.amount,
        time: Math.max(0, Math.min(1, params.pitchJump.time)),
        duration: Math.max(0.001, params.pitchJump.duration ?? 0.01),
      }
    : undefined;

  // Filter envelope parametreleri
  const lowpassParams = params.lowpass
    ? {
        cutoff: params.lowpass.cutoff,
        slide: params.lowpass.slide,
        envAmount: params.lowpass.envAmount,
      }
    : undefined;
  const highpassParams = params.highpass
    ? {
        cutoff: params.highpass.cutoff,
        slide: params.highpass.slide,
        envAmount: params.highpass.envAmount,
      }
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

    // Sesler her tekrar için yeniden kurulur: faz artık birikimli olduğundan
    // paylaşılan bir ses, tekrarları birbirine kaydırırdı. Zarf ve filtreler
    // zaten bu deseni kullanıyordu.
    const voices = createVoices(
      params.wave,
      params.detune,
      params.fm,
      duration,
      params.harmonics,
      seed + r * 1013,
    );

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
        const lfoValue = getWaveSampleWithPhase(
          lfoWave,
          lfoPhase,
          pulseWidth,
          lfo.rate / internalRate,
        );
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
    const sampleBuffer = processSample(
      params.sample,
      sampleRate,
      Math.floor(sampleRate * totalDuration),
    );
    mixSampleLayer(dryBuffer, sampleBuffer, 0);
  }

  return applyGlobalEffects(dryBuffer, params, sampleRate, totalDuration, gain);
}

/** Helper: Hızlı ses üretimi. */
export function synth(duration: number, params: Omit<SynthParams, 'duration'>): SynthesisResult {
  return synthesize({ ...params, duration });
}
