import type { SynthesisResult, SynthParams } from '../types';
import {
  Chorus,
  DelayLine,
  Flanger,
  getPanGains,
  PhaserEffect,
  Reverb,
  StereoWidener,
} from '../effects';
import { NORMALIZE_TARGET_PEAK } from './constants';
import { resolveBusParams, type ResolvedBusEffects } from '../guard/synth';
import { checkNumber } from '../guard/read';
import { masterChannels } from './master';

/**
 * Mono kuru tampona bus efekt zincirini uygular ve kanalları döner:
 * delay → flanger → phaser → chorus → pan → stereo reverb → stereo width.
 * Pan reverb öncesi — her kanal kendi reverb kuyruğuna girer, geniş imaj.
 * Seviye/normalize burada YOKTUR; o karar çağıranın mastering adımındadır.
 *
 * `dryBuffer` değiştirilmez; zincir kendi kopyasında çalışır.
 */
export function applyBusEffects(
  dryBuffer: Float32Array,
  bus: ResolvedBusEffects,
  sampleRate: number,
): Float32Array[] {
  const effected = dryBuffer.slice();

  if (bus.delay) {
    const delay = new DelayLine(bus.delay, sampleRate);
    for (let i = 0; i < effected.length; i++) {
      effected[i] = delay.process(effected[i]);
    }
  }

  if (bus.flanger) {
    const flanger = new Flanger(bus.flanger, sampleRate);
    for (let i = 0; i < effected.length; i++) {
      effected[i] = flanger.process(effected[i], i / sampleRate);
    }
  }

  if (bus.phaser) {
    const phaser = new PhaserEffect(bus.phaser, sampleRate);
    for (let i = 0; i < effected.length; i++) {
      effected[i] = phaser.process(effected[i], i / sampleRate);
    }
  }

  if (bus.chorus) {
    const chorus = new Chorus(bus.chorus, sampleRate);
    for (let i = 0; i < effected.length; i++) {
      effected[i] = chorus.process(effected[i], i / sampleRate);
    }
  }

  const needsStereo =
    bus.pan !== undefined || bus.stereoWidth !== undefined || bus.reverb !== undefined;
  if (!needsStereo) return [effected];

  // Sol kanal `effected`in kendisidir: ikinci bir tam boy kopya gerekmez.
  const left = effected;
  const right = new Float32Array(effected.length);
  if (bus.pan !== undefined) {
    const [leftGain, rightGain] = getPanGains(bus.pan);
    for (let i = 0; i < effected.length; i++) {
      right[i] = effected[i] * rightGain;
      left[i] = effected[i] * leftGain;
    }
  } else {
    right.set(effected);
  }

  // Stereo reverb — pan sonrası, her kanal bağımsız reverb kuyruğu
  if (bus.reverb) {
    const reverb = new Reverb(bus.reverb, sampleRate);
    for (let i = 0; i < left.length; i++) {
      [left[i], right[i]] = reverb.processStereo(left[i], right[i]);
    }
  }

  if (bus.stereoWidth !== undefined) {
    const widener = new StereoWidener(bus.stereoWidth);
    for (let i = 0; i < left.length; i++) {
      [left[i], right[i]] = widener.process(left[i], right[i]);
    }
  }

  return [left, right];
}

/**
 * Tek bir sesin çıkış hazırlığı: bus zinciri, sonra `masterChannels` ile
 * tepe normalizasyonu (ya da düz kazanç) ve kuyruk de-click'i.
 *
 * `dryBuffer` değiştirilmez; fonksiyon kendi kopyasında çalışır.
 */
export function applyGlobalEffects(
  dryBuffer: Float32Array,
  params: Omit<SynthParams, 'duration'>,
  sampleRate: number,
  totalDuration: number,
  gain: number,
): SynthesisResult {
  const bus = resolveBusParams(params);
  const level = checkNumber(gain, 'gain', { min: 0, max: 1 });
  const channels = applyBusEffects(dryBuffer, bus, sampleRate);

  // Tepe normalizasyonu opsiyoneldir (varsayılan `true`): mevcut presetler ve
  // asset'ler buna göre ayarlı. Mix dinamiği önemliyse `normalize: false`
  // geçilir ve seviye tek kez mix'in sonunda verilir.
  //
  // Kuyruk de-click'i: tampon kuyruğun değil `duration`'ın bittiği yerde
  // kesilir; son ~10 ms yükselen-kosinüsle iner. Kısa tamponda tamponun
  // dörtte birine küçülür — kasıtlı tık (UI tick) karakteri korunur.
  masterChannels(channels, sampleRate, {
    level:
      params.normalize !== false
        ? { mode: 'peak', target: NORMALIZE_TARGET_PEAK * level }
        : { mode: 'none', gain: level },
    fadeOutSeconds: 0.01,
    fadeOutCurve: 'cosine',
    maxFadeFraction: 0.25,
  });

  return {
    channels,
    sampleRate,
    duration: totalDuration,
  };
}

/** Tek kanallı mono örneklerden zirveye göre normalize eder. */
export function normalize(buffer: Float32Array, target = 0.95): Float32Array {
  checkNumber(target, 'target', { above: 0, max: 1 });
  let peak = 0;
  for (const s of buffer) peak = Math.max(peak, Math.abs(s));
  if (peak === 0) return buffer;
  const out = new Float32Array(buffer.length);
  const scale = target / peak;
  for (let i = 0; i < buffer.length; i++) out[i] = buffer[i] * scale;
  return out;
}

/**
 * Soft-knee brick-wall limiter. Tavan `threshold`, geçiş `knee` genişliğinde.
 *
 * Transfer eğrisi monoton ve C1-sürekli: knee bölgesinde
 * `y = x - (x - T + W/2)² / (2W)`, üstünde `y = T`.
 */
export function limitBuffer(buffer: Float32Array, threshold = 0.95, knee = 0.1): Float32Array {
  checkNumber(threshold, 'threshold', { above: 0, max: 1 });
  checkNumber(knee, 'knee', { min: 0 });
  const out = new Float32Array(buffer.length);
  const w = Math.max(1e-6, knee);
  const kneeStart = threshold - w / 2;
  const kneeEnd = threshold + w / 2;

  for (let i = 0; i < buffer.length; i++) {
    const s = buffer[i];
    const abs = Math.abs(s);

    let limited: number;
    if (abs <= kneeStart) {
      limited = abs;
    } else if (abs >= kneeEnd) {
      limited = threshold;
    } else {
      const over = abs - kneeStart;
      limited = abs - (over * over) / (2 * w);
    }

    out[i] = s < 0 ? -limited : limited;
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
