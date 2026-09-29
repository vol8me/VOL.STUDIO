import { AudioParamError } from '../guard/errors';
import { checkArray, checkChoice, checkNumber, checkObject } from '../guard/read';
import { truePeakDb } from '../analysis/loudness';
import { qualityProfile } from '../engine/session';
import {
  MASTER_CEILING,
  MASTER_END_FADE_SECONDS,
  measureMix,
  type MusicMasteringPlanV1,
} from './mastering';
import type { MarkerV1 } from './programTypes';
import type { MusicScoreV1 } from './score';
import { MUSIC_ID, MUSIC_KEY, checkPattern, type MusicPlayback } from './terms';

/**
 * Müzik BUNDLE'ı: tek program ve tek provenance altında loop gövdesi ile
 * giriş, bitiş, stinger ve geçiş cue'ları. Segment, programın ölçü
 * zamanında bir aralıktır; loop segmenti döngüsel (kuyruk başa sarılır),
 * diğerleri tek seferlik (kuyruk doğal söner) render edilir.
 *
 * Bütün segmentler loop'un mastering kazancını PAYLAŞIR: giriş ile loop
 * arasında seviye sıçraması olmaz. Stinger ve geçiş kendi `gainDb`
 * farkını taşıyabilir (loop'un üstünde duyulma payı).
 */
export const SEGMENT_KINDS = ['intro', 'loop', 'outro', 'stinger', 'transition'] as const;
export type SegmentKind = (typeof SEGMENT_KINDS)[number];

export interface SegmentV1 {
  readonly id: string;
  readonly kind: SegmentKind;
  /** `[başlangıç, bitiş)` ölçü aralığı. */
  readonly bars: readonly [number, number];
  /** Stinger/geçiş hizası (çalışma zamanı); varsayılan ölçü. */
  readonly align?: 'bar' | 'beat';
  /** Geçişin hedef parçası (bilgi). */
  readonly to?: string;
  /** Loop kazancına göre fark (dB); yalnız stinger ve geçişte. */
  readonly gainDb?: number;
}

export interface SegmentContext {
  readonly bars: number;
  readonly playback: MusicPlayback;
  readonly stems: readonly string[];
  readonly markers?: readonly MarkerV1[];
}

const SINGLE: readonly SegmentKind[] = ['intro', 'loop', 'outro'];

export function validateSegments(value: unknown, context: SegmentContext): SegmentV1[] {
  if (context.playback === 'playlistOneShot') {
    throw new AudioParamError(
      'segments',
      'combination',
      'segment yalnız loop çalma modelindedir',
      context.playback,
    );
  }
  const list = checkArray(value, 'segments');
  if (list.length < 2 || list.length > 16) {
    throw new AudioParamError(
      'segments',
      'range',
      '2–16 segment (loop + en az bir cue)',
      list.length,
    );
  }
  const segments = list.map((raw, i): SegmentV1 => {
    const path = `segments[${i}]`;
    const o = checkObject(raw, path, ['id', 'kind', 'bars', 'align', 'to', 'gainDb']);
    const kind = checkChoice(o.kind, `${path}.kind`, SEGMENT_KINDS);
    const id = checkPattern(o.id, `${path}.id`, MUSIC_KEY);
    if (id === 'mix' || context.stems.includes(id)) {
      throw new AudioParamError(
        `${path}.id`,
        'combination',
        'asset adı stem ya da "mix" ile çakışır',
        id,
      );
    }
    const range = checkArray(o.bars, `${path}.bars`);
    if (range.length !== 2)
      throw new AudioParamError(`${path}.bars`, 'type', '[başlangıç, bitiş)', range);
    const from = checkNumber(range[0], `${path}.bars[0]`, {
      min: 0,
      max: context.bars - 1,
      integer: true,
    });
    const to = checkNumber(range[1], `${path}.bars[1]`, {
      min: from + 1,
      max: context.bars,
      integer: true,
    });
    const cue = kind === 'stinger' || kind === 'transition';
    if (!cue && (o.align !== undefined || o.gainDb !== undefined)) {
      throw new AudioParamError(
        path,
        'combination',
        'hiza ve kazanç farkı yalnız stinger/geçişte',
        kind,
      );
    }
    if (kind !== 'transition' && o.to !== undefined) {
      throw new AudioParamError(`${path}.to`, 'combination', 'hedef yalnız geçişte', o.to);
    }
    return {
      id,
      kind,
      bars: [from, to],
      ...(o.align === undefined
        ? {}
        : { align: checkChoice(o.align, `${path}.align`, ['bar', 'beat'] as const) }),
      ...(o.to === undefined ? {} : { to: checkPattern(o.to, `${path}.to`, MUSIC_ID) }),
      ...(o.gainDb === undefined
        ? {}
        : { gainDb: checkNumber(o.gainDb, `${path}.gainDb`, { min: -24, max: 0 }) }),
    };
  });
  const seen = new Set<string>();
  for (const segment of segments) {
    if (seen.has(segment.id)) {
      throw new AudioParamError(
        'segments',
        'combination',
        'segment kimliği tekrar etti',
        segment.id,
      );
    }
    seen.add(segment.id);
  }
  for (const kind of SINGLE) {
    const count = segments.filter((s) => s.kind === kind).length;
    if (count > 1 || (kind === 'loop' && count === 0)) {
      throw new AudioParamError(
        'segments',
        'combination',
        kind === 'loop' ? 'tam bir loop segmenti' : `en çok bir ${kind}`,
        count,
      );
    }
  }
  const sorted = [...segments].sort((a, b) => a.bars[0] - b.bars[0]);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].bars[0] < sorted[i - 1].bars[1]) {
      throw new AudioParamError(
        'segments',
        'combination',
        `${sorted[i - 1].id} ile ${sorted[i].id} örtüşüyor`,
        sorted[i].bars,
      );
    }
  }
  const loop = segments.find((s) => s.kind === 'loop') as SegmentV1;
  const intro = segments.find((s) => s.kind === 'intro');
  if (intro && intro.bars[1] !== loop.bars[0]) {
    throw new AudioParamError(
      'segments',
      'combination',
      'giriş loop’un başladığı ölçüde bitmeli',
      intro.bars,
    );
  }
  for (const marker of context.markers ?? []) {
    const expected =
      marker.kind === 'loop-start'
        ? loop.bars[0]
        : marker.kind === 'loop-end'
        ? loop.bars[1]
        : null;
    if (expected !== null && marker.bar !== expected) {
      throw new AudioParamError(
        'markers',
        'combination',
        `${marker.kind} loop segmentiyle uyuşmuyor (${expected})`,
        marker.bar,
      );
    }
  }
  return segments;
}

