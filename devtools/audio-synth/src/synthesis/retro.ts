import { crush } from '../effects/saturation';
import { getWaveSampleWithPhase } from './waveforms';

/**
 * Retro/arcade ses çekirdeği: darbe (duty), üçgen (düz ya da 4-bit
 * basamaklı), testere, LFSR gürültüsü, wavetable, hard sync ve bit/oran
 * indirgeme. Donanım öykünmesi DEĞİLDİR; karakterin kaynağı olan yapılar
 * (basamak, duty, kaydırmalı yazmaç, sert faz sıfırlaması) birebir, çıkış
 * ise ideal bant sınırlı bir DAC gibi davranır.
 *
 * Her süreksizlik (darbe kenarı, testere sarması, tablo basamağı, LFSR
 * saati, sync sıfırlaması) iki örneklik PolyBLEP ile düzeltilir: basamaklı
 * bir dalganın 44.1 kHz'te çıplak üretimi harmonik olmayan bir alias
 * üretir ve bu "8-bit" değil "bozuk" duyulur. Bilinçli alias yalnız
 * `bits`/`holdHz` aşamasından gelir ve çıkış oranında uygulanır.
 */
export const RETRO_WAVES = ['pulse', 'triangle', 'sawtooth', 'noise', 'wavetable'] as const;
export type RetroWave = (typeof RETRO_WAVES)[number];

export const NOISE_MODES = ['long', 'short'] as const;
export type NoiseMode = (typeof NOISE_MODES)[number];

/**
 * Kısa kipte 15-bit yazmaç (başlangıç 1) 93 adımlık bir dizi döndürür;
 * saat = perde × 93 seçilince bu dizinin temeli notanın perdesidir. Uzun
 * kip aynı saatle aynı parlaklıkta hışırtı verir, kip değiştirmek seviyeyi
 * kaydırmaz.
 */
export const NOISE_CLOCK_PER_HZ = 93;

function steps(values: readonly number[], bits: number): number[] {
  const top = Math.pow(2, bits) - 1;
  return values.map((v) => (2 * Math.round(((v + 1) / 2) * top)) / top - 1);
}

function harmonicTable(size: number, partials: readonly number[]): number[] {
  const raw = Array.from({ length: size }, (_, i) =>
    partials.reduce((sum, gain, n) => sum + gain * Math.sin((2 * Math.PI * (n + 1) * i) / size), 0),
  );
  const peak = Math.max(...raw.map(Math.abs));
  return raw.map((v) => v / peak);
}

/** Adlı tablolar: veri, kod değil. 4-bit olanlar 16 seviyede basamaklıdır. */
export const RETRO_TABLES: Readonly<Record<string, readonly number[]>> = {
  'triangle-4bit': steps(
    Array.from({ length: 32 }, (_, i) => (i < 16 ? 1 - i / 7.5 : -1 + (i - 16) / 7.5)),
    4,
  ),
  'ramp-4bit': steps(
    Array.from({ length: 32 }, (_, i) => -1 + (2 * i) / 31),
    4,
  ),
  'square-4bit': steps(
    Array.from({ length: 32 }, (_, i) => (i < 16 ? 1 : -1)),
    4,
  ),
  hollow: steps(harmonicTable(32, [1, 0, 0.45, 0, 0.25, 0, 0.12]), 4),
  organ: steps(harmonicTable(32, [1, 0.6, 0.35, 0.3, 0, 0.18, 0, 0.12]), 4),
  buzz: steps(harmonicTable(32, [1, 0.8, 0.7, 0.6, 0.5, 0.42, 0.36, 0.3, 0.26, 0.22]), 4),
  'soft-bell': harmonicTable(64, [1, 0, 0, 0.5, 0, 0, 0, 0.3, 0, 0, 0, 0, 0, 0, 0, 0.15]),
};

/**
 * Tek seçimle anlatılan dalga adları: kip ve tablo AYRI alan değil, dalganın
 * kendisidir. Agent "darbe mi, 4-bit üçgen mi, orgu tablosu mu" diye tek
 * soruya cevap verir; geçersiz birleşim (üçgene tablo) yazılamaz.
 */
export const RETRO_WAVEFORMS = [
  'pulse',
  'triangle',
  'triangle-4bit',
  'sawtooth',
  'noise-long',
  'noise-short',
  'table-ramp-4bit',
  'table-square-4bit',
  'table-hollow',
  'table-organ',
  'table-buzz',
  'table-soft-bell',
] as const;
export type RetroWaveform = (typeof RETRO_WAVEFORMS)[number];

