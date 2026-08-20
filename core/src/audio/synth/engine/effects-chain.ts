import type { SynthesisResult, SynthParams } from '../types';
import { Chorus, DelayLine, Flanger, getPanGains, Phaser, Reverb, StereoWidener } from '../effects';
import { NORMALIZE_TARGET_PEAK } from './constants';

/**
 * Mono kuru buffer'a master efektleri, pan, stereo reverb ve normalize uygular.
 * Zincir: delay → flanger → phaser → chorus → pan → stereo reverb →
 * stereo width → normalize. Pan reverb öncesi — her kanal kendi reverb
 * kuyruğuna girer, geniş imaj.
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
  const effected = dryBuffer.slice();

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
  const needsStereo =
    params.pan !== undefined || params.stereoWidth !== undefined || params.reverb !== undefined;
  let left: Float32Array;
  let right: Float32Array;

  if (needsStereo) {
    left = new Float32Array(effected.length);
    right = new Float32Array(effected.length);

    if (params.pan !== undefined) {
      const [leftGain, rightGain] = getPanGains(params.pan);
      for (let i = 0; i < effected.length; i++) {
        left[i] = effected[i] * leftGain;
        right[i] = effected[i] * rightGain;
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
      [left[i], right[i]] = reverb.processStereo(left[i], right[i]);
    }
  }

  // Stereo width — reverb sonrası
  if (params.stereoWidth !== undefined && needsStereo) {
    const widthParam =
      typeof params.stereoWidth === 'number' ? { width: params.stereoWidth } : params.stereoWidth;
    const widener = new StereoWidener(widthParam);
    for (let i = 0; i < left.length; i++) {
      [left[i], right[i]] = widener.process(left[i], right[i]);
    }
  }

  // Kanal listesi — stereo ise iki kanal, değilse mono
  const channels: Float32Array[] = needsStereo ? [left, right] : [effected];

  // Tepe normalizasyonu opsiyoneldir. Varsayılan `true` — mevcut tüm preset'ler
  // ve üretilmiş asset'ler bu davranışa göre ayarlanmış durumda. Ama her sesi
  // 0.95'e çekmek doğal seviye farklarını yok eder: bir UI blip'i ile bir
  // patlama aynı tepeye çıkar. Mix dinamiği önemli olan yerlerde (bkz.
  // sequencer'da nota bazlı sentez) `normalize: false` geçilmelidir.
  let peak = 0;
  for (const ch of channels) {
    for (const s of ch) {
      peak = Math.max(peak, Math.abs(s));
    }
  }

  if (params.normalize !== false) {
    if (peak > 0) {
      const scale = (NORMALIZE_TARGET_PEAK * gain) / peak;
      for (const ch of channels) {
        for (let i = 0; i < ch.length; i++) {
          ch[i] *= scale;
        }
      }
    }
  } else if (gain !== 1) {
    for (const ch of channels) {
      for (let i = 0; i < ch.length; i++) {
        ch[i] *= gain;
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

/**
 * Soft-knee brick-wall limiter. Tavan `threshold`, geçiş `knee` genişliğinde.
 *
 * Transfer eğrisi monoton ve C1-sürekli: knee bölgesinde
 * `y = x - (x - T + W/2)² / (2W)`, üstünde `y = T`.
 */
export function limitBuffer(buffer: Float32Array, threshold = 0.95, knee = 0.1): Float32Array {
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
