/**
 * Fiziksel model — ahşap üflemeli çalgı (hava sütunu).
 *
 * Nefes gürültüsü, her hava sütunu modu için ayrı rezonant bandpass
 * filtrelerden geçirilerek temel perde ve seçilmiş harmonikler
 * oluşturulur. "Closed" (kapalı) yazılış tek ucu kapalı boru gibi yalnızca
 * tek kat harmonikler üretir; "open" (açık) boru tüm harmoniklere izin verir.
 * Hafif türbülans gürültüsü karıştırılarak üfleme karakteri eklenir.
 */

import { DEFAULT_SEED } from '@volstudio/core/random';
import { clamp } from '@volstudio/core/math/interpolation';
import type { SynthesisResult } from '../../types';
import { BiquadFilter } from '../../synthesis/filter';
import { WhiteNoise, PinkNoise } from '../../synthesis/noise';
import { Envelope } from '../../synthesis/envelope';

export interface AirColumnParams {
  /** Temel frekans (Hz). */
  frequency: number;
  /** Süre (saniye). */
  duration: number;
  /** Örnek oranı. Varsayılan 44100. */
  sampleRate?: number;
  /** Attack süresi (saniye). Varsayılan 0.12. */
  attack?: number;
  /** Sustain seviyesinde kalma süresi (saniye). Varsayılan süre - attack - release. */
  sustain?: number;
  /** Release süresi (saniye). Varsayılan 0.25. */
  release?: number;
  /** Sustain seviyesi (0-1). Varsayılan 0.9. */
  sustainLevel?: number;
  /** Rezonatör kesim frekansı (Hz). Daha yüksek değer daha fazla üst harmonik açar. */
  resonatorCutoff?: number;
  /** Rezonans (0-1). Dar band ve uzun sönüm için yüksek değer. */
  resonance?: number;
  /** Türbülans gürültü karışımı (0-1). Varsayılan 0.06. */
  turbulence?: number;
  /** Hava sütunu yazılışı — 'open' tüm harmonikler, 'closed' tek kat harmonikler. */
  register?: 'open' | 'closed';
  /** Uyarım gürültü rengi. Varsayılan 'pink'. */
  noiseColor?: 'white' | 'pink';
  /** Genel kazanç (0-1). Varsayılan 0.5. */
  gain?: number;
  /** Deterministik gürültü için seed. */
  seed?: number;
}

const DEFAULT_SAMPLE_RATE = 44100;

function createNoise(color: 'white' | 'pink', seed: number) {
  return color === 'pink' ? new PinkNoise(seed) : new WhiteNoise(seed);
}

/** Tek bir modun (bandpass rezonatör) beklenen RMS seviyesini normalleştirmek
 *  için kazanç. Daralan band genişliğini telafi etmek için q karekökü ile
 *  çarpılır; spektrum şekli harmonik sırasına göre yumuşatılır.
 *  Sabit 6, deterministik modelin duyulabilir seviyeye çıkması içindir. */
function modeBaseGain(q: number, partialIndex: number, rolloff: number): number {
  return (6 * (0.5 + Math.sqrt(q))) / (Math.pow(partialIndex, rolloff) + 0.5);
}

