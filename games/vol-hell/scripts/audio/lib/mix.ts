/**
 * Stereo mix temeli — VOL-HELL ses üretim hattının çekirdeği.
 *
 * Tasarım kararları (ölçümle doğrulanmış üç kural):
 *
 * 1. **Voice'lar normalize edilmez.** `renderVoice` her çağrıda
 *    `normalize: false` zorlar; katmanlar arası dinamik farkı korunur.
 *    Normalize yalnızca `masterize` içinde, final mix'e BİR KEZ uygulanır.
 *
 * 2. **Loop parçalarında kuyruk sarılır (wrap).** Loop sınırını aşan reverb /
 *    release kuyruğu kesilirse tık üretir, uzun fade ise her turda duyulur
 *    boşluk bırakır. `addVoice`'un `wrap` seçeneği taşan örnekleri parçanın
 *    başına ekler — loop dikişsiz kapanır.
 *
 * 3. **Üst üste binen transientler insanileştirilir.** Aynı örneğe düşen
 *    vuruşların tepe farkları toplanıp yapay sertlik (click) üretir;
 *    `humanize` her vuruşa deterministik birkaç ms kaydırma verir.
 */

import { synth } from '@volstudio/core/audio/synth';
import type { SynthParams, SynthesisResult } from '@volstudio/core/audio/synth';
import { writeOgg } from '@volstudio/core/audio/synth/writer';

export const SAMPLE_RATE = 44100;

/** Stereo mix tamponu. */
export interface StereoMix {
  left: Float32Array;
  right: Float32Array;
  /** Toplam süre (saniye). */
  duration: number;
}

/** Boş stereo mix oluşturur. */
export function createMix(duration: number): StereoMix {
  const length = Math.ceil(duration * SAMPLE_RATE);
  return { left: new Float32Array(length), right: new Float32Array(length), duration };
}

/**
 * Tek voice üretir. `normalize: false` ZORLANIR — mix dengesi voice `gain`
 * parametreleriyle kurulur, tepe ölçekleme yalnızca master'da yapılır.
 */
export function renderVoice(params: SynthParams): SynthesisResult {
  return synth(params.duration, { ...params, sampleRate: SAMPLE_RATE, normalize: false });
}

/** `addVoice` yerleştirme seçenekleri. */
export interface AddVoiceOptions {
  /** Ek kazanç çarpanı (voice'un kendi gain'inin üstüne). Varsayılan 1. */
  gain?: number;
  /** Mono voice için eşit güçlü pan (-1 sol, 1 sağ). Varsayılan 0. */
  pan?: number;
  /**
   * Mix sonunu aşan kuyruk başa sarılsın mı? Loop'lanan parçalarda true
   * verilmeli; tek seferlik (stinger) parçalarda taşan kısım kesilir ve
   * kesim noktasına kısa kapanış rampası uygulanır.
   */
  wrap?: boolean;
}

const CUT_GUARD_SAMPLES = Math.floor(0.004 * SAMPLE_RATE);

/**
 * Üretilmiş voice'u mix'e `atSec` anından itibaren toplar.
 * Stereo voice kanalları korunur; mono voice eşit güçlü pan ile yayılır.
 */
export function addVoice(
  mix: StereoMix,
  voice: SynthesisResult,
  atSec: number,
  options: AddVoiceOptions = {},
): void {
  const { gain = 1, pan = 0, wrap = false } = options;
  const src = voice.channels;
  const stereo = src.length > 1;
  const angle = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  const gainL = gain * (stereo ? 1 : Math.cos(angle));
  const gainR = gain * (stereo ? 1 : Math.sin(angle));
  const srcL = src[0] ?? new Float32Array(0);
  const srcR = stereo ? src[1] ?? srcL : srcL;

  const mixLength = mix.left.length;
  const start = Math.round(atSec * SAMPLE_RATE);
  const total = srcL.length;

  for (let i = 0; i < total; i++) {
    let target = start + i;
    let cutRamp = 1;
    if (target >= mixLength) {
      if (!wrap) break;
      target %= mixLength;
    }
    if (!wrap && target >= mixLength - CUT_GUARD_SAMPLES) {
      // Kesim rampası: dosya sonunda kesilen kuyruk yumuşakça sıfıra iner.
      cutRamp = Math.max(0, (mixLength - target) / CUT_GUARD_SAMPLES);
    }
    if (target < 0) continue;
    mix.left[target] = (mix.left[target] ?? 0) + (srcL[i] ?? 0) * gainL * cutRamp;
    mix.right[target] = (mix.right[target] ?? 0) + (srcR[i] ?? 0) * gainR * cutRamp;
  }
}