/** Dalga adının osilatör alanları (diğer alanlar çağıranındır). */
export function waveformFields(
  name: RetroWaveform,
): Pick<RetroOscillatorV1, 'wave' | 'stepped' | 'noiseMode' | 'table'> {
  const base = {
    stepped: false,
    noiseMode: 'long' as NoiseMode,
    table: RETRO_TABLES['ramp-4bit'],
  };
  if (name === 'triangle-4bit') return { ...base, wave: 'triangle', stepped: true };
  if (name === 'noise-long' || name === 'noise-short') {
    return { ...base, wave: 'noise', noiseMode: name === 'noise-short' ? 'short' : 'long' };
  }
  if (name.startsWith('table-')) {
    return { ...base, wave: 'wavetable', table: RETRO_TABLES[name.slice('table-'.length)] };
  }
  return { ...base, wave: name as RetroWave };
}

export interface RetroOscillatorV1 {
  readonly wave: RetroWave;
  /** Darbe doluluk oranı ve isteğe bağlı doğrusal süpürme. */
  readonly duty: number;
  /** Örnek başına doluluk izi (otomasyon); verilirse sabit değer ve süpürmenin yerini alır. */
  readonly dutyTrack?: (seconds: number) => number;
  readonly dutyTo: number;
  readonly dutySeconds: number;
  /** Üçgen 32 adımlık 4-bit basamak mı (true), bant sınırlı düz tablo mu. */
  readonly stepped: boolean;
  readonly noiseMode: NoiseMode;
  /** Sabit LFSR saati; `null` → perde × `NOISE_CLOCK_PER_HZ`. */
  readonly noiseClockHz: number | null;
  readonly table: readonly number[];
  /** Tablo basamaklı (örnek-tut) mı, doğrusal ara değerli mi okunur. */
  readonly interpolate: boolean;
  /** Hard sync: bağımlı osilatör perde × oran hızında döner, ana döngüde sıfırlanır (1 = kapalı). */
  readonly syncRatio: number;
  /** Genlik kuantizasyonu (bit, 0 = kapalı) ve örnek tutma oranı (Hz, 0 = kapalı). */
  readonly bits: number;
  readonly holdHz: number;
}

export interface RetroPitchV1 {
  readonly frequencyHz: number;
  /** Örnek başına perde izi (otomasyon); verilirse `frequencyHz`in yerini alır. */
  readonly track?: (seconds: number) => number;
  readonly arpeggio: { readonly semitones: readonly number[]; readonly rateHz: number } | null;
  /** Başlangıçta `semitones` uzakta başlar, `seconds` içinde hedefe iner (zap, düşüş). */
  readonly sweep: { readonly semitones: number; readonly seconds: number } | null;
  readonly vibrato: {
    readonly depthCents: number;
    readonly rateHz: number;
    readonly delaySeconds: number;
  } | null;
}

export interface RetroEnvelopeV1 {
  readonly attack: number;
  readonly decay: number;
  readonly sustain: number;
  readonly release: number;
  /** Seviye basamak sayısı (ör. 16 = 4-bit ses yazmacı); 0 = düz. */
  readonly steps: number;
}

export interface RetroRenderOptions {
  /** Kapı süresi: bırakma bundan sonra başlar. */
  readonly seconds: number;
  readonly sampleRate: number;
  /** İç aşırı örnekleme (1 ya da 2); 2'de yarım bant decimator. */
  readonly oversample: number;
  readonly gain: number;
  /** İç orandan çıkış oranına indirici (aşırı örneklemede). */
  readonly decimate: (buffer: Float32Array) => Float32Array;
}

export function retroLengthSeconds(envelope: RetroEnvelopeV1, seconds: number): number {
  return seconds + envelope.release;
}

interface Blep {
  /** Yazılmakta olan örneğe eklenecek düzeltme (önceki örnek doğrudan düzeltilir). */
  pending: number;
}

/** `t` (0–1): süreksizlikten bu yana geçen örnek. Sıçrama `h`. */
function addBlep(out: Float32Array, index: number, t: number, h: number, blep: Blep): void {
  const half = h / 2;
  if (index > 0) out[index - 1] += half * t * t;
  blep.pending += -half * (1 - t) * (1 - t);
}

