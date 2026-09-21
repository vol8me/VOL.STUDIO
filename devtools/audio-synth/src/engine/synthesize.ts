import type { SynthesisResult, SynthParams } from '../types';
import { Envelope } from '../synthesis/envelope';
import { buildFilter } from '../synthesis/filter';
import { mixSampleLayer, processSample } from '../synthesis/sample';
import { getWaveSampleWithPhase } from '../synthesis/waveforms';
import { DEFAULT_SEED } from '@volstudio/core/random';
import { Distortion } from '../effects';
import { resolveSynthParams } from '../guard/synth';
import { assertRenderBudget, estimateSynthCost } from '../guard/budget';
import { createVoices } from './voice';
import { renderDrySample, downsample2x } from './render';
import { applyGlobalEffects } from './effects-chain';
import { OVERSAMPLE_FACTOR } from './constants';

/** Bir ses parametre setinden Float32Array kanalları üretir.
 *  2x oversampling ile aliasing azaltılmış, bandlimited dalga şekilleri.
 *
 *  Parametreler önce `resolveSynthParams` sınırından, sonra kaynak
 *  bütçesinden geçer; bozuk ya da aşırı istek tek bir tampon ayrılmadan
 *  `AudioParamError`/`RenderBudgetError` ile reddedilir. */
export function synthesize(params: SynthParams): SynthesisResult {
  const p = resolveSynthParams(params);
  assertRenderBudget(estimateSynthCost(p), 'synthesize');

  const { sampleRate, duration, totalDuration } = p;
  const internalRate = sampleRate * OVERSAMPLE_FACTOR;
  const internalSampleCount = Math.floor(internalRate * totalDuration);
  const seed = p.seed ?? DEFAULT_SEED;

  // Zarf verilmemişse tüm süre boyunca duyulan varsayılan bir zarf kullan
  const envelopeParams = p.envelope ?? {
    attack: 0.01,
    sustain: duration * 0.5,
    release: duration * 0.4,
    sustainLevel: 0.7,
  };

  const distortion = params.distortion ? new Distortion(params.distortion) : undefined;
  const durationSamples = Math.floor(internalRate * duration);
  const dryBufferInternal = new Float32Array(internalSampleCount);

  for (let r = 0; r < p.repeat; r++) {
    // Toplam süre tekrarların tamamını kapsar (kelepçelenmez), yani her
    // tekrar tampon içinde başlar; son tekrarın yuvarlama artığı kesilir.
    const startOffset = Math.floor(r * p.repeatTime * internalRate);
    const count = Math.min(durationSamples, internalSampleCount - startOffset);

    // Sesler her tekrar için yeniden kurulur: faz artık birikimli olduğundan
    // paylaşılan bir ses, tekrarları birbirine kaydırırdı. Zarf ve filtreler
    // zaten bu deseni kullanıyordu.
    const voices = createVoices(p.waves, p.detune, p.fm, duration, p.harmonics, seed + r * 1013);

    const envelope = new Envelope(envelopeParams, duration);
    const lowpass = p.lowpass ? buildFilter(p.lowpass, internalRate) : undefined;
    const highpass = p.highpass ? buildFilter(p.highpass, internalRate) : undefined;
    const lowpassEnv = p.lowpass?.envelope ? new Envelope(p.lowpass.envelope, duration) : undefined;
    const highpassEnv = p.highpass?.envelope
      ? new Envelope(p.highpass.envelope, duration)
      : undefined;

    // Filter pre-warm: 1ms 0 input ile filter'ı steady-state'e getir.
    // BiquadFilter zero-state'te başlayınca ilk sample'larda ringing olur.
    // Pre-warm ile filter internal state'i doldurulur, nota başında tıkı olmaz.
    const warmupSamples = Math.floor(internalRate * 0.001);
    const lpCutoff = p.lowpass ? p.lowpass.cutoff : 20000;
    const hpCutoff = p.highpass ? p.highpass.cutoff : 20;
    for (let w = 0; w < warmupSamples; w++) {
      if (lowpass) lowpass.process(0, lpCutoff);
      if (highpass) highpass.process(0, hpCutoff);
    }

    for (let i = 0; i < count; i++) {
      const t = i / internalRate;

      // LFO değerlerini hesapla
      let lfoPitch = 0;
      let lfoFilter = 0;
      let lfoAmplitude = 0;
      for (const lfo of p.lfos) {
        const lfoPhase = (lfo.rate * t + lfo.phase) % 1;
        const lfoValue = getWaveSampleWithPhase(
          lfo.wave,
          lfoPhase,
          p.pulseWidth,
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
        p.frequency,
        p.slide,
        p.slideCurve,
        p.pitchJump,
        p.vibratoDepth,
        p.vibratoRate,
        p.tremoloDepth,
        p.tremoloRate,
        p.pulseWidth,
        envelope,
        lowpass,
        highpass,
        p.lowpass,
        p.highpass,
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

  return applyGlobalEffects(dryBuffer, params, sampleRate, totalDuration, p.gain);
}

/** Helper: Hızlı ses üretimi. */
export function synth(duration: number, params: Omit<SynthParams, 'duration'>): SynthesisResult {
  return synthesize({ ...params, duration });
}
