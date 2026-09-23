import { AudioParamError } from '../guard/errors';
import { checkObject } from '../guard/read';
import type { RenderCost } from '../guard/budget';
import { hashCanonical, type Sha256 } from '../protocol/canonical';
import {
  applyMastering,
  masteringPathOf,
  validateMasteringPlan,
  type MusicMasteringPlanV1,
} from './mastering';
import { estimateMixCost, renderScoreMixed, resolveMusicMix, type ResolvedMusicMix } from './mix';
import { validateMusicProgram, type MusicProgramV1 } from './program';
import { estimateScoreCost, renderScoreRaw, MUSIC_RENDERER_VERSION } from './render';
import { expandProgram } from './score';
import { checkPattern, MUSIC_KEY } from './terms';

/**
 * Job'ın render ettiği belge: BİR stem (ya da referans mix) + mastering
 * kararı + müziğin tamamı. Kanonik publish kapısı tek asset üretir; müzik
 * bundle'ı bu belgelerden birden çok iş açarak geçer — aile varyantlarının
 * aynı kapıdan geçmesiyle aynı yapı.
 *
 * Mastering kazancı belgede YAZILIDIR: her stem'i render ederken bütün
 * parçayı yeniden ölçmek gerekseydi yayın maliyeti stem sayısıyla çarpılırdı.
 * Kararın doğruluğu `checkMusic` aşamasında bir kez ölçülür ve kodek sonrası
 * sınıf politikası zaten her asset'te ayrıca sınanır.
 */
export const MUSIC_STEM_PROGRAM_SCHEMA = 'MusicStemProgramV1';

/** Bütün şeritleri taşıyan referans mix'in stem kimliği. */
export const REFERENCE_MIX_ID = 'mix';

export interface MusicStemProgramV1 {
  readonly schema: typeof MUSIC_STEM_PROGRAM_SCHEMA;
  readonly stem: string;
  readonly mastering: MusicMasteringPlanV1;
  readonly music: MusicProgramV1;
}

export interface MusicStemRenderV1 {
  readonly channels: Float32Array[];
  readonly sampleRate: number;
  readonly duration: number;
  readonly seed: number;
  readonly cost: RenderCost;
}

export function validateMusicStemProgram(value: unknown): MusicStemProgramV1 {
  const o = checkObject(value, '', ['schema', 'stem', 'mastering', 'music']);
  if (o.schema !== MUSIC_STEM_PROGRAM_SCHEMA) {
    throw new AudioParamError('schema', 'type', MUSIC_STEM_PROGRAM_SCHEMA, o.schema);
  }
  const music = validateMusicProgram(o.music);
  const stem = checkPattern(o.stem, 'stem', MUSIC_KEY);
  if (stem !== REFERENCE_MIX_ID && !music.stems.some((s) => s.id === stem)) {
    throw new AudioParamError(
      'stem',
      'unknown-id',
      `tanımlı stem ya da "${REFERENCE_MIX_ID}"`,
      stem,
    );
  }
  const mastering = validateMasteringPlan(o.mastering, 'mastering');
  const expected = masteringPathOf(music.playback);
  if (mastering.path !== expected) {
    throw new AudioParamError(
      'mastering.path',
      'combination',
      `${music.playback} için ${expected} olmalı`,
      mastering.path,
    );
  }
  return { schema: MUSIC_STEM_PROGRAM_SCHEMA, stem, mastering, music };
}

function stemFilter(document: MusicStemProgramV1): string | undefined {
  return document.stem === REFERENCE_MIX_ID ? undefined : document.stem;
}

/** Belgeyi deterministik olarak PCM'e çevirir: aynı belge + sürüm = aynı örnekler. */
export function renderMusicStem(
  value: unknown,
  options: { readonly seed?: number } = {},
): MusicStemRenderV1 {
  const document = validateMusicStemProgram(value);
  const program =
    options.seed === undefined || options.seed === document.music.seed
      ? document.music
      : { ...document.music, seed: options.seed };
  const score = expandProgram(program);
  const scoreOptions = { playback: program.playback, stem: stemFilter(document) };
  const mix = mixOf(program);
  const render = mix
    ? renderScoreMixed(score, mix, { ...scoreOptions, seed: program.seed })
    : renderScoreRaw(score, scoreOptions);
  applyMastering(render.channels, render.sampleRate, document.mastering);
  return {
    channels: render.channels,
    sampleRate: render.sampleRate,
    duration: render.durationSeconds,
    seed: program.seed,
    cost: costOf(score, program, scoreOptions),
  };
}

function mixOf(program: MusicProgramV1): ResolvedMusicMix | null {
  return program.mix
    ? resolveMusicMix(program.mix, 'mix', program.lanes, program.playback, program.sampleRate)
    : null;
}

function costOf(
  score: ReturnType<typeof expandProgram>,
  program: MusicProgramV1,
  options: { readonly playback: MusicProgramV1['playback']; readonly stem?: string },
): RenderCost {
  const base = estimateScoreCost(score, options);
  const mix = mixOf(program);
  if (!mix) return base;
  const extra = estimateMixCost(score, mix, program.playback);
  return {
    peakBytes: base.peakBytes + extra.peakBytes,
    workUnits: base.workUnits + extra.workUnits,
  };
}

export function estimateMusicStemCost(value: unknown): RenderCost {
  const document = validateMusicStemProgram(value);
  const score = expandProgram(document.music);
  return costOf(score, document.music, {
    playback: document.music.playback,
    stem: stemFilter(document),
  });
}

export function musicStemProgramHash(document: MusicStemProgramV1): Sha256 {
  return hashCanonical(document);
}

export { MUSIC_RENDERER_VERSION };