export function airColumn(params: AirColumnParams): SynthesisResult {
  const sampleRate = clamp(params.sampleRate ?? DEFAULT_SAMPLE_RATE, 1000, 384000);
  const frequency = clamp(params.frequency, 20, sampleRate / 2);
  const duration = clamp(params.duration, 0.05, 600);
  const totalSamples = Math.floor(sampleRate * duration);

  const attack = clamp(params.attack ?? 0.12, 0, duration);
  const release = clamp(params.release ?? 0.25, 0, duration);
  const maxSustain = Math.max(0, duration - attack - release);
  const sustain = clamp(params.sustain ?? maxSustain, 0, maxSustain);
  const sustainLevel = clamp(params.sustainLevel ?? 0.9, 0, 1);
  const gain = clamp(params.gain ?? 0.5, 0, 1);
  const resonance = clamp(params.resonance ?? 0.55, 0, 1);
  const turbulence = clamp(params.turbulence ?? 0.06, 0, 1);
  const register = params.register ?? 'open';
  const noiseColor = params.noiseColor ?? 'pink';
  const seed = Number.isFinite(params.seed) ? (params.seed as number) : DEFAULT_SEED;

  const nyquist = sampleRate * 0.49;
  const nyquistSafe = nyquist - 1;
  const resonatorCutoff = clamp(
    params.resonatorCutoff ?? Math.min(10000, Math.max(1500, frequency * 6)),
    frequency,
    nyquistSafe,
  );

  // Nefes zarfı — yavaş attack, sustain, yumuşak release.
  const envelope = new Envelope(
    {
      attack,
      sustain,
      release,
      sustainLevel,
      curve: 'cosine',
    },
    duration,
  );

  const q = 3 + resonance * 17;
  const rolloff = register === 'closed' ? 1.2 : 0.9;

  // Hava sütunu modlarını kur: açık boru için tüm harmonikler,
  // kapalı boru için tek kat harmonikler.
  const modes: { filter: BiquadFilter; gain: number; freq: number }[] = [];
  let n = 1;
  const step = register === 'closed' ? 2 : 1;
  const maxModes = 48;
  while (n * frequency <= resonatorCutoff && modes.length < maxModes) {
    const modeFreq = n * frequency;
    if (modeFreq > nyquistSafe) break;
    // Filtreyi mode frekansında kur; process() aynı frekansı görünce
    // katsayıları bir kez hesaplar ve önbelleğe alır.
    const filter = new BiquadFilter(sampleRate, 'bandpass', q);
    const modeGain = modeBaseGain(q, (n + step - 1) / step, rolloff);
    modes.push({ filter, gain: modeGain, freq: modeFreq });
    n += step;
  }

  // En azından temel moda sahip olmalıyız.
  if (modes.length === 0) {
    const filter = new BiquadFilter(sampleRate, 'bandpass', q);
    modes.push({ filter, gain: modeBaseGain(q, 1, rolloff), freq: frequency });
  }

  // Uyarım ve türbülans için bağımsız gürültü kaynakları.
  const excitationNoise = createNoise(noiseColor, seed);
  const turbulenceNoise = createNoise(noiseColor, seed + 1);

  // Türbülans yalnızca alçak frekanslarda kalsın, böylece rezonant modlar
  // tarafından maskelenmez.
  const turbCutoff = Math.min(resonatorCutoff, Math.max(frequency * 3, 1200));
  const turbFilter = new BiquadFilter(sampleRate, 'lowpass', 0.707);

  const raw = new Float32Array(totalSamples);
  let rawPeak = 0;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const env = envelope.value(t);
    const excitation = excitationNoise.next() * env;

    let sample = 0;
    for (const mode of modes) {
      sample += mode.filter.process(excitation, mode.freq) * mode.gain;
    }

    const turb = turbulenceNoise.next() * env * turbulence;
    sample += turbFilter.process(turb, turbCutoff) * 0.2;

    raw[i] = sample;
    rawPeak = Math.max(rawPeak, Math.abs(sample));
  }

  // Gain uygula; 0.95'i aşan tepe varsa aşağı çek.
  // Bu normalize değil, sadece güvenlik sınırı.
  const peakAfterGain = rawPeak * gain;
  const scale = rawPeak > 0 ? gain * Math.min(1, 0.95 / Math.max(peakAfterGain, 1e-12)) : 0;

  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  if (scale > 0) {
    for (let i = 0; i < totalSamples; i++) {
      const s = raw[i] * scale;
      left[i] = s;
      right[i] = s;
    }
  }

  return {
    channels: [left, right],
    sampleRate,
    duration,
  };
}
