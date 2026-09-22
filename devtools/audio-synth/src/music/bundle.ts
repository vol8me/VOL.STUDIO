import {
  barsToFrames,
  resolveStemGain,
  type MusicAssetSpecV1,
  type MusicStemSpecV1,
  type Stem,
  type StemGainMap,
} from '@volstudio/core/audio/music';
import { hashCanonical, hashPcm, type Sha256 } from '../protocol/canonical';
import {
  applyMastering,
  measureMix,
  planMastering,
  TRUE_PEAK_MARGIN_DB,
  type MusicMasteringPlanV1,
} from './mastering';
import type { MusicProgramV1 } from './program';
import { loopFrames, renderScoreRaw, type MusicRenderV1 } from './render';
import type { MusicScoreV1 } from './score';

/**
 * Stem paketi: hizalı stem'ler, referans mix ve çalışma zamanı sözleşmesi.
 *
 * İki garanti burada ölçülür:
 * 1. Stem'lerin TOPLAMI referans mix'tir (kayan nokta gürültüsü dışında).
 *    Bu, insanlaştırmanın olay kimliğine bağlı olduğunun gerçek kanıtıdır;
 *    dizine bağlı olsaydı her stem başka bir sapma alır ve toplam ayrışırdı.
 * 2. Beyan edilen BÜTÜN state kombinasyonları tepe ve yükseklik politikasını
 *    geçer. Runtime'ın kullandığı `resolveStemGain` burada da çağrılır —
 *    ikinci bir gain gerçeği yazılmaz.
 */
export const MUSIC_ADAPTIVE_QA_SCHEMA = 'MusicAdaptiveQaV1';

/** Stem toplamı ile referans mix arasında kabul edilen kalıntı (dBFS). */
export const STEM_PARITY_FLOOR_DBFS = -90;
/** Kodek sonrası −1 dBTP politikası için kaynakta beklenen üst sınır. */
export const QA_TRUE_PEAK_MAX_DBTP = -1;
export const QA_SAMPLE_PEAK_MAX = 0.999;
/** En kısık state bile bu eşiğin altına inerse "duyulmuyor" sayılır. */
export const QA_SILENT_LUFS = -60;
export const MUSIC_LOUDNESS_RANGE = { min: -20, max: -12 } as const;

export interface RenderedStemV1 {
  readonly id: string;
  readonly channels: readonly Float32Array[];
}

export interface StateQaV1 {
  readonly state: string;
  readonly intensity: number;
  readonly gains: Readonly<Record<string, number>>;
  readonly integratedLufs: number;
  readonly samplePeak: number;
  readonly truePeakDbtp: number;
  readonly ok: boolean;
  readonly problems: readonly string[];
}

export interface MusicAdaptiveQaV1 {
  readonly schema: typeof MUSIC_ADAPTIVE_QA_SCHEMA;
  readonly musicId: string;
  readonly parity: { readonly residualDbfs: number; readonly ok: boolean };
  readonly states: readonly StateQaV1[];
  readonly verdict: { readonly pass: boolean; readonly failures: readonly string[] };
}

const SILENT_DBFS = -200;

function toDbfs(amplitude: number): number {
  return amplitude > 0 ? Number((20 * Math.log10(amplitude)).toFixed(3)) : SILENT_DBFS;
}

/** Stem toplamının referans mix'ten sapması (en büyük mutlak fark, dBFS). */
export function stemParityResidual(
  stems: readonly RenderedStemV1[],
  reference: readonly Float32Array[],
): number {
  let worst = 0;
  for (const [channel, target] of reference.entries()) {
    for (let i = 0; i < target.length; i++) {
      let sum = 0;
      for (const stem of stems) sum += stem.channels[channel][i];
      worst = Math.max(worst, Math.abs(sum - target[i]));
    }
  }
  return toDbfs(worst);
}

/** Salt-okunur program haritasını motorun beklediği değiştirilebilir biçime çevirir. */
function toGainMap(program: MusicProgramV1, stemId: string): StemGainMap | undefined {
  const map = program.adaptive?.stems.find((s) => s.stem === stemId)?.gainMap;
  return map
    ? { intensity: map.intensity.map((p) => ({ threshold: p.threshold, gain: p.gain })) }
    : undefined;
}

function stemHandles(program: MusicProgramV1): Stem[] {
  return program.stems.map((stem) => {
    const gainMap = toGainMap(program, stem.id);
    return { id: stem.id, ...(gainMap ? { gainMap } : {}) };
  });
}

