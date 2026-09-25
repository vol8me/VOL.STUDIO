import { timbreEnvelope } from '../analysis/timbre';
import type { MessagePort } from 'node:worker_threads';
import { analyzeAudio } from '../analysis/report';
import { summarizeAudio, type DescriptorSummaryV1 } from '../analysis/summary';
import { evaluateChecks, type MechanicalCheckV1 } from '../analysis/checks';
import { withRenderSession, type RenderQuality } from '../engine/session';
import type { MusicRenderV1 } from '../music/render';
import { renderMusicRaw } from '../music/stem';
import type { MusicProgramV1 } from '../music/program';
import { expandProgram } from '../music/score';
import { renderProgram, type ProgramRender } from '../program/render';
import { evaluateCandidate, type SearchCandidateV1, type SearchPlan } from '../search';
import { renderForKind, type JobKind } from './kinds';
import { hashCanonical, hashPcm, type Sha256 } from './canonical';
import { repoRenderCache } from './renderCacheStore';
import { repoSampleResolver } from './samples';

/**
 * Paralel toplu işlerin görevleri. Aynı işlev seri yolda ana iş
 * parçacığında, paralel yolda worker'da koşar; iki yolun aynı sonucu
 * vermesinin yapısal güvencesi budur. Görevler saftır: çıktıyı yalnız girdi,
 * render kalitesi ve depo içeriği belirler.
 */
export type TaskName =
  | 'family-member'
  | 'search-candidate'
  | 'music-raw'
  | 'benchmark-part'
  | 'regression-part';

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
  /** `timbre-envelope-v1`; kimlik raporu beyan edilirse kullanılır. */
  readonly timbre: number[] | null;
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

export interface BenchmarkPartInput {
  /** `görev/parça` — çıktıyı girdiye bağlayan anahtar. */
  readonly key: string;
  /** Doğrulanmış `AcousticProgramV1` belgesi. */
  readonly program: unknown;
  /** Yalnız mekanik kriterler; kodek/QA kriterleri ana iş parçacığında ölçülür. */
  readonly checks: readonly MechanicalCheckV1[];
  /** Dinleme kopyası ya da kodek ölçümü için PCM de dönsün mü. */
  readonly withPcm: boolean;
}

export interface BenchmarkPartOutput {
  readonly key: string;
  readonly programHash: Sha256;
  readonly pcmHash: Sha256;
  readonly checks: readonly {
    readonly kind: string;
    readonly pass: boolean;
    readonly measured: unknown;
    readonly reason: string | null;
  }[];
  readonly channels: Float32Array[] | null;
  readonly sampleRate: number | null;
}

export interface RegressionPartInput {
  readonly key: string;
  readonly kind: JobKind;
  readonly document: unknown;
  readonly seed: number;
  /** Kimlik değişirse delta ölçümü için kanallar da döner. */
  readonly expectedPcmHash: Sha256;
}

export interface RegressionPartOutput {
  readonly key: string;
  readonly programHash: Sha256;
  readonly pcmHash: Sha256;
  readonly channels: Float32Array[] | null;
  readonly sampleRate: number | null;
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
    timbre: timbreEnvelope(r.channels, r.sampleRate),
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

function musicRaw(input: MusicRawInput, ctx: TaskContext): TaskResult {
  const score = expandProgram(input.program);
  const output: MusicRenderV1 = renderMusicRaw(
    input.program,
    score,
    input.stem ?? undefined,
    repoSampleResolver(ctx.repoRoot),
  );
  return { output, transfer: buffersOf(output.channels) };
}

function benchmarkPart(input: BenchmarkPartInput, ctx: TaskContext): TaskResult {
  const render = renderProgram(input.program, { samples: repoSampleResolver(ctx.repoRoot) });
  const report = analyzeAudio(render.channels, render.sampleRate, 'source-pcm');
  const checks = evaluateChecks(input.checks, render, report).map((r) => ({
    kind: r.check.kind,
    pass: r.pass,
    measured: r.measured,
    reason: r.reason,
  }));
  const output: BenchmarkPartOutput = {
    key: input.key,
    programHash: hashCanonical(input.program),
    pcmHash: hashPcm(render.channels, render.sampleRate),
    checks,
    channels: input.withPcm ? render.channels : null,
    sampleRate: input.withPcm ? render.sampleRate : null,
  };
  return { output, transfer: input.withPcm ? buffersOf(render.channels) : [] };
}

function regressionPart(input: RegressionPartInput, ctx: TaskContext): TaskResult {
  const rendered = renderForKind(input.kind, input.document, {
    seed: input.seed,
    samples: repoSampleResolver(ctx.repoRoot),
  });
  const pcmHash = hashPcm(rendered.channels, rendered.sampleRate);
  const changed = pcmHash !== input.expectedPcmHash;
  const output: RegressionPartOutput = {
    key: input.key,
    programHash: hashCanonical(input.document),
    pcmHash,
    channels: changed ? rendered.channels : null,
    sampleRate: changed ? rendered.sampleRate : null,
  };
  return { output, transfer: changed ? buffersOf(rendered.channels) : [] };
}

function dispatch(name: TaskName, input: unknown, ctx: TaskContext): TaskResult {
  switch (name) {
    case 'family-member':
      return familyMember(input as FamilyMemberInput, ctx);
    case 'search-candidate':
      return searchCandidate(input as SearchCandidateInput, ctx);
    case 'music-raw':
      return musicRaw(input as MusicRawInput, ctx);
    case 'benchmark-part':
      return benchmarkPart(input as BenchmarkPartInput, ctx);
    case 'regression-part':
      return regressionPart(input as RegressionPartInput, ctx);
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
