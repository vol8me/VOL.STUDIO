import { synth } from '../../src/audio/synth/engine';
import { pluck } from '../../src/audio/synth/physical';
import type { SynthesisResult } from '../../src/audio/synth/types';
import { SAMPLE_RATE } from '../audio-mix';
import { env, bedEnvelope } from './shared';

// ─── Atmosfer / yatak katmanları ────────────────────────────────────

/**
 * Reaktör uğultusu — parçanın her yerinde duran makine sesi.
 * Detune'lu sawtooth çifti, ağır alçak geçiren, çok yavaş LFO hareketi.
 */
export function reactorHum(
  freq: number,
  duration: number,
  gain = 0.22,
  pan = 0,
  seed = 1,
): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'sawtooth',
    frequency: freq,
    // Belirgin detune: iki osilatör arasında yavaş bir atım (beating) oluşur,
    // makinenin "canlı" ama düzensiz çalıştığı hissini verir.
    detune: 14,
    envelope: bedEnvelope(duration),
    lowpass: { cutoff: 170, resonance: 0.06, poles: 2, type: 'lowpass' },
    lfos: [
      { target: 'filter', rate: 0.037, depth: 45, wave: 'sine' },
      { target: 'amplitude', rate: 0.023, depth: 0.14, wave: 'sine' },
    ],
    reverb: { amount: 0.22, decay: 3.5, roomSize: 0.75, damp: 0.6 },
    pan,
    stereoWidth: { width: 1.15 },
    gain,
  });
}

/**
 * Derin sub atımı — uzaktaki reaktörün nabzı.
 * Neredeyse duyulmaz, göğüste hissedilir. Tek başına melodik değil.
 */
export function subThrob(
  freq: number,
  duration: number,
  gain = 0.3,
  pan = 0,
  seed = 2,
): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'sine',
    frequency: freq,
    envelope: bedEnvelope(duration, 1.0, 1.5),
    lowpass: { cutoff: 95, resonance: 0.05, poles: 2, type: 'lowpass' },
    lfos: [{ target: 'amplitude', rate: 0.055, depth: 0.22, wave: 'sine' }],
    pan,
    gain,
  });
}

/**
 * Gürültü yatağı — oda tonu / uzak makine gürültüsü.
 * Üst frekans alanını shimmer yerine bununla doldurur; soğuk ve nötr kalır.
 *
 * Gürültü rengi bant hedefine göre seçilmeli: `brown` (-6 dB/oktav) yalnızca
 * alt bant için uygundur, üst bantta neredeyse hiç enerji bırakmaz. Orta
 * bant için `pink`, hava bandı için `white` kullanılır.
 *
 * `seed` her çağrıda farklı verilmeli, aksi halde birebir aynı gürültü üst
 * üste binip faz sorunları yapar.
 */
export function staticBed(
  duration: number,
  gain = 0.05,
  pan = 0,
  seed = 3,
  centerHz = 2200,
  color: 'brown' | 'pink' | 'noise' = 'pink',
): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: color,
    frequency: centerHz,
    envelope: bedEnvelope(duration, 2.5, 2.5),
    lowpass: { cutoff: centerHz * 2.0, resonance: 0.04, poles: 2, type: 'lowpass' },
    highpass: { cutoff: centerHz * 0.5, resonance: 0, poles: 2, type: 'highpass' },
    lfos: [{ target: 'amplitude', rate: 0.041, depth: 0.35, wave: 'sine' }],
    pan,
    stereoWidth: { width: 1.4 },
    gain,
  });
}

/**
 * Soğuk pad — akor dokusu. Sıcak chorus ve shimmer YOK.
 *
 * Harmonik seçimi bilinçli: oktav ve beşli ağırlıklı, tek sayılı üst
 * harmonikler zayıf. Üçlü içermeyen bu seri "metalik/nötr" bir renk verir;
 * eski `warmPad`'in sıcak organ karakterinin tersi.
 */