function envelopeAt(env: RetroEnvelopeV1, t: number, gate: number): number {
  let level: number;
  if (t < env.attack) level = env.attack > 0 ? t / env.attack : 1;
  else if (t < env.attack + env.decay) {
    level = 1 - (1 - env.sustain) * ((t - env.attack) / env.decay);
  } else level = env.sustain;
  if (t >= gate) {
    const held = envelopeAt(env, Math.min(gate, env.attack + env.decay), Infinity);
    const r = env.release > 0 ? Math.max(0, 1 - (t - gate) / env.release) : 0;
    level = held * r;
  }
  if (env.steps > 1) level = Math.round(level * (env.steps - 1)) / (env.steps - 1);
  return level;
}

function pitchAt(pitch: RetroPitchV1, t: number): number {
  let semis = 0;
  if (pitch.sweep && t < pitch.sweep.seconds) {
    semis += pitch.sweep.semitones * (1 - t / pitch.sweep.seconds);
  }
  if (pitch.arpeggio && pitch.arpeggio.semitones.length > 0) {
    const index = Math.floor(t * pitch.arpeggio.rateHz) % pitch.arpeggio.semitones.length;
    semis += pitch.arpeggio.semitones[index];
  }
  let cents = 0;
  if (pitch.vibrato && t >= pitch.vibrato.delaySeconds) {
    cents =
      pitch.vibrato.depthCents *
      Math.sin(2 * Math.PI * pitch.vibrato.rateHz * (t - pitch.vibrato.delaySeconds));
  }
  const base = pitch.track ? pitch.track(t) : pitch.frequencyHz;
  return base * Math.pow(2, semis / 12 + cents / 1200);
}

function tableValue(table: readonly number[], phase: number, interpolate: boolean): number {
  const position = phase * table.length;
  const i = Math.floor(position) % table.length;
  if (!interpolate) return table[i];
  const next = table[(i + 1) % table.length];
  return table[i] + (next - table[i]) * (position - Math.floor(position));
}

/** Periyodik dalganın naif (sağdan sürekli) değeri; düzeltme ayrı yapılır. */
function naive(osc: RetroOscillatorV1, phase: number, duty: number, inc: number): number {
  switch (osc.wave) {
    case 'pulse':
      return phase < duty ? 1 : -1;
    case 'sawtooth':
      return 2 * phase - 1;
    case 'triangle':
      return osc.stepped
        ? tableValue(RETRO_TABLES['triangle-4bit'], phase, false)
        : getWaveSampleWithPhase('triangle', phase, 0.5, inc);
    case 'wavetable':
      return tableValue(osc.table, phase, osc.interpolate);
    case 'noise':
      return 0;
  }
}

interface Jump {
  /** Döngü içindeki konum [0, 1). */
  readonly at: number;
  readonly h: number;
}

function tableJumps(table: readonly number[]): Jump[] {
  return table
    .map((v, k) => ({ at: k / table.length, h: v - table[(k - 1 + table.length) % table.length] }))
    .filter((jump) => jump.h !== 0);
}

/** Dalganın bir döngüdeki süreksizlikleri; sürekli dalgada boş. */
function jumpsOf(osc: RetroOscillatorV1, duty: number): readonly Jump[] {
  switch (osc.wave) {
    case 'pulse':
      return [
        { at: 0, h: 2 },
        { at: duty, h: -2 },
      ];
    case 'sawtooth':
      return [{ at: 0, h: -2 }];
    case 'triangle':
      return osc.stepped ? tableJumps(RETRO_TABLES['triangle-4bit']) : [];
    case 'wavetable':
      return osc.interpolate ? [] : tableJumps(osc.table);
    case 'noise':
      return [];
  }
}

/**
 * Sarmasız faz `a` (hariç) ile `b` (dahil) arasında geçilen sıçramalar.
 * `lead`: `b` anından örneğin sonuna kalan süre (örnek cinsinden).
 */
function crossJumps(
  out: Float32Array,
  n: number,
  a: number,
  b: number,
  inc: number,
  jumps: readonly Jump[],
  lead: number,
  blep: Blep,
): void {
  for (const jump of jumps) {
    for (let c = Math.floor(a - jump.at) + 1 + jump.at; c <= b; c += 1) {
      addBlep(out, n, lead + (b - c) / inc, jump.h, blep);
    }
  }
}

