import type { MessagePort } from 'node:worker_threads';
import { analyzeAudio } from '../analysis/report';
import { summarizeAudio, type DescriptorSummaryV1 } from '../analysis/summary';
import type { MechanicalCheckV1 } from '../analysis/checks';
import { withRenderSession, type RenderQuality } from '../engine/session';
import { renderScoreRaw, type MusicRenderV1 } from '../music/render';
import type { MusicProgramV1 } from '../music/program';
import { expandProgram } from '../music/score';
import { renderProgram, type ProgramRender } from '../program/render';
import { evaluateCandidate, type SearchCandidateV1, type SearchPlan } from '../search';
import { hashPcm, type Sha256 } from './canonical';
import { repoRenderCache } from './renderCacheStore';
import { repoSampleResolver } from './samples';

/**
 * Paralel toplu işlerin görevleri. Aynı işlev seri yolda ana iş
 * parçacığında, paralel yolda worker'da koşar; iki yolun aynı sonucu
 * vermesinin yapısal güvencesi budur. Görevler saftır: çıktıyı yalnız girdi,
 * render kalitesi ve depo içeriği belirler.
 */
export type TaskName = 'family-member' | 'search-candidate' | 'music-raw';

export interface TaskContext {
  readonly repoRoot: string;
  readonly quality: RenderQuality;
  /** Worker deponun disk önbelleğini kullansın mı (ana oturumda önbellek varsa). */
  readonly cache: boolean;
}

export interface FamilyMemberInput {
  readonly key: string;
  readonly program: unknown;
}

export interface FamilyMemberOutput {
  readonly key: string;
  readonly pcmHash: Sha256;
  readonly descriptors: DescriptorSummaryV1;
}

export interface SearchCandidateInput {
  readonly candidate: SearchPlan['candidates'][number];
  readonly filters: readonly MechanicalCheckV1[];
  /** Dinleme kopyası için PCM de dönsün mü. */
  readonly withPcm: boolean;
}

export interface SearchCandidateOutput {
  readonly result: SearchCandidateV1;
  readonly render: ProgramRender | null;
}

export interface MusicRawInput {
  readonly program: MusicProgramV1;
  readonly stem: string | null;
}

interface TaskResult {
  readonly output: unknown;
  readonly transfer: ArrayBuffer[];
}

/** Kanallar aynı tamponu paylaşabilir; transfer listesinde çift giriş klonlamayı düşürür. */
const buffersOf = (channels: readonly Float32Array[]): ArrayBuffer[] => [
  ...new Set(channels.map((channel) => channel.buffer as ArrayBuffer)),
];

function familyMember(input: FamilyMemberInput, ctx: TaskContext): TaskResult {
  const r = renderProgram(input.program, { samples: repoSampleResolver(ctx.repoRoot) });
  const report = analyzeAudio(r.channels, r.sampleRate, 'source-pcm');
  const output: FamilyMemberOutput = {
    key: input.key,
    pcmHash: hashPcm(r.channels, r.sampleRate),
    descriptors: summarizeAudio(r.channels, r.sampleRate, report),
  };
  return { output, transfer: [] };
}

function searchCandidate(input: SearchCandidateInput, ctx: TaskContext): TaskResult {
  let render: ProgramRender | null = null;
  const result = evaluateCandidate(input.candidate, input.filters, {
    samples: repoSampleResolver(ctx.repoRoot),
    ...(input.withPcm ? { onRender: (_id: string, r: ProgramRender) => (render = r) } : {}),
  });
  const kept = render as ProgramRender | null;
  const output: SearchCandidateOutput = { result, render: kept };
  return { output, transfer: kept ? buffersOf(kept.channels) : [] };
}

function musicRaw(input: MusicRawInput): TaskResult {
  const score = expandProgram(input.program);
  const output: MusicRenderV1 = renderScoreRaw(score, {
    playback: input.program.playback,
    ...(input.stem === null ? {} : { stem: input.stem }),
  });
  return { output, transfer: buffersOf(output.channels) };
}

function dispatch(name: TaskName, input: unknown, ctx: TaskContext): TaskResult {
  switch (name) {
    case 'family-member':
      return familyMember(input as FamilyMemberInput, ctx);
    case 'search-candidate':
      return searchCandidate(input as SearchCandidateInput, ctx);
    case 'music-raw':
      return musicRaw(input as MusicRawInput);
  }
}

/** Görevi etkin oturumda (seri yol) koşar. */
export function runTaskInline(name: TaskName, input: unknown, ctx: TaskContext): unknown {
  return dispatch(name, input, ctx).output;
}

/** Worker içinde: oturum bağlamdan kurulur, önbellek deponun disk katmanıdır. */
function runTaskInWorker(name: TaskName, input: unknown, ctx: TaskContext): TaskResult {
  const cache = ctx.cache ? repoRenderCache(ctx.repoRoot) : null;
  return withRenderSession({ quality: ctx.quality, cache }, () => dispatch(name, input, ctx));
}

export interface WorkerChannel {
  readonly port: MessagePort;
  readonly signal: Int32Array;
}

interface TaskRequest {
  readonly id: number;
  readonly name: TaskName;
  readonly input: unknown;
  readonly ctx: TaskContext;
}

function notify(signal: Int32Array): void {
  Atomics.add(signal, 0, 1);
  Atomics.notify(signal, 0);
}

/** Worker döngüsü: her istek tam olarak bir yanıt ve bir sinyal üretir. */
export function serveTasks({ port, signal }: WorkerChannel): void {
  port.on('message', (request: TaskRequest) => {
    try {
      const { output, transfer } = runTaskInWorker(request.name, request.input, request.ctx);
      port.postMessage({ id: request.id, ok: true, output }, transfer);
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      port.postMessage({ id: request.id, ok: false, error: { name: e.name, message: e.message } });
    } finally {
      notify(signal);
    }
  });
  port.postMessage({ ready: true });
  notify(signal);
}