export function loopSegment(segments: readonly SegmentV1[]): SegmentV1 {
  return segments.find((s) => s.kind === 'loop') as SegmentV1;
}

/**
 * Score'un segment aralığındaki olayları, aralığın başına göre kaydırılmış
 * olarak. İnsanlaştırma bir olayı aralık başının önüne itmişse loop'ta
 * sona sarılır (dikişsiz), tek seferlik segmentte 0'a oturur.
 */
export function segmentScore(score: MusicScoreV1, segment: SegmentV1): MusicScoreV1 {
  const start = segment.bars[0] * score.beatsPerBar;
  const end = segment.bars[1] * score.beatsPerBar;
  const beats = end - start;
  const wrap = segment.kind === 'loop';
  return {
    ...score,
    bars: segment.bars[1] - segment.bars[0],
    totalBeats: beats,
    sections: score.sections.filter(
      (s) => s.bars[0] < segment.bars[1] && s.bars[1] > segment.bars[0],
    ),
    events: score.events
      .filter((e) => e.gridBeat >= start - 1e-9 && e.gridBeat < end - 1e-9)
      .map((e) => {
        const shifted = e.beat - start;
        return {
          ...e,
          gridBeat: e.gridBeat - start,
          beat: shifted >= 0 ? shifted : wrap ? shifted + beats : 0,
        };
      }),
  };
}

/** Tek seferlik segmentin mastering planı: loop'un kazancı (+ farkı), sınırlayıcı ve sönüm. */
export function segmentMastering(
  loopPlan: MusicMasteringPlanV1,
  segment: SegmentV1,
): MusicMasteringPlanV1 {
  return {
    ...loopPlan,
    path: 'one-shot-limited',
    gainDb: Number((loopPlan.gainDb + (segment.gainDb ?? 0)).toFixed(4)),
    limiter: { threshold: 0.7, knee: 0.28 },
    ceiling: MASTER_CEILING,
    trimSilence: true,
    fadeOutSeconds: MASTER_END_FADE_SECONDS,
  };
}

export interface SegmentQaV1 {
  readonly id: string;
  readonly kind: SegmentKind;
  readonly samplePeak: number;
  readonly truePeakDbtp: number;
  readonly integratedLufs: number;
  /** Stinger: loop'un her hizalı noktasında birlikte çalındığında en kötü true peak. Giriş: loop'a devirde. */
  readonly overlay: { readonly positions: number; readonly worstTruePeakDbtp: number } | null;
  readonly ok: boolean;
  readonly problems: readonly string[];
}

const QA_TRUE_PEAK_MAX_DBTP = -1;
const QA_SAMPLE_PEAK_MAX = 0.999;
const QA_SILENT_LUFS = -60;

/** Loop'un kopyasına cue'yu `offset`ten itibaren ekler; loop sonunu aşan kısım başa sarılır. */
function overlayLoop(
  loop: readonly Float32Array[],
  cue: readonly Float32Array[],
  offset: number,
): Float32Array[] {
  return loop.map((channel, c) => {
    const out = Float32Array.from(channel);
    const source = cue[c] ?? cue[0];
    for (let i = 0; i < source.length; i++) out[(offset + i) % out.length] += source[i];
    return out;
  });
}

