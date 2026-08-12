/**
 * Endüstriyel ses paleti — Mindustry karakteri.
 *
 * Tasarım yönü (eski `menu-music-instruments.ts`'ten bilinçli kopuş):
 *
 * - **Sinematik değil, mekanik.** Yaylı/brass/bell katmanları kaldırıldı;
 *   yerine makine uğultusu, metal darbe, basınç boşalması, röle tıkırtısı
 *   geldi. Eski palet "film fragmanı" karakteri veriyordu, hedef ise soğuk
 *   endüstriyel atmosfer.
 * - **Üçlü yerine boş beşli.** Majör/minör üçlü tonal-duygusal bir renk
 *   katıyor; endüstriyel doku için beşli ve süspansiyon kullanılır.
 * - **Boğuk ve geniş.** Alçak geçiren kesimler kasıtlı olarak düşük — sesin
 *   "duvarın arkasından" geldiği hissi. Üst tını shimmer katmanlarıyla değil
 *   gürültü yatağıyla dolduruluyor.
 * - **Her voice `normalize: false`.** Bu paletin en önemli kuralı: voice bazında
 *   tepe normalizasyonu katmanlar arası doğal dinamiği yok ediyordu. Seviye
 *   dengesi `gain` ile kurulur, normalize yalnızca master zincirde bir kez
 *   uygulanır (bkz. `audio-mix.ts`).
 * - **Perküsyon atağı asla 1 ms altında değil.** Ölçümle görüldü: üst üste
 *   binen ultra kısa ataklar toplanıp yapay sertlik üretiyor. Mekanik darbeler
 *   zaten doğal olarak biraz yumuşak başlar.
 */

import { synth } from '../src/audio/synth/engine';
import { pluck } from '../src/audio/synth/physical';
import type { SynthesisResult, EnvelopeParams } from '../src/audio/synth/types';
import { SAMPLE_RATE } from './audio-mix';

/** Zarf kısayolu. */
function env(
  attack: number,
  decay: number,
  sustain: number,
  release: number,
  sustainLevel: number,
  curve: 'linear' | 'exponential' | 'cosine' = 'cosine',
): EnvelopeParams {
  return { attack, hold: 0, decay, sustain, release, sustainLevel, curve };
}

/** Uzun süreli yatak katmanları için zarf — girişi/çıkışı yavaş. */
function bedEnvelope(duration: number, attack = 1.5, release = 2.0): EnvelopeParams {
  const sustain = Math.max(0.1, duration - attack - release);
  return env(attack, 0, sustain, release, 1.0, 'cosine');
}

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

// ─── Mekanik perküsyon ──────────────────────────────────────────────

/**
 * Metal darbe — metal üstüne metal. Endüstriyel perküsyonun ana rengi.
 *
 * İnharmonik FM oranı (2.76) kasıtlı: tam sayı oran müzikal bir zil verir,
 * ondalık oran çan/metal plaka gibi belirsiz perdeli bir tını üretir.
 */
export function metalClank(freq: number, gain = 0.4, pan = 0, seed = 10): SynthesisResult {
  const duration = 0.55;
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'sine',
    frequency: freq,
    fm: {
      modulatorWave: 'sine',
      ratio: 2.76,
      index: 5.5,
      modulatorEnvelope: env(0.002, 0.09, 0, 0.14, 0.06, 'exponential'),
    },
    // Atak 2.5 ms: mekanik darbe doğal olarak anlık değil, ve üst üste binen
    // vuruşlarda toplam transient sertliğini sınırlar.
    envelope: env(0.0025, 0.11, 0, 0.36, 0.1, 'exponential'),
    lowpass: { cutoff: freq * 4.5, resonance: 0.35, poles: 2, type: 'bandpass' },
    highpass: { cutoff: 180, resonance: 0, poles: 2, type: 'highpass' },
    reverb: { amount: 0.3, decay: 1.6, roomSize: 0.7, damp: 0.55 },
    pan,
    stereoWidth: { width: 1.2 },
    gain,
  });
}

/**
 * Basınç boşalması — pnömatik valf / buhar.
 * Gürültü tabanlı, perdesiz; ritmik gride nefes katar.
 */
