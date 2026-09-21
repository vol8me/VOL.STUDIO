import { checkNumber } from '../guard/read';

/**
 * Tek seviye/sonlandırma çekirdeği. Tek sesin çıkışı (`synthesize`), dizi
 * (`compose`) ve çok sesli düzenleme (`Timeline`) seviyelerini BURADA alır;
 * ikinci bir normalize/sınırlayıcı/sönüm gerçeği yazılmaz.
 *
 * Sıra sabittir ve tersine çevrilemez: DC → ölçüm → kazanç → sınırlayıcı →
 * tavan → kenar sönümü. Önce sınırlayıp sonra ölçeklemek sınırlayıcının
 * kazandığı payı geri verirdi; ölçüm kazançtan önce, yalnız TUTULACAK
 * aralıkta yapılır (kesilecek sessizlik paydaya girmez).
 */
export type MasterLevel =
  | { readonly mode: 'none'; readonly gain?: number }
  | { readonly mode: 'peak'; readonly target: number }
  | { readonly mode: 'rms'; readonly target: number; readonly maxGain?: number };

export interface MasterOptions {
  readonly level: MasterLevel;
  /** DC engelleyici kesimi (Hz). Verilmezse DC'ye dokunulmaz. */
  readonly dcBlockHz?: number;
  /** Yumuşak sınırlayıcı: `threshold` altına dokunmaz, `threshold + knee`i aşmaz. */
  readonly limiter?: { readonly threshold: number; readonly knee: number };
  /** Son tepe tavanı; aşılırsa bütün sinyal orantılı indirilir. */
  readonly ceiling?: number;
  /** Uç sönümleri (saniye). `fadeOutCurve: 'cosine'` yükselen-kosinüs, varsayılan doğrusal. */
  readonly fadeInSeconds?: number;
  readonly fadeOutSeconds?: number;
  readonly fadeOutCurve?: 'linear' | 'cosine';
  /** Sönüm uzunluğunun tampona oranı üst sınırı (kısa tamponda kasıtlı tık korunur). */
  readonly maxFadeFraction?: number;
}

/** Kare ortalamanın karekökü — kanallar ve örnekler üzerinde. */
export function measureRms(channels: readonly Float32Array[], length?: number): number {
  let energy = 0;
  let count = 0;
  for (const channel of channels) {
    const end = Math.min(channel.length, length ?? channel.length);
    for (let i = 0; i < end; i++) {
      const value = channel[i];
      if (!Number.isFinite(value)) continue;
      energy += value * value;
      count++;
    }
  }
  return count === 0 ? 0 : Math.sqrt(energy / count);
}

/** Tepe genlik (sample peak). */
export function measurePeak(channels: readonly Float32Array[], length?: number): number {
  let peak = 0;
  for (const channel of channels) {
    const end = Math.min(channel.length, length ?? channel.length);
    for (let i = 0; i < end; i++) {
      const value = channel[i];
      if (Number.isFinite(value)) peak = Math.max(peak, Math.abs(value));
    }
  }
  return peak;
}

/**
 * Diz bölgeli yumuşak sınırlayıcı: `threshold` altında sinyale DOKUNMAZ,
 * üstünde sıkıştırır ve `threshold + knee`i asla aşmaz. Sert kırpma tek
 * örnekte süreksizlik üretir ve bütün harmoniklere yayılan cızırtı bırakır.
 */
export function softLimit(value: number, threshold = 0.7, knee = 0.28): number {
  const magnitude = Math.abs(value);
  if (magnitude <= threshold) return value;
  const over = magnitude - threshold;
  return Math.sign(value) * (threshold + over / (1 + over / knee));
}

function scaleAll(channels: readonly Float32Array[], scale: number): void {
  if (scale === 1) return;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i++) channel[i] *= scale;
  }
}

function dcBlock(channels: readonly Float32Array[], sampleRate: number, cutoffHz: number): void {
  const pole = Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  for (const channel of channels) {
    let previousIn = 0;
    let previousOut = 0;
    for (let i = 0; i < channel.length; i++) {
      const x = channel[i];
      previousOut = x - previousIn + pole * previousOut;
      previousIn = x;
      channel[i] = previousOut;
    }
  }
}

function levelGain(level: MasterLevel, channels: readonly Float32Array[]): number {
  switch (level.mode) {
    case 'none':
      return checkNumber(level.gain ?? 1, 'level.gain', { min: 0 });
    case 'peak': {
      const target = checkNumber(level.target, 'level.target', { min: 0 });
      const peak = measurePeak(channels);
      return peak > 0 ? target / peak : 1;
    }
    case 'rms': {
      const target = checkNumber(level.target, 'level.target');
      const maxGain = checkNumber(level.maxGain ?? 6, 'level.maxGain', { above: 0 });
      // Sıfır ya da negatif hedef "eşitleme YAPMA" demektir, "sustur" değil.
      const rms = measureRms(channels);
      return target > 0 && rms > 0 ? Math.min(maxGain, target / rms) : 1;
    }
  }
}

/** Kanalları YERİNDE sonlandırır; `sampleRate` yalnız DC ve sönüm süreleri içindir. */
export function masterChannels(
  channels: readonly Float32Array[],
  sampleRate: number,
  options: MasterOptions,
): void {
  if (channels.length === 0) return;
  if (options.dcBlockHz !== undefined) {
    dcBlock(channels, sampleRate, checkNumber(options.dcBlockHz, 'dcBlockHz', { above: 0 }));
  }

  scaleAll(channels, levelGain(options.level, channels));

  if (options.limiter) {
    const threshold = checkNumber(options.limiter.threshold, 'limiter.threshold', { above: 0 });
    const knee = checkNumber(options.limiter.knee, 'limiter.knee', { above: 0 });
    for (const channel of channels) {
      for (let i = 0; i < channel.length; i++) channel[i] = softLimit(channel[i], threshold, knee);
    }
  }

  if (options.ceiling !== undefined) {
    const ceiling = checkNumber(options.ceiling, 'ceiling', { above: 0 });
    const peak = measurePeak(channels);
    if (peak > ceiling) scaleAll(channels, ceiling / peak);
  }

  const length = channels[0].length;
  const limit = Math.floor(length * (options.maxFadeFraction ?? 1));
  const fadeIn = Math.min(limit, Math.floor((options.fadeInSeconds ?? 0) * sampleRate));
  for (const channel of channels) {
    for (let i = 0; i < fadeIn; i++) channel[i] *= i / fadeIn;
  }
  const fadeOut = Math.min(limit, Math.floor((options.fadeOutSeconds ?? 0) * sampleRate));
  if (fadeOut > 1) {
    const cosine = options.fadeOutCurve === 'cosine';
    const start = length - fadeOut;
    for (const channel of channels) {
      for (let i = 0; i < fadeOut; i++) {
        channel[start + i] *= cosine
          ? 0.5 + 0.5 * Math.cos((Math.PI * i) / fadeOut)
          : (fadeOut - 1 - i) / fadeOut;
      }
    }
  }
}
