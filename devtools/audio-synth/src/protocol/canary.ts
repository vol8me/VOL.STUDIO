import { existsSync, readdirSync } from 'node:fs';
import { evaluateChecks, validateCheck, type MechanicalCheckV1 } from '../analysis/checks';
import { analyzeAudio } from '../analysis/report';
import { AudioParamError } from '../guard/errors';
import { checkArray, checkNumber, checkObject } from '../guard/read';
import { checkBase, materialize, type ProgramBaseV1 } from '../program/dimensions';
import { renderProgram, type ProgramRender } from '../program/render';
import { writeAuditionCopy, EXPORT_ROOT } from './audition';
import { hashCanonical, hashPcm, type Sha256 } from '../kernel/canonical';
import { ProtocolError } from './errors';
import { readJsonFile, resolveInside } from './fs';
import { asProtocol } from './records';
import { repoSampleResolver } from './samples';
import type { SampleResolver } from '../program/samples';

export const CANARY_SCHEMA = 'OrganicCanaryV1';
export const CANARIES_ROOT = 'devtools/audio-synth/corpus/canaries';
export const CANARY_AUDITION_ROOT = `${EXPORT_ROOT}/canaries`;
const ID = /^[a-z][a-z0-9-]{0,47}$/;

export interface OrganicCanaryV1 {
  readonly schema: typeof CANARY_SCHEMA;
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly purpose: string;
  readonly source: ProgramBaseV1;
  readonly expectations: readonly MechanicalCheckV1[];
  readonly listeningGuide: readonly string[];
}

function text(value: unknown, path: string, max: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    throw new AudioParamError(path, 'type', `boş olmayan, en çok ${max} karakter`, value);
  }
  return value;
}

export function validateCanary(value: unknown): OrganicCanaryV1 {
  if ((value as { schema?: unknown } | null)?.schema !== CANARY_SCHEMA) {
    throw new AudioParamError(
      'schema',
      'type',
      `"${CANARY_SCHEMA}" olmalı`,
      (value as { schema?: unknown } | null)?.schema,
    );
  }
  const o = checkObject(value, '', [
    'schema',
    'id',
    'version',
    'title',
    'purpose',
    'source',
    'expectations',
    'listeningGuide',
  ]);
  if (typeof o.id !== 'string' || !ID.test(o.id))
    throw new AudioParamError('id', 'type', ID.source, o.id);
  const expectations = checkArray(o.expectations, 'expectations');
  if (expectations.length < 1)
    throw new AudioParamError('expectations', 'range', 'en az bir mekanik beklenti', 0);
  const guide = checkArray(o.listeningGuide, 'listeningGuide');
  if (guide.length < 1)
    throw new AudioParamError('listeningGuide', 'range', 'en az bir dinleme notu', 0);
  return {
    schema: CANARY_SCHEMA,
    id: o.id,
    version: checkNumber(o.version, 'version', { min: 1, integer: true }),
    title: text(o.title, 'title', 80),
    purpose: text(o.purpose, 'purpose', 400),
    source: checkBase(o.source, 'source'),
    expectations: expectations.map((e, i) => validateCheck(e, `expectations[${i}]`)),
    listeningGuide: guide.map((g, i) => text(g, `listeningGuide[${i}]`, 400)),
  };
}

function canaryFile(repoRoot: string, name: string): string {
  return resolveInside(repoRoot, `${CANARIES_ROOT}/${name}`, name);
}

/** Tanımlar ada göre sıralı; dosya adı `<id>.json` olmak zorunda. */
export function loadCanaries(repoRoot: string): OrganicCanaryV1[] {
  const dir = resolveInside(repoRoot, CANARIES_ROOT, 'canaries');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const canary = asProtocol(name, () =>
        validateCanary(readJsonFile(canaryFile(repoRoot, name), name)),
      );
      if (`${canary.id}.json` !== name)
        throw new ProtocolError('identity', `dosya adı ${canary.id}.json olmalı`, name);
      return canary;
    });
}

export interface CanaryResultV1 {
  readonly id: string;
  readonly version: number;
  readonly programHash: Sha256;
  readonly pcmHash: Sha256;
  readonly pass: boolean;
  readonly checks: readonly {
    readonly kind: string;
    readonly pass: boolean;
    readonly measured: unknown;
    readonly reason: string | null;
  }[];
}

export function runCanary(
  canary: OrganicCanaryV1,
  samples?: SampleResolver,
): {
  result: CanaryResultV1;
  render: ProgramRender;
} {
  const program = materialize(canary.source, [], {});
  const render = renderProgram(program, { samples });
  const report = analyzeAudio(render.channels, render.sampleRate, 'source-pcm');
  const checks = evaluateChecks(canary.expectations, render, report).map((r) => ({
    kind: r.check.kind,
    pass: r.pass,
    measured: r.measured,
    reason: r.reason,
  }));
  return {
    result: {
      id: canary.id,
      version: canary.version,
      programHash: hashCanonical(program),
      pcmHash: hashPcm(render.channels, render.sampleRate),
      pass: checks.every((c) => c.pass),
      checks,
    },
    render,
  };
}

/** Bütün canary'leri koşturur; `audition` ile dinleme kopyaları export/ altına. */
export function runCanaries(
  repoRoot: string,
  options: { audition?: boolean } = {},
): CanaryResultV1[] {
  const samples = repoSampleResolver(repoRoot);
  return loadCanaries(repoRoot).map((canary) => {
    const { result, render } = runCanary(canary, samples);
    if (options.audition)
      writeAuditionCopy(repoRoot, `${CANARY_AUDITION_ROOT}/${canary.id}.wav`, render);
    return result;
  });
}