export function pressureHiss(gain = 0.22, pan = 0, seed = 11, brightness = 3200): SynthesisResult {
  const duration = 0.4;
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'noise',
    frequency: brightness,
    envelope: env(0.004, 0.07, 0, 0.28, 0.12, 'exponential'),
    lowpass: { cutoff: brightness * 1.8, resonance: 0.1, poles: 2, type: 'lowpass' },
    highpass: { cutoff: brightness * 0.5, resonance: 0.15, poles: 2, type: 'highpass' },
    reverb: { amount: 0.24, decay: 1.4, roomSize: 0.65, damp: 0.5 },
    pan,
    stereoWidth: { width: 1.35 },
    gain,
  });
}

/**
 * Röle tıkırtısı — çok kısa mekanik anahtar sesi.
 * Ritmik dokuda hi-hat'in yerini tutar ama tiz değil, kuru ve orta bantta.
 */
export function machineTick(freq = 1400, gain = 0.18, pan = 0, seed = 12): SynthesisResult {
  const duration = 0.09;
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'noise',
    frequency: freq,
    envelope: env(0.0015, 0.014, 0, 0.05, 0.06, 'exponential'),
    lowpass: { cutoff: freq * 1.6, resonance: 0.4, poles: 2, type: 'bandpass' },
    pan,
    gain,
  });
}

/**
 * Yapısal darbe — ağır kütlenin oturması. Kick'in endüstriyel karşılığı.
 * Perde düşüşü ile ağırlık hissi; tiz içerik yok.
 */
export function deepImpact(freq = 58, gain = 0.45, pan = 0, seed = 13): SynthesisResult {
  const duration = 0.75;
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'sine',
    frequency: freq,
    slide: -freq * 0.55,
    slideCurve: 'exponential',
    envelope: env(0.002, 0.2, 0, 0.42, 0.08, 'exponential'),
    lowpass: { cutoff: 320, resonance: 0.14, poles: 2, type: 'lowpass' },
    pan,
    gain,
  });
}

/**
 * Konveyör takırtısı — rezonanslı dar bantta gürültü.
 * Kısa aralıklarla tekrarlanınca çalışan bir bant hissi verir.
 */
export function conveyorRattle(freq = 320, gain = 0.16, pan = 0, seed = 14): SynthesisResult {
  const duration = 0.2;
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'noise',
    frequency: freq,
    envelope: env(0.002, 0.035, 0, 0.12, 0.1, 'exponential'),
    lowpass: { cutoff: freq, resonance: 0.62, poles: 2, type: 'bandpass' },
    reverb: { amount: 0.18, decay: 0.9, roomSize: 0.5, damp: 0.6 },
    pan,
    gain,
  });
}

// ─── Sinyal / seyrek melodik ────────────────────────────────────────

/**
 * Sinyal tonu — uzaktaki bir işaret/alarm. Melodi taşıyıcısı.
 *
 * Tek osilatör, ağır filtre, hafif perde kayması. Kasıtlı olarak sade:
 * Mindustry'de melodi 2-4 notalık bir motiften ibarettir, virtüözite yok.
 */
export function signalTone(
  freq: number,
  duration: number,
  gain = 0.2,
  pan = 0,
  seed = 20,
): SynthesisResult {
  const release = 0.9;
  const attack = 0.18;
  const sustain = Math.max(0.08, duration - attack - release * 0.4);
  return synth(duration + release, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'triangle',
    frequency: freq,
    detune: 6,
    envelope: env(attack, 0, sustain, release, 0.85, 'cosine'),
    lowpass: { cutoff: 1600, resonance: 0.1, poles: 2, type: 'lowpass' },
    // Çok hafif vibrato: elektronik bir osilatörün ısı kaymasını taklit eder,
    // sesin "cansız dijital" durmasını engeller.
    vibratoDepth: 1.6,
    vibratoRate: 0.22,
    reverb: { amount: 0.45, decay: 4.5, roomSize: 0.88, damp: 0.42 },
    pan,
    stereoWidth: { width: 1.2 },
    gain,
  });
}

/**
 * Soğuk ping — seyrek kullanılan inharmonik vurgu.
 * Sıcak zil değil; cam/seramik gibi kuru ve kısa kuyruklu.
 */
