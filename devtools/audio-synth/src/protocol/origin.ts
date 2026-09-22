import { existsSync } from 'node:fs';
import { AudioParamError } from '../guard/errors';
import { checkChoice, checkNumber, checkObject, type ParamObject } from '../guard/read';
import { hashCanonical, HASH_PATTERN, type Sha256 } from './canonical';
import { readJsonFile } from './fs';
import { artifactFile, type JobLocation } from './location';

export const PROGRAM_ORIGIN_SCHEMA = 'ProgramOriginV1';

/**
 * `origin.json` — job programının NEREDEN geldiği. `AudioJobV1` şeması
 * değişmez: köken ayrı, sürümlü bir belgedir ve kendi `programHash`i ile
 * job programına bağlanır. Program elle yeniden kaydedilirse köken silinir;
 * elle değişen program kökenle uyuşmaz ve durum `stale` olur — publish bunu
 * reddeder, böylece manifest'teki program özeti yalan bir kökene işaret
 * edemez. Kökensiz (elle yazılmış) program geçerli bir yoldur.
 */
export interface SearchOriginV1 {
  readonly kind: 'search-candidate';
  readonly searchesRoot: string;
  readonly searchId: string;
  readonly specHash: Sha256;
  readonly reportHash: Sha256;
  readonly candidateId: string;
  readonly ordinal: number;
  readonly strategy: { readonly id: string; readonly version: number };
  readonly seed: number;
  readonly pcmHash: Sha256;
  readonly decision: {
    readonly by: 'human' | 'agent';
    readonly labels: readonly string[];
    readonly note: string | null;
  };
}

export interface FamilyOriginV1 {
  readonly kind: 'family-variant';
  readonly familiesRoot: string;
  readonly familyId: string;
  readonly familyHash: Sha256;
  readonly variantKey: string;
  readonly variantId: string;
}

export interface ProgramOriginV1 {
  readonly schema: typeof PROGRAM_ORIGIN_SCHEMA;
  readonly programHash: Sha256;
  readonly source: SearchOriginV1 | FamilyOriginV1;
}

function hashField(o: ParamObject, key: string, path: string): Sha256 {
  const value = o[key];
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    throw new AudioParamError(`${path}.${key}`, 'type', 'sha256 özeti', value);
  }
  return value as Sha256;
}

function textField(o: ParamObject, key: string, path: string): string {
  const value = o[key];
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
    throw new AudioParamError(`${path}.${key}`, 'type', 'boş olmayan metin', value);
  }
  return value;
}

export function validateOrigin(value: unknown): ProgramOriginV1 {
  const o = checkObject(value, 'origin', ['schema', 'programHash', 'source']);
  if (o.schema !== PROGRAM_ORIGIN_SCHEMA) {
    throw new AudioParamError('schema', 'type', `"${PROGRAM_ORIGIN_SCHEMA}" olmalı`, o.schema);
  }
  const head = checkObject(o.source, 'source', Object.keys((o.source as object) ?? {}));
  const kind = checkChoice(head.kind, 'source.kind', [
    'search-candidate',
    'family-variant',
  ] as const);
  if (kind === 'search-candidate') {
    const s = checkObject(o.source, 'source', [
      'kind',
      'searchesRoot',
      'searchId',
      'specHash',
      'reportHash',
      'candidateId',
      'ordinal',
      'strategy',
      'seed',
      'pcmHash',
      'decision',
    ]);
    const strategy = checkObject(s.strategy, 'source.strategy', ['id', 'version']);
    const decision = checkObject(s.decision, 'source.decision', ['by', 'labels', 'note']);
    for (const key of ['specHash', 'reportHash', 'pcmHash']) hashField(s, key, 'source');
    for (const key of ['searchesRoot', 'searchId', 'candidateId']) textField(s, key, 'source');
    checkNumber(s.ordinal, 'source.ordinal', { min: 0, integer: true });
    checkNumber(s.seed, 'source.seed', { min: 0, max: 0xffff_ffff, integer: true });
    textField(strategy, 'id', 'source.strategy');
    checkNumber(strategy.version, 'source.strategy.version', { min: 1, integer: true });
    checkChoice(decision.by, 'source.decision.by', ['human', 'agent'] as const);
  } else {
    const s = checkObject(o.source, 'source', [
      'kind',
      'familiesRoot',
      'familyId',
      'familyHash',
      'variantKey',
      'variantId',
    ]);
    hashField(s, 'familyHash', 'source');
    for (const key of ['familiesRoot', 'familyId', 'variantKey', 'variantId'])
      textField(s, key, 'source');
  }
  hashField(o, 'programHash', 'origin');
  return value as ProgramOriginV1;
}

export type OriginStateName = 'none' | 'valid' | 'stale' | 'corrupt';

export interface OriginState {
  readonly state: OriginStateName;
  readonly path: 'origin.json';
  readonly hash: Sha256 | null;
  readonly kind: ProgramOriginV1['source']['kind'] | null;
  readonly reason: string | null;
}

/** Kökenin job'un GÜNCEL programıyla tutarlılığı; programı olmayan job'da köken bayattır. */
export function originState(loc: JobLocation, programHash: Sha256 | null): OriginState {
  const file = artifactFile(loc, 'origin.json');
  const base = { path: 'origin.json' as const };
  if (!existsSync(file)) return { ...base, state: 'none', hash: null, kind: null, reason: null };
  let origin: ProgramOriginV1;
  let doc: unknown;
  try {
    doc = readJsonFile(file, 'origin.json');
    origin = validateOrigin(doc);
  } catch (error) {
    return { ...base, state: 'corrupt', hash: null, kind: null, reason: (error as Error).message };
  }
  const hash = hashCanonical(doc);
  const kind = origin.source.kind;
  if (origin.programHash !== programHash) {
    return {
      ...base,
      state: 'stale',
      hash,
      kind,
      reason: 'köken başka bir programa ait (program elle değişti)',
    };
  }
  return { ...base, state: 'valid', hash, kind, reason: null };
}