/**
 * Deterministik vuruş kaydırması (saniye döner). Aynı `seed` + `index`
 * her üretimde aynı ofseti verir; üretim tekrarlanabilir kalır.
 * Kendi karma fonksiyonunu taşır: core kök index'i (UI/CSS dahil) bir Node
 * script'ine import edilemez, ses değerleri için ayrı PRNG'ye gerek yok.
 */
export function humanize(seed: number, index: number, spreadMs = 4): number {
  let h = (seed * 7919 + index * 104729 + 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return ((h / 0xffffffff) * spreadMs) / 1000;
}

/** DC ofsetini temizler (tek kutuplu ~20 Hz highpass). */
function dcBlock(mix: StereoMix): void {
  const r = 1 - (2 * Math.PI * 20) / SAMPLE_RATE;
  for (const ch of [mix.left, mix.right]) {
    let prevIn = 0;
    let prevOut = 0;
    for (let i = 0; i < ch.length; i++) {
      const x = ch[i] ?? 0;
      const y = x - prevIn + r * prevOut;
      prevIn = x;
      prevOut = y;
      ch[i] = y;
    }
  }
}

function measurePeak(mix: StereoMix): number {
  let peak = 0;
  for (const ch of [mix.left, mix.right]) {
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i] ?? 0);
      if (a > peak) peak = a;
    }
  }
  return peak;
}

function measureRms(mix: StereoMix): number {
  let sum = 0;
  const n = mix.left.length;
  for (let i = 0; i < n; i++) {
    const l = mix.left[i] ?? 0;
    const r = mix.right[i] ?? 0;
    sum += (l * l + r * r) / 2;
  }
  return Math.sqrt(sum / Math.max(1, n));
}

/** Master zinciri seçenekleri. */
export interface MasterOptions {
  /** Tepe hedefi (0-1). Varsayılan 0.9 — encode için headroom bırakır. */
  peakTarget?: number;
  /**
   * RMS hedefi (dBFS, negatif). Verilirse parça bu ortalama seviyeye
   * ölçeklenir; tepe `peakTarget`'ı aşacaksa tepe sınırı kazanır.
   * Menü müziği ~-17, savaş ~-15, ambiyans ~-21 dB civarı hedeflenir.
   */
  rmsTargetDb?: number;
}

/**
 * Master zinciri: DC temizliği + tek seferlik seviye ölçekleme.
 * Kazanç, RMS hedefi ile tepe sınırından KÜÇÜK olanıdır — asla clip etmez.
 */
export function masterize(mix: StereoMix, options: MasterOptions = {}): void {
  const { peakTarget = 0.9, rmsTargetDb } = options;
  dcBlock(mix);

  const peak = measurePeak(mix);
  if (peak <= 0) return;

  let scale = peakTarget / peak;
  if (rmsTargetDb !== undefined) {
    const rms = measureRms(mix);
    if (rms > 0) {
      const rmsTarget = Math.pow(10, rmsTargetDb / 20);
      scale = Math.min(scale, rmsTarget / rms);
    }
  }

  for (const ch of [mix.left, mix.right]) {
    for (let i = 0; i < ch.length; i++) {
      ch[i] = (ch[i] ?? 0) * scale;
    }
  }
}

/**
 * Loop / dosya sınırında milisaniyelik koruma rampası. Uzun fade DEĞİL —
 * yalnızca sınırdaki sıfır olmayan örneklerin tık üretmesini önler.
 */
export function edgeGuard(mix: StereoMix, ms = 4): void {
  const n = Math.min(Math.floor((ms / 1000) * SAMPLE_RATE), mix.left.length >> 1);
  for (const ch of [mix.left, mix.right]) {
    for (let i = 0; i < n; i++) {
      const ramp = 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
      ch[i] = (ch[i] ?? 0) * ramp;
      const j = ch.length - 1 - i;
      ch[j] = (ch[j] ?? 0) * ramp;
    }
  }
}

/** Mix'i OGG olarak yazar (FFmpeg gerektirir). */
export function writeMixOgg(filePath: string, mix: StereoMix, quality = 5): void {
  const result: SynthesisResult = {
    channels: [mix.left, mix.right],
    sampleRate: SAMPLE_RATE,
    duration: mix.duration,
  };
  writeOgg(filePath, result, { quality });
}