export function glassPing(freq: number, gain = 0.16, pan = 0, seed = 21): SynthesisResult {
  const duration = 1.4;
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'sine',
    frequency: freq,
    fm: {
      modulatorWave: 'sine',
      ratio: 3.37,
      index: 2.4,
      modulatorEnvelope: env(0.003, 0.25, 0, 0.5, 0.05, 'exponential'),
    },
    envelope: env(0.004, 0.3, 0, 1.0, 0.12, 'exponential'),
    lowpass: { cutoff: 4200, resonance: 0.06, poles: 2, type: 'lowpass' },
    reverb: { amount: 0.4, decay: 3.2, roomSize: 0.8, damp: 0.5 },
    pan,
    stereoWidth: { width: 1.3 },
    gain,
  });
}

/**
 * Gerilmiş kablo — sönümlü fiziksel tel.
 * `pluck` gövde rezonansı düşük tutulur: akustik gitar değil, çelik halat.
 */
export function cableTension(
  freq: number,
  duration: number,
  velocity = 1,
  pan = 0,
): SynthesisResult {
  return pluck({
    frequency: freq,
    duration,
    sampleRate: SAMPLE_RATE,
    // Yüksek sönüm: tel hızlı ölür, "çınlayan" akustik kuyruk bırakmaz.
    decay: 0.982,
    excitationMix: 0.5,
    excitationHarmonics: 3,
    stereoWidth: 0.35,
    gain: 0.35 * velocity,
    bodyResonance: freq * 1.5,
    bodyAmount: 0.12,
  });
}

// ─── SFX odaklı sesler ──────────────────────────────────────────────
//
// Bu grup müzikle AYNI sözlükten kurulur; ayrı bir sentez felsefesi yok.
// Eskiden SFX çıplak sawtooth/triangle/sine + kısa ADSR ile üretiliyordu ve
// klasik konsol (chiptune) karakteri veriyordu — müzik ise additive/FM ile
// organik duruyordu. İki taraf aynı oyunda tutarsız bir kimlik oluşturuyordu.
// Aynı FM/bandpass/gürültü yaklaşımı burada da kullanılır.

/**
 * Elektrik boşalması — silah atışı. Lazer değil: bobin deşarjı.
 *
 * İnharmonik FM + hızlı düşen bandpass: kıvılcım karakteri. Perde düşüşü
 * enerjinin boşaldığını anlatır.
 */
export function electricDischarge(freq: number, gain = 0.5, pan = 0, seed = 30): SynthesisResult {
  const duration = 0.26;
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'sawtooth',
    frequency: freq,
    slide: -freq * 0.45,
    slideCurve: 'exponential',
    fm: {
      modulatorWave: 'square',
      ratio: 1.87,
      index: 2.2,
      modulatorEnvelope: env(0.001, 0.05, 0, 0.08, 0.04, 'exponential'),
    },
    envelope: env(0.0022, 0.055, 0, 0.16, 0.12, 'exponential'),
    lowpass: {
      cutoff: freq * 3.2,
      resonance: 0.3,
      poles: 2,
      type: 'lowpass',
      envelope: env(0.002, 0.06, 0, 0.14, 0.12, 'exponential'),
      envAmount: 0.65,
    },
    highpass: { cutoff: 160, resonance: 0, poles: 2, type: 'highpass' },
    pan,
    gain,
  });
}

/**
 * Servo zorlanması — motor/aktüatör gerilimi. Hasar ve hareket seslerinde
 * mekanik "canlılık" katar.
 */
export function servoStrain(
  freq: number,
  duration: number,
  gain = 0.3,
  pan = 0,
  seed = 31,
): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'sawtooth',
    frequency: freq,
    slide: freq * 0.35,
    slideCurve: 'cosine',
    detune: 12,
    envelope: env(0.008, 0.06, Math.max(0.02, duration * 0.3), 0.12, 0.55, 'cosine'),
    lowpass: { cutoff: 1100, resonance: 0.42, poles: 2, type: 'bandpass' },
    pan,
    gain,
  });
}

/**
 * Yapısal çöküş — ölüm / düşman yıkımı.
 *
 * Alçalan perde + genişleyen gürültü: kütlenin dağılması. Uzun kuyruk
 * kasıtlı, olayın ağırlığını taşıyor.
 */