/** Beyan edilen state'ler + gain haritalarının eşik köşeleri. */
export function qaIntensities(program: MusicProgramV1): { id: string; intensity: number }[] {
  if (!program.adaptive) return [{ id: 'fixed', intensity: 1 }];
  const corners = new Map<number, string>();
  for (const state of program.adaptive.states) corners.set(state.intensity, state.id);
  for (const stem of program.adaptive.stems) {
    for (const point of stem.gainMap.intensity) {
      if (!corners.has(point.threshold))
        corners.set(point.threshold, `threshold-${point.threshold}`);
    }
  }
  return [...corners.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([intensity, id]) => ({ id, intensity }));
}

function combine(
  stems: readonly RenderedStemV1[],
  gains: Readonly<Record<string, number>>,
  masterGain: number,
): Float32Array[] {
  const channels = stems[0].channels.length;
  const frames = stems[0].channels[0].length;
  return Array.from({ length: channels }, (_, channel) => {
    const out = new Float32Array(frames);
    for (const stem of stems) {
      const gain = (gains[stem.id] ?? 1) * masterGain;
      const source = stem.channels[channel];
      for (let i = 0; i < frames; i++) out[i] += source[i] * gain;
    }
    return out;
  });
}

export interface AdaptivePlanInput {
  readonly program: MusicProgramV1;
  readonly stems: readonly RenderedStemV1[];
  readonly reference: readonly Float32Array[];
  readonly sampleRate: number;
  readonly targetLufs: number;
}

export interface AdaptivePlanV1 {
  readonly mastering: MusicMasteringPlanV1;
  readonly qa: MusicAdaptiveQaV1;
}

/**
 * Ortak kazancı seçer ve bütün state'leri ölçer. Kazanç hedefi yükseklikten
 * gelir ama en yüksek kombinasyonun tepe payı onu AŞAĞI çekebilir: stem
 * yolunda sınırlayıcı yoktur, pay yalnız kazanç düşürerek açılır.
 */
export function planAdaptive(input: AdaptivePlanInput): AdaptivePlanV1 {
  const { program, stems, sampleRate } = input;
  const handles = stemHandles(program);
  const points = qaIntensities(program);
  const gainsOf = (intensity: number): Record<string, number> =>
    Object.fromEntries(handles.map((stem) => [stem.id, resolveStemGain(stem, { intensity })]));
  let maxPeak = 0;
  let maxTruePeak = Number.NEGATIVE_INFINITY;
  let loudest = { intensity: points[points.length - 1].intensity, lufs: Number.NEGATIVE_INFINITY };
  for (const point of points) {
    const mixed = combine(stems, gainsOf(point.intensity), 1);
    const measured = measureMix(mixed, sampleRate, 'stem-linear');
    maxPeak = Math.max(maxPeak, measured.samplePeak);
    maxTruePeak = Math.max(maxTruePeak, measured.truePeakDbtp);
    if (measured.integratedLufs > loudest.lufs) {
      loudest = { intensity: point.intensity, lufs: measured.integratedLufs };
    }
  }
  const mastering = planMastering({
    playback: 'adaptiveLoop',
    targetLufs: input.targetLufs,
    measuredLufs: loudest.lufs,
    maxCombinationPeak: maxPeak,
    maxCombinationTruePeakDb: maxTruePeak,
  });
  const masterGain = Math.pow(10, mastering.gainDb / 20);
  const failures: string[] = [];
  const states = points.map((point): StateQaV1 => {
    const gains = gainsOf(point.intensity);
    const mixed = combine(stems, gains, masterGain);
    const measured = measureMix(mixed, sampleRate, 'stem-linear');
    const problems: string[] = [];
    if (measured.samplePeak > QA_SAMPLE_PEAK_MAX) problems.push(`tepe ${measured.samplePeak}`);
    if (measured.truePeakDbtp > QA_TRUE_PEAK_MAX_DBTP) {
      problems.push(`true-peak ${measured.truePeakDbtp} dBTP`);
    }
    if (measured.integratedLufs < QA_SILENT_LUFS) problems.push('duyulmuyor');
    if (
      point.intensity === loudest.intensity &&
      (measured.integratedLufs < MUSIC_LOUDNESS_RANGE.min ||
        measured.integratedLufs > MUSIC_LOUDNESS_RANGE.max)
    ) {
      problems.push(`en yüksek state ${measured.integratedLufs} LUFS politika dışında`);
    }
    failures.push(...problems.map((problem) => `${point.id}: ${problem}`));
    return {
      state: point.id,
      intensity: point.intensity,
      gains,
      integratedLufs: measured.integratedLufs,
      samplePeak: measured.samplePeak,
      truePeakDbtp: measured.truePeakDbtp,
      ok: problems.length === 0,
      problems,
    };
  });
  const residual = stemParityResidual(stems, input.reference);
  const parityOk = residual <= STEM_PARITY_FLOOR_DBFS;
  if (!parityOk) failures.push(`stem toplamı referans mix'ten ${residual} dBFS sapıyor`);
  return {
    mastering,
    qa: {
      schema: MUSIC_ADAPTIVE_QA_SCHEMA,
      musicId: program.musicId,
      parity: { residualDbfs: residual, ok: parityOk },
      states,
      verdict: { pass: failures.length === 0, failures },
    },
  };
}

