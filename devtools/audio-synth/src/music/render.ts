import { barsToFrames, type MusicPlaybackMode } from '@volstudio/core/audio/music';
import { renderVoices, trimmedLength, type PlacedVoiceV1 } from '../arrange/render';
import { estimateFrameCost, type RenderCost } from '../guard/budget';
import { getPreset } from '../presets';
import { presetOf } from './instruments';
import { eventsOfStem, type MusicScoreV1, type ScoreEventV1 } from './score';
import { midiToHz } from './tonal';

/**
 * Score → ham PCM. Mastering YOKTUR; kazanç kararı `mastering.ts`indir ve
 * stem'ler ortak kazanç aldığı için burada uygulanamaz.
 *
 * Uzunluk çalma moduna göre belirlenir: loop ve adaptive tam ölçü sayısı
 * kadar sürer ve taşan kuyruk başa sarılır (dikişsiz), tek seferlik cue
 * kuyruk payı alır ve sonradan kırpılır.
 */
export const MUSIC_RENDERER_VERSION = 1;

/** Tek seferlik cue'da son notadan sonra bırakılan pay. */
export const ONE_SHOT_TAIL_SECONDS = 3;

/**
 * Ses başına kare maliyeti için muhafazakâr üst sınır. Ölçülmüş bir ortalama
 * değildir; bütçe kapısının görevi aşırı işi ÖNCEDEN reddetmektir, maliyeti
 * tahmin etmek değil.
 */
export const VOICE_WORK_PER_FRAME = 40;

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

export function voicesOf(score: MusicScoreV1, events: readonly ScoreEventV1[]): PlacedVoiceV1[] {
  const beat = beatSeconds(score);
  return events.map((event) => ({
    params: getPreset(presetOf(event.instrument), midiToHz(event.midi), event.beats * beat),
    atSeconds: event.beat * beat,
    gain: event.gain,
    ...(event.pan === undefined ? {} : { pan: event.pan }),
  }));
}

export interface RenderScoreOptions {
  readonly playback: MusicPlaybackMode;
  /** Verilmezse bütün şeritler (referans mix). */
  readonly stem?: string;
}

export function renderScoreRaw(score: MusicScoreV1, options: RenderScoreOptions): MusicRenderV1 {
  const events = eventsFor(score, options.stem);
  const beat = beatSeconds(score);
  const oneShot = options.playback === 'playlistOneShot';
  const frames = oneShot
    ? Math.ceil(
        (events.reduce((end, e) => Math.max(end, e.beat + e.beats), 0) * beat +
          ONE_SHOT_TAIL_SECONDS) *
          score.sampleRate,
      )
    : loopFrames(score);
  const mix = renderVoices(voicesOf(score, events), {
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
  const beat = beatSeconds(score);
  const frames =
    options.playback === 'playlistOneShot'
      ? Math.ceil(
          (events.reduce((end, e) => Math.max(end, e.beat + e.beats), 0) * beat +
            ONE_SHOT_TAIL_SECONDS) *
            score.sampleRate,
        )
      : loopFrames(score);
  const mix = estimateFrameCost(score.sampleRate, frames / score.sampleRate, 2, 0);
  const voiceFrames = events.reduce(
    (sum, e) => sum + Math.ceil(e.beats * beat * score.sampleRate),
    0,
  );
  const longest = events.reduce(
    (max, e) => Math.max(max, Math.ceil(e.beats * beat * score.sampleRate)),
    0,
  );
  return {
    peakBytes: mix.peakBytes + longest * 2 * 4,
    workUnits: voiceFrames * VOICE_WORK_PER_FRAME,
  };
}