function renderPeriodic(
  out: Float32Array,
  osc: RetroOscillatorV1,
  pitch: RetroPitchV1,
  rate: number,
): void {
  const blep: Blep = { pending: 0 };
  let master = 0;
  let slave = 0;
  for (let n = 0; n < out.length; n++) {
    const t = n / rate;
    const f = pitchAt(pitch, t);
    const duty = osc.dutyTrack
      ? osc.dutyTrack(t)
      : osc.dutySeconds > 0
      ? osc.duty + (osc.dutyTo - osc.duty) * Math.min(1, t / osc.dutySeconds)
      : osc.duty;
    const incM = f / rate;
    const inc = incM * osc.syncRatio;
    const jumps = jumpsOf(osc, duty);
    master += incM;
    if (osc.syncRatio > 1 && master >= 1) {
      master -= 1;
      const since = master / incM;
      const cross = slave + inc * (1 - since);
      crossJumps(out, n, slave, cross, inc, jumps, since, blep);
      const before = naive(osc, cross - Math.floor(cross), duty, inc);
      addBlep(out, n, since, naive(osc, 0, duty, inc) - before, blep);
      const restart = inc * since;
      crossJumps(out, n, 0, restart, inc, jumps, 0, blep);
      slave = restart - Math.floor(restart);
    } else {
      if (master >= 1) master -= 1;
      const next = slave + inc;
      crossJumps(out, n, slave, next, inc, jumps, 0, blep);
      slave = next - Math.floor(next);
    }
    out[n] += naive(osc, slave, duty, inc) + blep.pending;
    blep.pending = 0;
  }
}

/**
 * LFSR gürültüsü: yazmaç tohumlanmaz, donanımdaki gibi 1'den başlar — her
 * nota aynı diziyi çalar ve kısa kipin perdesi bu yüzden kararlıdır.
 */
function renderNoise(
  out: Float32Array,
  osc: RetroOscillatorV1,
  pitch: RetroPitchV1,
  rate: number,
): void {
  const blep: Blep = { pending: 0 };
  let register = 1;
  let phase = 0;
  let value = 1;
  const tap = osc.noiseMode === 'short' ? 6 : 1;
  for (let n = 0; n < out.length; n++) {
    const clock = osc.noiseClockHz ?? pitchAt(pitch, n / rate) * NOISE_CLOCK_PER_HZ;
    const inc = Math.min(clock / rate, 64);
    phase += inc;
    while (phase >= 1) {
      phase -= 1;
      const feedback = (register & 1) ^ ((register >> tap) & 1);
      register = (register >> 1) | (feedback << 14);
      const next = register & 1 ? -1 : 1;
      if (next !== value)
        addBlep(out, n, Math.min(1, phase / Math.max(inc, 1e-9)), next - value, blep);
      value = next;
    }
    out[n] += value + blep.pending;
    blep.pending = 0;
  }
}

/**
 * Tek sesi render eder: iç oranda üretim → yarım bant decimator → zarf →
 * bit/tutma. Zarf decimator'dan SONRA uygulanır: basamaklı 4-bit seviye
 * bilinçli bir karakterdir ve iç oranda uygulanırsa süzülüp yumuşardı.
 */
export function renderRetro(
  osc: RetroOscillatorV1,
  pitch: RetroPitchV1,
  envelope: RetroEnvelopeV1,
  options: RetroRenderOptions,
): Float32Array {
  const rate = options.sampleRate * options.oversample;
  const seconds = retroLengthSeconds(envelope, options.seconds);
  const internal = new Float32Array(Math.max(1, Math.ceil(seconds * rate)));
  if (osc.wave === 'noise') renderNoise(internal, osc, pitch, rate);
  else renderPeriodic(internal, osc, pitch, rate);
  const out = options.oversample > 1 ? options.decimate(internal) : internal;
  for (let i = 0; i < out.length; i++) {
    out[i] *= options.gain * envelopeAt(envelope, i / options.sampleRate, options.seconds);
  }
  if (osc.bits > 0 || osc.holdHz > 0) {
    crush([out], {
      bits: osc.bits > 0 ? osc.bits : 24,
      hold: osc.holdHz > 0 ? Math.max(1, Math.round(options.sampleRate / osc.holdHz)) : 1,
      mix: 1,
    });
  }
  return out;
}
