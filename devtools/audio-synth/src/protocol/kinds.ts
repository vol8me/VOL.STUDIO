import type { RenderCache } from '../engine/renderCache';
import type { RenderQuality } from '../engine/session';
import type { RenderCost } from '../guard/budget';
import {
  estimateMusicStemCost,
  musicStemSurface,
  renderMusicStem,
  validateMusicStemProgram,
} from '../music/stem';
import { programNodeIds, surfaceOf, type RenderSurfaceV1 } from '../program/surface';
import { MUSIC_RENDERER_VERSION } from '../music/render';
import type { AudioBriefV1 } from '../program/brief';
import { estimateProgramCost, PROGRAM_RENDERER_VERSION, renderProgram } from '../program/render';
import type { SampleResolver } from '../program/samples';
import { resolveProgram } from '../program/schema';
import { ProtocolError } from './errors';

/**
 * Job türüne göre render/doğrulama dağıtıcısı. Müzik ikinci bir publish
 * kapısı AÇMAZ: kanonik kapı aynı kalır, yalnız "programı nasıl render
 * ederim" sorusu türe göre cevaplanır. Böylece kodek QA'sı, manifest ve
 * yeniden üretim kanıtı iki tür için de tek yoldan geçer.
 */
export const JOB_KINDS = ['acoustic', 'music'] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const PROGRAM_SCHEMAS: Readonly<Record<JobKind, string>> = {
  acoustic: 'AcousticProgramV1',
  music: 'MusicStemProgramV1',
};

export const RENDERER_VERSIONS: Readonly<Record<JobKind, number>> = {
  acoustic: PROGRAM_RENDERER_VERSION,
  music: MUSIC_RENDERER_VERSION,
};

export interface KindRender {
  readonly channels: Float32Array[];
  readonly sampleRate: number;
  readonly duration: number;
  readonly seed: number;
  readonly cost: RenderCost;
}

export function renderForKind(
  kind: JobKind,
  document: unknown,
  options: {
    readonly seed?: number;
    readonly samples?: SampleResolver;
    readonly quality?: RenderQuality;
    /** `null` dıştaki oturumun önbelleğini kapatır (doğrulama gerçek hesap yapar). */
    readonly cache?: RenderCache | null;
  } = {},
): KindRender {
  if (kind === 'music') {
    const rendered = renderMusicStem(document, {
      seed: options.seed,
      samples: options.samples,
      quality: options.quality,
      cache: options.cache,
    });
    return {
      channels: rendered.channels,
      sampleRate: rendered.sampleRate,
      duration: rendered.duration,
      seed: rendered.seed,
      cost: rendered.cost,
    };
  }
  const rendered = renderProgram(document, {
    seed: options.seed,
    samples: options.samples,
    quality: options.quality,
    cache: options.cache,
  });
  return {
    channels: rendered.channels,
    sampleRate: rendered.sampleRate,
    duration: rendered.duration,
    seed: rendered.seed,
    cost: rendered.cost,
  };
}

export function estimateForKind(kind: JobKind, document: unknown): RenderCost {
  return kind === 'music'
    ? estimateMusicStemCost(document)
    : estimateProgramCost(resolveProgram(document));
}

/** Program belgesini türüne göre doğrular; hatalar çağıranda protokol hatasına çevrilir. */
export function validateForKind(kind: JobKind, document: unknown): void {
  if (kind === 'music') validateMusicStemProgram(document);
  else resolveProgram(document);
}

/** Programın kullandığı düğümlerin render yüzeyi (manifest kaydı ve teşhis için). */
export function surfaceForKind(kind: JobKind, document: unknown): RenderSurfaceV1 {
  if (kind === 'music') return musicStemSurface(document);
  return surfaceOf(programNodeIds(resolveProgram(document), document));
}

/** Manifest'teki gömülü program şemasından türü okur (doğrulama kapısı için). */
export function kindOfProgramSchema(schema: unknown, label: string): JobKind {
  for (const kind of JOB_KINDS) {
    if (PROGRAM_SCHEMAS[kind] === schema) return kind;
  }
  throw new ProtocolError('invalid', `bilinmeyen program şeması: ${String(schema)}`, label);
}

/** Brief türü ile job türü aynı olmalı; müzik brief'i akustik işe giremez. */
export function assertBriefKind(kind: JobKind, brief: AudioBriefV1, label: string): void {
  if (brief.kind !== kind) {
    throw new ProtocolError('invalid', `${kind} işi ${brief.kind} brief'i almaz`, label);
  }
}