export function structuralCollapse(
  freq: number,
  duration: number,
  gain = 0.5,
  pan = 0,
  seed = 32,
): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'brown',
    frequency: freq,
    slide: -freq * 0.6,
    slideCurve: 'exponential',
    envelope: env(0.006, duration * 0.35, 0, duration * 0.55, 0.25, 'exponential'),
    lowpass: {
      cutoff: 900,
      resonance: 0.18,
      poles: 2,
      type: 'lowpass',
      envelope: env(0.006, duration * 0.4, 0, duration * 0.5, 0.12, 'exponential'),
      envAmount: 0.6,
    },
    highpass: { cutoff: 70, resonance: 0, poles: 2, type: 'highpass' },
    reverb: { amount: 0.3, decay: 1.8, roomSize: 0.72, damp: 0.5 },
    pan,
    stereoWidth: { width: 1.25 },
    gain,
  });
}

/**
 * Röle kliği — UI onay/gezinme. `machineTick`'ten daha kuru ve daha kısa.
 * Elektromekanik anahtar: tek, net, tiz olmayan bir tık.
 */
export function relayClick(freq = 1750, gain = 0.4, pan = 0, seed = 33): SynthesisResult {
  const duration = 0.075;
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'noise',
    frequency: freq,
    envelope: env(0.0012, 0.009, 0, 0.038, 0.05, 'exponential'),
    lowpass: { cutoff: freq, resonance: 0.55, poles: 2, type: 'bandpass' },
    pan,
    gain,
  });
}

/**
 * Sekme — mermi metalden sıçrıyor. Kısa, inharmonik, perdeli.
 */
export function ricochet(freq: number, gain = 0.4, pan = 0, seed = 34): SynthesisResult {
  const duration = 0.3;
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'sine',
    frequency: freq,
    slide: freq * 0.5,
    slideCurve: 'exponential',
    fm: {
      modulatorWave: 'sine',
      ratio: 4.13,
      index: 3.2,
      modulatorEnvelope: env(0.001, 0.04, 0, 0.1, 0.05, 'exponential'),
    },
    envelope: env(0.0018, 0.05, 0, 0.2, 0.1, 'exponential'),
    lowpass: { cutoff: freq * 3, resonance: 0.3, poles: 2, type: 'bandpass' },
    reverb: { amount: 0.22, decay: 1.0, roomSize: 0.55, damp: 0.55 },
    pan,
    gain,
  });
}

/**
 * Güç rampası — sistem açılışı/kapanışı. `direction` yönü belirler.
 * Duraklat/devam ve yeniden başlat seslerinin gövdesi.
 */
export function powerRamp(
  freq: number,
  duration: number,
  direction: 'up' | 'down',
  gain = 0.35,
  pan = 0,
  seed = 35,
): SynthesisResult {
  const slide = direction === 'up' ? freq * 0.8 : -freq * 0.45;
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'sawtooth',
    frequency: freq,
    slide,
    slideCurve: 'cosine',
    detune: 10,
    envelope:
      direction === 'up'
        ? env(0.02, 0.05, duration * 0.35, duration * 0.35, 0.6, 'cosine')
        : env(0.006, duration * 0.3, 0, duration * 0.5, 0.4, 'exponential'),
    lowpass: {
      cutoff: direction === 'up' ? 340 : 620,
      resonance: 0.25,
      poles: 2,
      type: 'lowpass',
      envelope: env(0.01, duration * 0.3, duration * 0.2, duration * 0.3, 0.35, 'cosine'),
      envAmount: direction === 'up' ? 0.7 : 0.5,
    },
    pan,
    gain,
  });
}

/**
 * Filtrelenmiş darbe dizisi elemanı — mekanik bas sekansı.
 * Pulse dalgası + filtre zarfı: kapanıp açılan bir valf gibi.
 */
export function filteredPulse(
  freq: number,
  duration: number,
  gain = 0.26,
  pan = 0,
  seed = 22,
): SynthesisResult {
  return synth(duration, {
    sampleRate: SAMPLE_RATE,
    normalize: false,
    seed,
    wave: 'pulse',
    pulseWidth: 0.32,
    frequency: freq,
    detune: 5,
    envelope: env(0.006, 0.1, Math.max(0.02, duration * 0.35), 0.16, 0.45, 'exponential'),
    lowpass: {
      cutoff: 420,
      resonance: 0.22,
      poles: 2,
      type: 'lowpass',
      envelope: env(0.004, 0.12, 0.05, 0.2, 0.2, 'exponential'),
      envAmount: 0.6,
    },
    reverb: { amount: 0.14, decay: 1.1, roomSize: 0.55, damp: 0.6 },
    pan,
    gain,
  });
}
