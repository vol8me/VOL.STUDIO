import { barsToFrames, type MusicPlaybackMode } from '@volstudio/core/audio/music';
import { renderVoices, trimmedLength, type PlacedVoiceV1 } from '../arrange/render';
import { estimateFrameCost, type RenderCost } from '../guard/budget';
import type { SampleAccess } from '../program/samples';
import type { ResolvedInstrumentV1 } from './instrumentResolve';
import { eventsOfStem, type MusicScoreV1, type ScoreEventV1 } from './score';
import { planVoices, voiceSecondsBound, type VoiceContext } from './voices';

/**
 * Score → ham PCM. Mastering YOKTUR; kazanç kararı `mastering.ts`indir ve
 * stem'ler ortak kazanç aldığı için burada uygulanamaz.
 *
 * Uzunluk çalma moduna göre belirlenir: loop ve adaptive tam ölçü sayısı
 * kadar sürer ve taşan kuyruk başa sarılır (dikişsiz), tek seferlik cue
 * kuyruk payı alır ve sonradan kırpılır.
 */
export const MUSIC_RENDERER_VERSION = 2;

/** Tek seferlik cue'da son notadan sonra bırakılan pay. */
const ONE_SHOT_TAIL_SECONDS = 3;
/** Doğal sönümün sonunda bırakılan pay (kırpma zaten sessizliği atar). */
const TRIM_MARGIN = 0.1;

/**
 * Ses başına kare maliyeti için muhafazakâr üst sınır. Ölçülmüş bir ortalama
 * değildir; bütçe kapısının görevi aşırı işi ÖNCEDEN reddetmektir, maliyeti
 * tahmin etmek değil.
 */
const VOICE_WORK_PER_FRAME = 40;

export interface MusicRenderV1 {
  readonly channels: Float32Array[];
  readonly sampleRate: number;
  readonly frames: number;
  readonly durationSeconds: number;
}

export function beatSeconds(score: MusicScoreV1): number {
  return 60 / score.bpm;
}

/** Loop uzunluğu: ölçüden örneğe çeviren TEK fonksiyon core'dadır. */
export function loopFrames(score: MusicScoreV1): number {
  return barsToFrames(score.bars, score.bpm, score.beatsPerBar, score.sampleRate);
}

export function eventsFor(score: MusicScoreV1, stem?: string): ScoreEventV1[] {
  return stem === undefined ? [...score.events] : eventsOfStem(score, stem);
}

export function voicesOf(
  score: MusicScoreV1,
  events: readonly ScoreEventV1[],
  context: VoiceContext = {},
): PlacedVoiceV1[] {
  return planVoices(score, events, context);
}

export interface RenderScoreOptions {
  readonly playback: MusicPlaybackMode;
  /** Verilmezse bütün şeritler (referans mix). */
  readonly stem?: string;
  /** Sampler enstrümanlarının kayıtları (programın `samples` bildiriminden). */
  readonly samples?: SampleAccess;
}

/**
 * Tek seferlik cue'nun tampon uzunluğu: son notanın bitimi + kuyruk payı;
 * doğal sönümü bundan uzun süren bir ses (zil, let-ring) varsa onun sonu.
 */
export function oneShotFrames(score: MusicScoreV1, events: readonly ScoreEventV1[]): number {
  const beat = beatSeconds(score);
  const tail = Math.ceil(
    (events.reduce((end, e) => Math.max(end, e.beat + e.beats), 0) * beat + ONE_SHOT_TAIL_SECONDS) *
      score.sampleRate,
  );
  const memo = new Map<string, ResolvedInstrumentV1>();
  const ring = events.reduce(
    (end, e) => Math.max(end, e.beat * beat + voiceSecondsBound(score, e, memo) + TRIM_MARGIN),
    0,
  );
  return Math.max(tail, Math.ceil(ring * score.sampleRate));
}

export function renderScoreRaw(score: MusicScoreV1, options: RenderScoreOptions): MusicRenderV1 {
  const events = eventsFor(score, options.stem);
  const oneShot = options.playback === 'playlistOneShot';
  const frames = oneShot ? oneShotFrames(score, events) : loopFrames(score);
  const mix = renderVoices(voicesOf(score, events, { samples: options.samples }), {
    durationSeconds: frames / score.sampleRate,
    sampleRate: score.sampleRate,
    wrap: !oneShot,
  });
  const kept = oneShot ? trimmedLength(mix.channels, score.sampleRate) : frames;
  const channels = mix.channels.map((channel) => channel.subarray(0, kept));
  return {
    channels,
    sampleRate: score.sampleRate,
    frames: kept,
    durationSeconds: kept / score.sampleRate,
  };
}

/** Render'dan ÖNCE maliyet: tampon baytı ve iş birimi (bütçe kapısı için). */
export function estimateScoreCost(score: MusicScoreV1, options: RenderScoreOptions): RenderCost {
  const events = eventsFor(score, options.stem);
  const frames =
    options.playback === 'playlistOneShot' ? oneShotFrames(score, events) : loopFrames(score);
  const mix = estimateFrameCost(score.sampleRate, frames / score.sampleRate, 2, 0);
  const memo = new Map<string, ResolvedInstrumentV1>();
  const seconds = events.map((e) => voiceSecondsBound(score, e, memo));
  const voiceFrames = seconds.reduce((sum, s) => sum + Math.ceil(s * score.sampleRate), 0);
  const longest = seconds.reduce((max, s) => Math.max(max, Math.ceil(s * score.sampleRate)), 0);
  return {
    peakBytes: mix.peakBytes + longest * 2 * 4,
    workUnits: voiceFrames * VOICE_WORK_PER_FRAME,
  };
}