export function coldPad(
  freq: number,
  duration: number,
  gain = 0.14,
  pan = 0,
  seed = 4,
): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    harmonics: [
      { ratio: 1, gain: 1.0, phase: 0 },
      { ratio: 2, gain: 0.4, phase: 0.11 },
      { ratio: 3, gain: 0.14, phase: 0.27 },
      { ratio: 4, gain: 0.18, phase: 0.05 },
      { ratio: 6, gain: 0.08, phase: 0.33 },
      { ratio: 8, gain: 0.05, phase: 0.19 },
    ],
    frequency: freq,
    detune: 9,
    envelope: bedEnvelope(duration, 1.8, 2.2),
    lowpass: { cutoff: 900, resonance: 0.05, poles: 2, type: 'lowpass' },
    lfos: [
      { target: 'filter', rate: 0.048, depth: 180, wave: 'sine' },
      { target: 'amplitude', rate: 0.031, depth: 0.1, wave: 'sine' },
    ],
    reverb: { amount: 0.42, decay: 5.5, roomSize: 0.9, damp: 0.45 },
    pan,
    stereoWidth: { width: 1.25 },
    gain,
  });
}

export interface AtmosphereOptions {
  /** Genel seviye çarpanı. Ambiyans parçalarında düşük tutulur. */
  level?: number;
  /** Üst bantların göreli seviyesi. 1 = ölçümle ayarlanmış denge. */
  brightness?: number;
  /** Seed tabanı — parçalar arasında farklı olmalı, aksi halde aynı gürültü. */
  seedBase?: number;
  /** Stereo yayılım genişliği. */
  spread?: number;
}

/**
 * Üç bantlı atmosfer yatağı — parçanın gürültü zemini.
 *
 * Neden tek yerde: bant seviyeleri ölçümle ayarlandı (bkz. `audio-qa.ts`) ve
 * altı parçada tekrar edilmesi hem kalabalık hem de spektral ayarı dağıtıyordu.
 * Parçalar `level` ve `brightness` ile farklılaşır, temel denge korunur.
 *
 * Bant hedefleri: 900 Hz pink (gövde dokusu), 3200 Hz pink (üst doku),
 * 9500 Hz white (hava). Gürültü rengi bant hedefine göre seçilir — brown üst
 * bantta ölçülebilir enerji bırakmıyordu.
 */
export function atmosphereBed(
  duration: number,
  options: AtmosphereOptions = {},
): SynthesisResult[] {
  const { level = 1, brightness = 1, seedBase = 300, spread = 0.42 } = options;
  return [
    staticBed(duration, 0.16 * level, -spread, seedBase, 900, 'pink'),
    staticBed(duration, 0.34 * level * brightness, spread, seedBase + 1, 3200, 'pink'),
    staticBed(duration, 0.15 * level * brightness, spread * 0.35, seedBase + 2, 9500, 'noise'),
  ];
}

/**
 * Hava akımı — yapı içinden geçen rüzgâr / havalandırma.
 * Filtre LFO'su geniş ve yavaş: nefes alan bir mekân hissi.
 */
export function airDraft(duration: number, gain = 0.06, pan = 0, seed = 5): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'pink',
    frequency: 700,
    envelope: bedEnvelope(duration, 3.0, 3.0),
    lowpass: { cutoff: 900, resonance: 0.12, poles: 2, type: 'lowpass' },
    highpass: { cutoff: 220, resonance: 0, poles: 2, type: 'highpass' },
    lfos: [
      { target: 'filter', rate: 0.029, depth: 420, wave: 'sine' },
      { target: 'amplitude', rate: 0.019, depth: 0.45, wave: 'sine' },
    ],
    reverb: { amount: 0.35, decay: 4.0, roomSize: 0.85, damp: 0.5 },
    pan,
    stereoWidth: { width: 1.5 },
    gain,
  });
}