/** Girişin (kuyruğuyla) üstüne loop'u `offset`ten başlatır. */
function handoff(
  intro: readonly Float32Array[],
  loop: readonly Float32Array[],
  offset: number,
): Float32Array[] {
  const length = Math.max(intro[0].length, offset + loop[0].length);
  return intro.map((channel, c) => {
    const out = new Float32Array(length);
    out.set(channel);
    const source = loop[c] ?? loop[0];
    for (let i = 0; i < source.length; i++) out[offset + i] += source[i];
    return out;
  });
}

/**
 * Segment QA'sı: her cue tek başına tepe/true-peak/yükseklik; stinger loop'un
 * her hizalı noktasında (ölçü ya da vuruş) loop ile birlikte; giriş loop'a
 * devrederken kuyruğuyla birlikte ölçülür. Motor ikisini aynı veriyolunda
 * toplar ve sınırlayıcısı yoktur: bindirme taşarsa oyunda kırpılır.
 */
export function segmentQa(input: {
  readonly loop: readonly Float32Array[];
  readonly sampleRate: number;
  readonly beatFrames: number;
  readonly barFrames: number;
  readonly introFrames: (segment: SegmentV1) => number;
  readonly segments: readonly { readonly segment: SegmentV1; readonly channels: Float32Array[] }[];
}): SegmentQaV1[] {
  const oversample = qualityProfile().truePeakOversample;
  return input.segments.map(({ segment, channels }) => {
    const measured = measureMix(channels, input.sampleRate, 'one-shot-limited');
    const problems: string[] = [];
    if (measured.samplePeak > QA_SAMPLE_PEAK_MAX) problems.push(`tepe ${measured.samplePeak}`);
    if (measured.truePeakDbtp > QA_TRUE_PEAK_MAX_DBTP)
      problems.push(`true-peak ${measured.truePeakDbtp} dBTP`);
    if (!(measured.integratedLufs > QA_SILENT_LUFS)) problems.push('duyulmuyor');
    let overlay: SegmentQaV1['overlay'] = null;
    if (segment.kind === 'stinger') {
      const step = segment.align === 'beat' ? input.beatFrames : input.barFrames;
      let worst = Number.NEGATIVE_INFINITY;
      let positions = 0;
      for (let offset = 0; offset < input.loop[0].length; offset += step) {
        worst = Math.max(
          worst,
          truePeakDb(overlayLoop(input.loop, channels, offset), input.sampleRate, oversample),
        );
        positions++;
      }
      overlay = { positions, worstTruePeakDbtp: Number(worst.toFixed(3)) };
    } else if (segment.kind === 'intro') {
      const joined = handoff(channels, input.loop, input.introFrames(segment));
      overlay = {
        positions: 1,
        worstTruePeakDbtp: Number(truePeakDb(joined, input.sampleRate, oversample).toFixed(3)),
      };
    }
    if (overlay && overlay.worstTruePeakDbtp > QA_TRUE_PEAK_MAX_DBTP) {
      problems.push(`loop ile birlikte true-peak ${overlay.worstTruePeakDbtp} dBTP`);
    }
    return {
      id: segment.id,
      kind: segment.kind,
      samplePeak: measured.samplePeak,
      truePeakDbtp: measured.truePeakDbtp,
      integratedLufs: measured.integratedLufs,
      overlay,
      ok: problems.length === 0,
      problems,
    };
  });
}

export interface MusicViewV1 {
  readonly score: MusicScoreV1;
  readonly playback: MusicPlayback;
  /** Stem süzgeci (yalnız loop gövdesinde; cue'lar tek parçadır). */
  readonly stem?: string;
}

/**
 * Bir asset'in render'ı için score görünümü: segmentsiz programda bütün
 * zaman çizgisi; segmentli programda cue kendi aralığı (tek seferlik), mix
 * ve stem'ler loop aralığı (döngüsel).
 */
export function musicView(
  program: { readonly playback: MusicPlayback; readonly segments?: readonly SegmentV1[] },
  score: MusicScoreV1,
  stem: string | undefined,
): MusicViewV1 {
  const own = stem ? { stem } : {};
  if (!program.segments) return { score, playback: program.playback, ...own };
  const cue = stem ? program.segments.find((s) => s.id === stem && s.kind !== 'loop') : undefined;
  if (cue) return { score: segmentScore(score, cue), playback: 'playlistOneShot' };
  return {
    score: segmentScore(score, loopSegment(program.segments)),
    playback: program.playback,
    ...own,
  };
}

/** Yayımlanan tek seferlik cue segmentleri (loop dışındakiler). */
export function cueSegments(program: { readonly segments?: readonly SegmentV1[] }): SegmentV1[] {
  return (program.segments ?? []).filter((s) => s.kind !== 'loop');
}
