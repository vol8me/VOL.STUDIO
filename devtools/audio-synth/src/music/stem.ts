import type { RenderCache } from '../engine/renderCache';
import { renderSession, withRenderSession, type RenderQuality } from '../kernel/session';
import { AudioParamError } from '../guard/errors';
import { checkObject } from '../guard/read';
import type { RenderCost } from '../guard/budget';
import {
  applyMastering,
  masteringPathOf,
  validateMasteringPlan,
  type MusicMasteringPlanV1,
} from './mastering';
import { surfaceOf, type RenderSurfaceV1 } from '../program/surface';
import { programInstrumentSurfaces } from './instrumentResolve';
import { estimateMixCost, renderScoreMixed, resolveMusicMix, type ResolvedMusicMix } from './mix';
import { validateMusicProgram, type MusicProgramV1 } from './program';
import {
  estimateScoreCost,
  renderScoreRaw,
  MUSIC_RENDERER_VERSION,
  type MusicRenderV1,
} from './render';
import { expandProgram, type MusicScoreV1 } from './score';
import {
  resolveSampleDecls,
  sampleAccess,
  type SampleAccess,
  type SampleResolver,
} from '../program/samples';
import { cueSegments, musicView, type MusicViewV1 } from './segments';
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
  const cue = cueSegments(music).find((s) => s.id === stem);
  if (stem !== REFERENCE_MIX_ID && !cue && !music.stems.some((s) => s.id === stem)) {
    throw new AudioParamError(
      'stem',
      'unknown-id',
      `tanımlı stem, cue segmenti ya da "${REFERENCE_MIX_ID}"`,
      stem,
    );
  }
  const mastering = validateMasteringPlan(o.mastering, 'mastering');
  const expected = cue ? 'one-shot-limited' : masteringPathOf(music.playback);
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

/** Belgenin ETKİN çalma modeli: cue segmenti tek seferlik, diğerleri programın modeli. */
export function documentPlayback(document: MusicStemProgramV1): MusicProgramV1['playback'] {
  return cueSegments(document.music).some((s) => s.id === document.stem)
    ? 'playlistOneShot'
    : document.music.playback;
}

function stemFilter(document: MusicStemProgramV1): string | undefined {
  return document.stem === REFERENCE_MIX_ID ? undefined : document.stem;
}

/** Belgeyi deterministik olarak PCM'e çevirir: aynı belge + sürüm = aynı örnekler. */
export interface MusicStemRenderOptions {
  readonly seed?: number;
  /** Sampler enstrümanlarının kayıtlarını getirir (protokol diskten, testler bellekten). */
  readonly samples?: SampleResolver;
  /** Verilmezse dıştaki render oturumunun kalitesi; o da yoksa `final`. */
  readonly quality?: RenderQuality;
  /** Ses önbelleği; `null` dıştaki oturumun önbelleğini kapatır. */
  readonly cache?: RenderCache | null;
}

export function renderMusicStem(
  value: unknown,
  options: MusicStemRenderOptions = {},
): MusicStemRenderV1 {
  return withRenderSession(
    {
      ...(options.quality ? { quality: options.quality } : {}),
      ...(options.cache !== undefined ? { cache: options.cache } : {}),
    },
    () => renderStemInSession(value, options),
  );
}

function renderStemInSession(value: unknown, options: MusicStemRenderOptions): MusicStemRenderV1 {
  const document = validateMusicStemProgram(value);
  const program =
    options.seed === undefined || options.seed === document.music.seed
      ? document.music
      : { ...document.music, seed: options.seed };
  const score = expandProgram(program);
  const render = renderMusicRaw(program, score, stemFilter(document), options.samples);
  applyMastering(render.channels, render.sampleRate, document.mastering);
  return {
    channels: render.channels,
    sampleRate: render.sampleRate,
    duration: render.durationSeconds,
    seed: program.seed,
    cost: costOf(musicView(program, score, stemFilter(document)), program),
  };
}

/**
 * Programın mastering ÖNCESİ render'ı: bus grafiği varsa grafikten, yoksa
 * doğrudan. Yayın ön denetimi, arama finalisti ve iş render'ı bu TEK işlevi
 * çağırır; ön denetimin gördüğü ses iş render'ının duyduğu sestir.
 */
export function renderMusicRaw(
  program: MusicProgramV1,
  score: MusicScoreV1,
  stem: string | undefined,
  resolver: SampleResolver | undefined,
): MusicRenderV1 {
  const samples = musicSamples(program, resolver);
  const view = musicView(program, score, stem);
  const options = {
    playback: view.playback,
    ...(view.stem ? { stem: view.stem } : {}),
    ...(samples ? { samples } : {}),
  };
  const mix = mixOf(program);
  return mix
    ? renderScoreMixed(view.score, mix, { ...options, seed: program.seed })
    : renderScoreRaw(view.score, options);
}

/**
 * Programın sampler kayıtlarına erişim. Önbellekli oturumda bütün kayıtlar
 * render'dan ÖNCE çözülür: önbellek isabeti bir kaydın diskte değiştiğini
 * gizleyemez (çözücü özeti doğrular).
 */
function musicSamples(
  program: MusicProgramV1,
  resolver: SampleResolver | undefined,
): SampleAccess | undefined {
  const decls = resolveSampleDecls(program.samples);
  const access = sampleAccess(decls, resolver);
  if (access && renderSession().cache) for (const name of decls.keys()) access(name);
  return access;
}

/**
 * Stem belgesinin render yüzeyi: mix bus'larında kullanılan düğümler ve
 * bütün şeritlerin enstrüman beyanları (paylaşılan program her stem'de aynı).
 */
export function musicStemSurface(value: unknown): RenderSurfaceV1 {
  const document = validateMusicStemProgram(value);
  const mix = mixOf(document.music);
  const ids = mix
    ? mix.buses.flatMap((bus) =>
        bus.effects.map((effect) => ({ id: effect.entry.id, version: effect.entry.version })),
      )
    : [];
  return surfaceOf(ids, programInstrumentSurfaces(document.music));
}

function mixOf(program: MusicProgramV1): ResolvedMusicMix | null {
  return program.mix
    ? resolveMusicMix(program.mix, 'mix', program.lanes, program.playback, program.sampleRate)
    : null;
}

function costOf(view: MusicViewV1, program: MusicProgramV1): RenderCost {
  const options = { playback: view.playback, ...(view.stem ? { stem: view.stem } : {}) };
  const base = estimateScoreCost(view.score, options);
  const mix = mixOf(program);
  if (!mix) return base;
  const extra = estimateMixCost(view.score, mix, view.playback);
  return {
    peakBytes: base.peakBytes + extra.peakBytes,
    workUnits: base.workUnits + extra.workUnits,
  };
}

export function estimateMusicStemCost(value: unknown): RenderCost {
  const document = validateMusicStemProgram(value);
  const score = expandProgram(document.music);
  return costOf(musicView(document.music, score, stemFilter(document)), document.music);
}

export { MUSIC_RENDERER_VERSION };