export interface PlannedRenderV1 {
  readonly reference: MusicRenderV1;
  readonly stems: readonly RenderedStemV1[];
  readonly plan: AdaptivePlanV1;
}

/**
 * Score'u render eder ve ortak mastering kararını verir. Hem yayın ön
 * denetimi hem arama finalistleri bunu çağırır: mastering kararının iki ayrı
 * gerçeği olamaz.
 */
export function renderAndPlan(
  program: MusicProgramV1,
  score: MusicScoreV1,
  targetLufs: number,
): PlannedRenderV1 {
  const reference = renderScoreRaw(score, { playback: program.playback });
  const stems: RenderedStemV1[] = program.stems.map((stem) => ({
    id: stem.id,
    channels: renderScoreRaw(score, { playback: program.playback, stem: stem.id }).channels,
  }));
  const plan = program.adaptive
    ? planAdaptive({
        program,
        stems,
        reference: reference.channels,
        sampleRate: reference.sampleRate,
        targetLufs,
      })
    : planSingle({
        program,
        reference: reference.channels,
        sampleRate: reference.sampleRate,
        targetLufs,
      });
  return { reference, stems, plan };
}

export interface SinglePlanInput {
  readonly program: MusicProgramV1;
  readonly reference: readonly Float32Array[];
  readonly sampleRate: number;
  readonly targetLufs: number;
}

/**
 * Tek asset'li yol (loop ve tek seferlik cue): kazanç ölçümden gelir,
 * sınırlayıcı tepe payını kapatır. QA yine ölçülür — "sınırlayıcı var,
 * nasılsa geçer" varsayımı politikayı sınamaz.
 */
export function planSingle(input: SinglePlanInput): AdaptivePlanV1 {
  const path = input.program.playback === 'loop' ? 'loop-cyclic' : 'one-shot-limited';
  const before = measureMix(input.reference, input.sampleRate, path);
  const planned = planMastering({
    playback: input.program.playback,
    targetLufs: input.targetLufs,
    measuredLufs: before.integratedLufs,
  });
  const { mastering, after } = refineForTruePeak(planned, input.reference, input.sampleRate, path);
  const problems: string[] = [];
  if (after.samplePeak > QA_SAMPLE_PEAK_MAX) problems.push(`tepe ${after.samplePeak}`);
  if (after.truePeakDbtp > QA_TRUE_PEAK_MAX_DBTP)
    problems.push(`true-peak ${after.truePeakDbtp} dBTP`);
  if (
    after.integratedLufs < MUSIC_LOUDNESS_RANGE.min ||
    after.integratedLufs > MUSIC_LOUDNESS_RANGE.max
  ) {
    problems.push(`${after.integratedLufs} LUFS politika dışında`);
  }
  return {
    mastering,
    qa: {
      schema: MUSIC_ADAPTIVE_QA_SCHEMA,
      musicId: input.program.musicId,
      parity: { residualDbfs: SILENT_DBFS, ok: true },
      states: [
        {
          state: 'fixed',
          intensity: 1,
          gains: { [input.program.stems[0].id]: 1 },
          integratedLufs: after.integratedLufs,
          samplePeak: after.samplePeak,
          truePeakDbtp: after.truePeakDbtp,
          ok: problems.length === 0,
          problems,
        },
      ],
      verdict: { pass: problems.length === 0, failures: problems.map((p) => `fixed: ${p}`) },
    },
  };
}

/**
 * Sınırlayıcılı yolda true-peak payı ÖLÇEREK bulunur: kazancı kaynaktaki
 * tepeye göre peşinen kısmak, sınırlayıcının açtığı payı geri verir ve
 * parçayı gereksiz kısık bırakır (ölçüldü: referans cue'da −18.9 LUFS'e
 * kadar). Fazlalık kadar indirilip yeniden ölçülür. Sınırlayıcı doğrusal
 * olmadığı için 2 dB hedefine her zaman yakınsamaz; bağlayıcı olan, QA'nın
 * −1 dBTP eşiği ve kodek SONRASI sınıf politikasıdır.
 */
const TRUE_PEAK_REFINE_STEPS = 6;
/** Adım başına iyileşme bunun altına inince yakınsama durur. */
const TRUE_PEAK_REFINE_EPSILON = 0.05;

function refineForTruePeak(
  planned: MusicMasteringPlanV1,
  reference: readonly Float32Array[],
  sampleRate: number,
  path: MusicMasteringPlanV1['path'],
): { mastering: MusicMasteringPlanV1; after: ReturnType<typeof measureMix> } {
  let mastering = planned;
  let after = measureMix(applied(reference, sampleRate, mastering), sampleRate, path);
  for (let step = 0; step < TRUE_PEAK_REFINE_STEPS; step++) {
    const excess = after.truePeakDbtp + TRUE_PEAK_MARGIN_DB;
    if (excess <= 0) break;
    const next = { ...mastering, gainDb: Number((mastering.gainDb - excess).toFixed(4)) };
    const measured = measureMix(applied(reference, sampleRate, next), sampleRate, path);
    const improvement = after.truePeakDbtp - measured.truePeakDbtp;
    mastering = next;
    after = measured;
    if (improvement < TRUE_PEAK_REFINE_EPSILON) break;
  }
  return { mastering, after };
}

function applied(
  reference: readonly Float32Array[],
  sampleRate: number,
  mastering: MusicMasteringPlanV1,
): Float32Array[] {
  const copy = reference.map((channel) => Float32Array.from(channel));
  applyMastering(copy, sampleRate, mastering);
  return copy;
}

export interface SpecInput {
  readonly program: MusicProgramV1;
  readonly score: MusicScoreV1;
  readonly mastering: MusicMasteringPlanV1;
  readonly measured: { readonly integratedLufs: number; readonly truePeakDbtp: number };
  readonly frames: number;
  /** Stem kimliği → paket köküne göreli dosya yolu. */
  readonly files: Readonly<Record<string, string>>;
  readonly stemFrames: Readonly<Record<string, number>>;
  readonly referenceMix?: { readonly file: string; readonly frames: number };
}

/** Çalışma zamanı sözleşmesini kurar; ölçüler ve yollar dışarıdan gelir. */
export function buildMusicAssetSpec(input: SpecInput): MusicAssetSpecV1 {
  const { program } = input;
  const stems: MusicStemSpecV1[] = program.stems.map((stem) => {
    const gainMap = toGainMap(program, stem.id);
    return {
      id: stem.id,
      file: input.files[stem.id],
      frames: input.stemFrames[stem.id],
      ...(gainMap ? { gainMap } : {}),
    };
  });
  return {
    schema: 'MusicAssetSpecV1',
    musicId: program.musicId,
    bpm: program.tempo.bpm,
    meter: program.meter,
    bars: program.bars,
    sampleRate: program.sampleRate,
    frames: input.frames,
    playback: program.playback,
    ...(program.playback === 'playlistOneShot'
      ? {}
      : { loop: { startBar: loopStartBar(program), endBar: program.bars } }),
    runtimeGain: 1,
    mastering: {
      path: input.mastering.path,
      gainDb: input.mastering.gainDb,
      integratedLufs: input.measured.integratedLufs,
      truePeakDbtp: input.measured.truePeakDbtp,
    },
    stems,
    ...(input.referenceMix ? { referenceMix: input.referenceMix } : {}),
    transitions: (program.transitions ?? []).map((transition) => ({
      id: transition.id,
      kind: transition.kind as 'crossfade' | 'fade-stop' | 'playlist-gap',
      seconds: transition.seconds,
      ...(transition.bars === undefined ? {} : { bars: transition.bars }),
      ...(transition.to === undefined ? {} : { to: transition.to }),
    })),
    engine: { compressor: false },
    ...(program.adaptive ? { states: program.adaptive.states } : {}),
  };
}

function loopStartBar(program: MusicProgramV1): number {
  return program.markers?.find((marker) => marker.kind === 'loop-start')?.bar ?? 0;
}

/** Loop uzunluğu core'un tek dönüşümünden; tek seferlik cue render'dan gelir. */
export function specFrames(program: MusicProgramV1, rendered: number): number {
  return program.playback === 'playlistOneShot'
    ? rendered
    : barsToFrames(program.bars, program.tempo.bpm, program.meter[0], program.sampleRate);
}

export function stemPcmHash(stem: RenderedStemV1, sampleRate: number): Sha256 {
  return hashPcm(stem.channels as Float32Array[], sampleRate);
}

export function adaptiveQaHash(qa: MusicAdaptiveQaV1): Sha256 {
  return hashCanonical(qa);
}

export { loopFrames };
